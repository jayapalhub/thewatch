// Per subscriber click attribution for the Sunday email.
// Each subscriber has a click_token that is separate from the profile and unsubscribe tokens, so a link that leaves
// the site never carries anything that could open the profile or the CPE log. The token goes on email links as &s=...
// only when the subscriber has personalization on; the /go redirects resolve it here and store the subscriber id
// on the click row. Anyone with personalization off gets plain links and is never resolved, even if an old token
// is still in a forwarded email.

export const CLICK_PARAM = "s";

// Append the token to every /go/ link in a rendered email. Links are rebuilt per subscriber anyway (jobs, picks,
// unsubscribe), so this runs on the final HTML for one person. A link with a query string gets &s=, one without gets ?s=.
export function tagLinks(html, siteUrl, sub) {
  if (!sub || !sub.click_token || Number(sub.personalize === undefined ? 1 : sub.personalize) === 0) return html;
  const base = `${siteUrl}/go/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(href="${base}[^"]*)"`, "g");
  const tok = encodeURIComponent(sub.click_token);
  return html.replace(re, (m, pre) => `${pre}${pre.includes("?") ? "&" : "?"}${CLICK_PARAM}=${tok}"`);
}

// From a /go request, the subscriber id the click belongs to, or null.
export async function clickSubscriberId(db, request) {
  let tok = "";
  try { tok = new URL(request.url).searchParams.get(CLICK_PARAM) || ""; } catch { return null; }
  tok = String(tok).replace(/[^a-z0-9]/gi, "").slice(0, 40);
  if (!tok) return null;
  try {
    const row = await db.prepare("SELECT id FROM subscribers WHERE click_token=? AND personalize=1 AND status='active'").bind(tok).first();
    return row ? row.id : null;
  } catch { return null; }
}

// ---------- what counts as a click ----------
// Every /go request is redirected and stored; recordClick decides whether it counts. Not counted: HEAD requests and
// prefetches, user agents of link scanners and preview bots, a click within two seconds of the issue going out, and any
// client that also requested the hidden trap link in the same issue. A second click on the same listing by the same
// subscriber (or the same salted IP hash when nobody is signed in) on the same day is a duplicate. Both are kept with
// a flag so the numbers can be audited; the admin page counts rows with is_bot=0 and is_dup=0.
import { sha256 } from "./html.js";

export const BOT_UA = /safelinks|microsoft office|outlook-|proofpoint|mimecast|barracuda|googleimageproxy|google-safety|google-site-verification|google web preview|googlebot|bingbot|slackbot|linkedinbot|facebookexternalhit|twitterbot|python-requests|python-urllib|\bcurl\//i;
export const BOT_UA_EXTRA = /go-http-client|headlesschrome|phantomjs|wget\/|axios\/|node-fetch|okhttp|java\/|apache-httpclient|libwww-perl|\bbot\b|crawler|spider|scanner|preview|monitor/i;
export const FRESH_SECONDS = 2;

// Why a request is not a person, or null when it looks like one. Headers and method only; the issue timing and the
// trap are checked against the database in recordClick.
export function classifyRequest(request) {
  if (request.method === "HEAD") return "head";
  const h = (k) => (request.headers.get(k) || "").toLowerCase();
  if (h("purpose") === "prefetch" || h("sec-purpose").includes("prefetch") || h("x-moz") === "prefetch" || h("x-purpose") === "preview") return "prefetch";
  const ua = request.headers.get("user-agent") || "";
  if (BOT_UA.test(ua) || BOT_UA_EXTRA.test(ua)) return "agent";
  return null;
}

// A salted hash of the client address, 16 hex characters. The salt is the CLICK_SALT secret; the raw address is never
// stored and without the salt the hash cannot be turned back into one.
export async function ipHash(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  if (!ip) return null;
  return (await sha256(`${(env && env.CLICK_SALT) || "thewatch"}|${ip.split(",")[0].trim()}`)).slice(0, 16);
}
const clientOf = async (request, env) => ({ uaHash: (await sha256(request.headers.get("user-agent") || "")).slice(0, 16), ipHash: await ipHash(request, env) });

