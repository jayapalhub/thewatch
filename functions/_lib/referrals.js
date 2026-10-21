// Referrals. Every subscriber has a public share link /r/<ref_code>. Visiting it remembers the code in a cookie
// for 30 days and lands on the subscribe page for the referrer's city; whichever signup form the visitor then uses
// records referred_by on the new row (existing subscribers are never re-attributed). The referrer gets one thank you
// email at 3 referrals and one at 10. No other rewards.
// ref_code is deliberately not the profile_token: that token opens /profile and /cpe and must stay private.
import { sendEmail, emailShell } from "./integrations.js";
import { CITIES, DEFAULT_CITY } from "./constants.js";

export const REF_COOKIE = "watch_ref";
export const THANK_LEVELS = [3, 10];
const CODE_RE = /^[a-z0-9]{6,32}$/;
const DAYS_30 = 2592000;

export function validCode(c) { return typeof c === "string" && CODE_RE.test(c); }

export function refCookie(code) { return `${REF_COOKIE}=${code}; Path=/; Max-Age=${DAYS_30}; HttpOnly; Secure; SameSite=Lax`; }
export function clearRefCookie() { return `${REF_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }

export function refCodeFromRequest(request) {
  const m = ((request && request.headers.get("Cookie")) || "").match(/(?:^|;\s*)watch_ref=([a-z0-9]{6,32})/);
  return m ? m[1] : null;
}

export function shareUrl(siteUrl, code) { return `${siteUrl}/r/${code}`; }

export async function subscriberByRefCode(db, code) {
  if (!validCode(code)) return null;
  return db.prepare("SELECT id, email, status, city FROM subscribers WHERE ref_code=?").bind(code).first();
}

// The referrer id for a signup, or null. Ignores unknown codes and self referral.
export async function referrerFor(db, request, email) {
  const code = refCodeFromRequest(request);
  if (!code) return null;
  try {
    const r = await subscriberByRefCode(db, code);
    if (!r || (email && r.email.toLowerCase() === String(email).toLowerCase())) return null;
    return r.id;
  } catch { return null; } // column missing before the migration
}

export async function referralCount(db, id) {
  const r = await db.prepare("SELECT COUNT(*) n FROM subscribers WHERE referred_by=? AND status='active'").bind(id).first();
  return (r && r.n) || 0;
}

// The "Share The Watch" line in the Sunday email footer, filled per subscriber at send time ({{SHARE}}).
export const SHARE_SLOT = "{{SHARE}}";
export function shareLineHtml(siteUrl, code, color = "#1B4A8A") {
  if (!code) return "";
  const url = shareUrl(siteUrl, code);
  return `<strong>Share The Watch.</strong> Know someone who should be getting this? Send them your link: <a href="${url}" style="color:${color};">${url.replace(/^https?:\/\//, "")}</a><br>`;
}

export function thankYouEmail(siteUrl, sub, n, level) {
  const city = CITIES[sub.city] || CITIES[DEFAULT_CITY];
  const url = shareUrl(siteUrl, sub.ref_code);
  const hi = `<p>Hi${sub.first_name ? " " + String(sub.first_name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ""},</p>`;
  const body = level >= 10
    ? `<p>Your link has now brought ${n === 10 ? "ten" : n} people to The Watch. A local calendar only works when people who care about the community pass it along, and you have done exactly that, ten times over. I wanted to thank you personally.</p>
       <p>If there is an event that should be on the calendar, an organizer I should meet, or something you want more of in the Sunday email, reply to this note. It comes straight to me.</p>`
    : `<p>Three people have joined The Watch from your link. That is how a local calendar grows: one person telling a few colleagues it is worth their Sunday morning. I wanted to say thank you.</p>
       <p>If there is an event that should be on the calendar or something you want more of in the email, reply to this note. It comes straight to me.</p>`;
  const inner = `${hi}${body}<p style="font-size:14px;color:#5B6B80;">Your link keeps working: <a href="${url}" style="color:#1B4A8A;">${url.replace(/^https?:\/\//, "")}</a></p>`;
  return { subject: level >= 10 ? "Ten people joined The Watch from your link" : "Thank you for sharing The Watch", html: emailShell("Thank you for sharing The Watch", inner, city) };
}

// Send the thank you this referrer has earned, if any. Claims the level before sending so two signups at the same
// moment cannot send twice; puts it back if the send fails so the hourly sweep retries.
export async function maybeThank(env, referrerId) {
  const db = env.DB;
  const sub = await db.prepare("SELECT id, email, first_name, status, city, ref_code, referral_thanked_level, referral_thanked_at FROM subscribers WHERE id=?").bind(referrerId).first();
  if (!sub || sub.status !== "active" || !sub.ref_code) return { sent: false };
  const n = await referralCount(db, sub.id);
  const level = [...THANK_LEVELS].reverse().find((l) => n >= l) || 0;
  const prev = sub.referral_thanked_level || 0;
  if (level <= prev) return { sent: false, n };
  const claim = await db.prepare("UPDATE subscribers SET referral_thanked_level=?, referral_thanked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND referral_thanked_level=?").bind(level, sub.id, prev).run();
  if (!claim.meta || claim.meta.changes !== 1) return { sent: false, n };
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const city = CITIES[sub.city] || CITIES[DEFAULT_CITY];
  const msg = thankYouEmail(siteUrl, sub, n, level);
  const res = await sendEmail(env, { to: sub.email, from: `The Watch ${city.name} <watch@bettersecurity.ai>`, subject: msg.subject, html: msg.html });
  if (!res.ok) {
    await db.prepare("UPDATE subscribers SET referral_thanked_level=?, referral_thanked_at=? WHERE id=? AND referral_thanked_level=?").bind(prev, sub.referral_thanked_at, sub.id, level).run();
    return { sent: false, n, failed: true };
  }
  return { sent: true, n, level };
}

// Hourly sweep from the cron: catches any thank you that failed to send at signup time.
export async function runReferralThanks(env, { limit = 20 } = {}) {
  const out = { sent: 0, failed: 0 };
  try {
    const { results } = await env.DB.prepare(`SELECT s.id FROM subscribers s
      JOIN (SELECT referred_by id, COUNT(*) n FROM subscribers WHERE status='active' AND referred_by IS NOT NULL GROUP BY referred_by) r ON r.id = s.id
      WHERE s.status='active' AND ((r.n >= 10 AND s.referral_thanked_level < 10) OR (r.n >= 3 AND s.referral_thanked_level < 3)) LIMIT ?`).bind(limit).all();
    for (const r of results) { const x = await maybeThank(env, r.id); if (x.sent) out.sent++; else if (x.failed) out.failed++; }
  } catch (e) { out.error = e && e.message; }
  return out;
}
