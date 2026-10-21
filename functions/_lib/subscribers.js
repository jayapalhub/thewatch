import { list, token, sha256 } from "./html.js";
import { sendEmail, welcomeEmail } from "./integrations.js";
import { CONSENT_VERSION, CITIES, DEFAULT_CITY } from "./constants.js";

// Insert or update a subscriber in D1, then mirror to Beehiiv.
// Returns the subscriber row (with profile_token) so callers can link to /profile.
export async function upsertSubscriber(db, env, { email, source, tags = [], request, sendWelcome = true, extra = {} }) {
  email = email.toLowerCase();
  const ip = request ? (request.headers.get("cf-connecting-ip") || "") : "";
  const ipHash = ip ? (await sha256(ip)).slice(0, 16) : null;
  const existing = await db.prepare("SELECT * FROM subscribers WHERE email=?").bind(email).first();
  const now = new Date().toISOString();
  const m = /^calendar:([a-z]+)$/.exec(source || ""); const city = m && CITIES[m[1]] ? m[1] : null;
  let row;
  if (existing) {
    const mergedTags = Array.from(new Set([...list(existing.tags), ...tags]));
    const status = existing.status === "unsubscribed" ? "active" : existing.status; // re-subscribing by submitting a form is explicit consent
    const profileToken = existing.profile_token || token();
    await db.prepare("UPDATE subscribers SET tags=?, status=?, profile_token=?, consented_at=COALESCE(consented_at, ?), consent_text_version=COALESCE(consent_text_version, ?), city=COALESCE(?, city, ?), unsub_token=COALESCE(unsub_token, ?), updated_at=? WHERE id=?")
      .bind(JSON.stringify(mergedTags), status, profileToken, now, CONSENT_VERSION, city, DEFAULT_CITY, token(), now, existing.id).run();
    row = { ...existing, tags: mergedTags, status, profile_token: profileToken };
  } else {
    const profileToken = token();
    const res = await db.prepare("INSERT INTO subscribers (email, status, source, consent_text_version, consented_at, ip_hash, tags, profile_token, company, first_name, city, unsub_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(email, "active", source || null, CONSENT_VERSION, now, ipHash, JSON.stringify(tags), profileToken, extra.company || null, extra.first_name || null, city || DEFAULT_CITY, token()).run();
    row = { id: res.meta.last_row_id, email, status: "active", source, tags, profile_token: profileToken };
  }
  // Welcome email from the site (new subscribers and people coming back after unsubscribing).
  const rejoined = existing && existing.status === "unsubscribed";
  if (sendWelcome && (!existing || rejoined)) {
    const full = await db.prepare("SELECT * FROM subscribers WHERE id=?").bind(row.id).first();
    const c = CITIES[full.city] || CITIES[DEFAULT_CITY];
    const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
    await sendEmail(env, { to: email, from: `The Watch ${c.name} <watch@bettersecurity.ai>`, subject: `Welcome to The Watch ${c.name}`, html: welcomeEmail(siteUrl, full, c), headers: { "List-Unsubscribe": `<${siteUrl}/unsubscribe?t=${full.unsub_token}>` } });
  }
  return row;
}

export async function addInterest(db, subscriberId, eventKey) {
  await db.prepare("INSERT OR IGNORE INTO event_interest (subscriber_id, event_key) VALUES (?,?)").bind(subscriberId, eventKey).run();
}

// Simple per-IP rate limit using D1 (good enough for a community site).
export async function rateLimited(db, request, bucket, max = 10, windowMin = 60) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const key = (await sha256(bucket + ":" + ip)).slice(0, 24);
    await db.prepare("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT, at TEXT)").run();
    const since = new Date(Date.now() - windowMin * 60000).toISOString();
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE k=? AND at > ?").bind(key, since).first();
    if (n >= max) return true;
    await db.prepare("INSERT INTO rate_limits (k, at) VALUES (?, ?)").bind(key, new Date().toISOString()).run();
    if (Math.random() < 0.05) await db.prepare("DELETE FROM rate_limits WHERE at < ?").bind(since).run();
    return false;
  } catch (e) { console.error("rate limit check failed", e && e.message); return false; }
}
