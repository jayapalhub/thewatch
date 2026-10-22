import { json } from "../../_lib/html.js";

// POST /api/newsletter/resend-webhook: Resend tells us when an email bounces or someone marks it as spam.
// Resend signs each delivery (Svix headers); the secret lives in the RESEND_WEBHOOK_SECRET env var and is never
// logged. A permanent bounce marks the subscriber 'bounced' so the Sunday email stops going to a dead address; a
// complaint marks them 'unsubscribed'; everything else is recorded only. Each event is applied once, keyed on the
// Svix message id, so a redelivery changes nothing. Nothing here sends mail.

const TOLERANCE_S = 5 * 60;

function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromB64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// Svix scheme: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the base64 secret after "whsec_", base64 encoded,
// compared against each "v1,<sig>" entry in the signature header.
export async function verifySvix(secret, { id, timestamp, signature, body }) {
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey("raw", fromB64(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = b64(new Uint8Array(mac));
  return signature.split(/\s+/).some((part) => { const [v, sig] = part.split(","); return v === "v1" && sig && timingSafeEqual(sig, expected); });
}

// What to do with one event. Returns { action, email, detail } without touching the database.
export function classify(evt) {
  const type = String(evt && evt.type || "");
  const data = (evt && evt.data) || {};
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const email = String(to || "").trim().toLowerCase();
  if (type === "email.bounced") {
    const b = data.bounce || {};
    const permanent = /permanent/i.test(b.type || "") || /suppressed|undetermined/i.test(b.type || "");
    return { action: permanent ? "bounced" : "logged", email, detail: [b.type, b.subType, b.message].filter(Boolean).join(": ").slice(0, 500) };
  }
  if (type === "email.complained") return { action: "unsubscribed", email, detail: "complaint" };
  return { action: "logged", email, detail: "" };
}

export async function applyEvent(db, { providerId, type, email, emailId, subject, action, detail }) {
  // Record first; the UNIQUE provider id makes a redelivery a no-op.
  const sub = email ? await db.prepare("SELECT id, status FROM subscribers WHERE email=?").bind(email).first() : null;
  const ins = await db.prepare("INSERT OR IGNORE INTO email_events (provider_id, type, email, subscriber_id, email_id, subject, detail, action) VALUES (?,?,?,?,?,?,?,?)")
    .bind(providerId || null, type, email || null, sub ? sub.id : null, emailId || null, subject || null, detail || null, action).run();
  if (!ins.meta || !ins.meta.changes) return { duplicate: true };
  if (!sub || action === "logged") return { subscriber: sub ? sub.id : null, changed: false };
  if (action === "bounced" && sub.status === "active") {
    await db.prepare("UPDATE subscribers SET status='bounced', notes=COALESCE(notes || char(10), '') || ?, updated_at=datetime('now') WHERE id=? AND status='active'").bind(`Bounced ${new Date().toISOString().slice(0, 10)}: ${detail || "permanent"}`, sub.id).run();
    return { subscriber: sub.id, changed: true };
  }
  if (action === "unsubscribed" && sub.status !== "unsubscribed") {
    await db.prepare("UPDATE subscribers SET status='unsubscribed', notes=COALESCE(notes || char(10), '') || ?, updated_at=datetime('now') WHERE id=?").bind(`Marked as spam ${new Date().toISOString().slice(0, 10)}; do not re-add without their say so.`, sub.id).run();
    return { subscriber: sub.id, changed: true };
  }
  return { subscriber: sub.id, changed: false };
}

export async function onRequestPost({ request, env }) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return json({ success: false, error: "webhook_not_configured" }, 503);
  const body = await request.text();
  const ok = await verifySvix(secret, { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"), body });
  if (!ok) return json({ success: false, error: "bad_signature" }, 401);
  let evt; try { evt = JSON.parse(body); } catch { return json({ success: false, error: "bad_json" }, 400); }
  const c = classify(evt);
  const data = (evt && evt.data) || {};
  const r = await applyEvent(env.DB, { providerId: request.headers.get("svix-id"), type: String(evt.type || "unknown"), email: c.email, emailId: data.email_id, subject: data.subject, action: c.action, detail: c.detail });
  return json({ success: true, action: c.action, ...r });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