// Stores one /go request. opts: listing (event:12, job:5, sponsor:3, issue:9), target (register, page, job, sponsor),
// targetUrl, and the ids and city the counts group by. Returns { counted, reason } where reason is the bot reason,
// "duplicate", or null when the click counts.
export async function recordClick(db, env, request, { listing, target, targetUrl, eventId = null, issueId = null, city = null, jobId = null, sponsorId = null }) {
  const { uaHash, ipHash: ip } = await clientOf(request, env);
  const subscriberId = await clickSubscriberId(db, request);
  let reason = classifyRequest(request);
  if (!reason && issueId) {
    try {
      // Within two seconds of the send, or from a client that opened the trap link in this issue.
      const row = await db.prepare("SELECT dispatched_at FROM issues WHERE id=?").bind(issueId).first();
      const sent = row && row.dispatched_at ? Date.parse(String(row.dispatched_at).replace(" ", "T") + (String(row.dispatched_at).endsWith("Z") ? "" : "Z")) : NaN;
      if (!isNaN(sent) && Math.abs(Date.now() - sent) <= FRESH_SECONDS * 1000) reason = "fresh";
      if (!reason && ip) {
        const trap = await db.prepare("SELECT id FROM link_clicks WHERE issue_id=? AND target='trap' AND ua_hash=? AND ip_hash=? LIMIT 1").bind(issueId, uaHash, ip).first();
        if (trap) reason = "trap";
      }
    } catch { /* an issue lookup failing never loses the click */ }
  }
  let dup = 0;
  if (!reason && listing) {
    try {
      const prior = subscriberId
        ? await db.prepare("SELECT id FROM link_clicks WHERE listing=? AND is_bot=0 AND is_dup=0 AND subscriber_id=? AND clicked_at >= date('now') LIMIT 1").bind(listing, subscriberId).first()
        : ip ? await db.prepare("SELECT id FROM link_clicks WHERE listing=? AND is_bot=0 AND is_dup=0 AND subscriber_id IS NULL AND ip_hash=? AND clicked_at >= date('now') LIMIT 1").bind(listing, ip).first() : null;
      if (prior) dup = 1;
    } catch { /* the columns arrive with migration 0029; until then every click counts */ }
  }
  const ref = (request.headers.get("referer") || "").slice(0, 300);
  await db.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash, subscriber_id, ip_hash, listing, city, job_id, sponsor_id, is_bot, bot_reason, is_dup) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(eventId, issueId, target, targetUrl, ref, uaHash, subscriberId, ip, listing || null, city, jobId, sponsorId, reason ? 1 : 0, reason, dup).run();
  return { counted: !reason && !dup, reason: reason || (dup ? "duplicate" : null) };
}

// The hidden trap link in the Sunday email. Nobody sees it, so whoever requests it is a scanner: the request is stored
// as a bot and every other click from the same client in the same issue is flagged too, before and after.
export const TRAP_PATH = "/go/trap";
export function trapLink(siteUrl, issueId) {
  return `<a href="${siteUrl}${TRAP_PATH}?i=${issueId || ""}" style="display:none!important;visibility:hidden;opacity:0;font-size:0;line-height:0;max-height:0;overflow:hidden" aria-hidden="true" tabindex="-1"></a>`;
}
export async function recordTrap(db, env, request, issueId) {
  const { uaHash, ipHash: ip } = await clientOf(request, env);
  const subscriberId = await clickSubscriberId(db, request);
  await db.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash, subscriber_id, ip_hash, listing, is_bot, bot_reason, is_dup) VALUES (NULL,?,'trap',NULL,?,?,?,?,NULL,1,'trap',0)")
    .bind(issueId, (request.headers.get("referer") || "").slice(0, 300), uaHash, subscriberId, ip).run();
  if (issueId && ip) await db.prepare("UPDATE link_clicks SET is_bot=1, bot_reason='trap' WHERE issue_id=? AND ua_hash=? AND ip_hash=? AND is_bot=0").bind(issueId, uaHash, ip).run();
}
