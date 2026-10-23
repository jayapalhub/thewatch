// Newsletter dispatch: one issue per city per week, previewed Saturday 8 AM local to Jerome,
// sent Sunday 8 AM local to that city's subscribers through Resend, with no human step required.
import { CITIES, MAIL_ADDRESS } from "./constants.js";
import { tagLinks } from "./clicks.js";
import { loadIssueData, renderIssueHtml, suggestSubjects, profileNudgeHtml, jobsBlock, picksBlock, parseInterests } from "./newsletter.js";
import { TOPICS } from "./constants.js";
import { mondayOf, addDays } from "./dates.js";
import { shareLineHtml } from "./referrals.js";
import { isPreview, previewSkip } from "./env.js";

export const SEND_HOUR = 8;           // local time, Sunday
export const PREVIEW_HOUR = 8;        // local time, Saturday
const BATCH = 100;                    // Resend batch size
const MAX_BATCHES_PER_RUN = 30;       // stay under the per-request subrequest limit; the tick runs again in minutes

export function localNow(tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date()).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, hour: parseInt(p.hour, 10), minute: parseInt(p.minute, 10) };
}

// The issue for the week that starts on the Monday after the coming (or current) weekend.
export function upcomingWeekStart(localDate) {
  const d = new Date(localDate + "T00:00:00Z"); const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const daysToMonday = dow === 0 ? 1 : dow === 6 ? 2 : 8 - dow; // Sat -> Mon in 2, Sun -> 1, weekdays -> next Monday
  return addDays(localDate, daysToMonday);
}

export async function ensureIssue(db, city, weekStart) {
  const existing = await db.prepare("SELECT * FROM issues WHERE city=? AND week_start=?").bind(city, weekStart).first();
  if (existing) return existing;
  const last = await db.prepare("SELECT MAX(issue_number) n FROM issues WHERE city=?").bind(city).first();
  const sendAt = `${addDays(weekStart, -1)}T0${SEND_HOUR}:00`;
  await db.prepare("INSERT OR IGNORE INTO issues (issue_number, city, week_start, week_end, send_at, status) VALUES (?,?,?,?,?,'draft')")
    .bind((last.n || 0) + 1, city, weekStart, addDays(weekStart, 6), sendAt).run();
  return db.prepare("SELECT * FROM issues WHERE city=? AND week_start=?").bind(city, weekStart).first();
}

export function fromFor(city) { return `The Watch ${city.name} <watch@bettersecurity.ai>`; }
// Replies to the Sunday email go to Jerome, the same address the site's other emails use.
export function replyToFor(env) { return env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai"; }

async function resend(env, path, body) {
  if (isPreview(env)) { previewSkip("newsletter email", `${path} subject ${JSON.stringify(String(body && body.subject || "").slice(0, 80))}`); return {}; }
  const r = await fetch(`https://api.resend.com${path}`, { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`resend ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

export async function buildIssue(env, issue, city) {
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const data = await loadIssueData(env.DB, issue);
  const subject = issue.subject || suggestSubjects(data, issue)[2] || `The Watch ${city.name}: this week`;
  const html = renderIssueHtml(issue, data, siteUrl, city);
  return { data, subject, html, siteUrl };
}

function personalize(html, siteUrl, sub, ctx = {}) {
  const nudge = sub.profile_token && !sub.profile_completed_at ? profileNudgeHtml(siteUrl, sub.profile_token) : "";
  const jobs = html.includes("{{JOBS}}") && ctx.city ? jobsBlock(siteUrl, ctx.city, ctx.jobs, sub.seniority, ctx.issueId) : "";
  const picks = html.includes("{{PICKS}}") ? picksBlock(siteUrl, ctx.events, sub.interests, ctx.issueId) : "";
  const share = shareLineHtml(siteUrl, sub.ref_code); // "Share The Watch" line in the footer, with this subscriber's own link
  const unsub = `${siteUrl}/unsubscribe?t=${sub.unsub_token || ""}`;
  // Function replacers: a "$" in an event title or job must never be read as a replacement pattern like "$&".
  const out = html.replace(/\{\{SHARE\}\}/g, () => share).replace(/\{\{UNSUB\}\}/g, () => unsub).replace(/\{\{PROFILE_NUDGE\}\}/g, () => nudge).replace(/\{\{JOBS\}\}/g, () => jobs).replace(/\{\{PICKS\}\}/g, () => picks);
  // Last: every /go/ link gets this subscriber's click token, unless they turned personalization off on /profile.
  return tagLinks(out, siteUrl, sub);
}

// For previews: how many subscribers in a city have interests, and the most common ones (used as the sample).
export async function interestSample(db, citySlug) {
  const { results } = await db.prepare("SELECT interests FROM subscribers WHERE status='active' AND city=? AND interests IS NOT NULL AND interests NOT IN ('', '[]')").bind(citySlug).all();
  const counts = {}; let withInterests = 0;
  for (const r of results) { const list = parseInterests(r.interests); if (list.length) withInterests++; for (const k of list) counts[k] = (counts[k] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  return { withInterests, top, labels: top.map((k) => TOPICS[k]) };
}

// Saturday: the preview to Jerome.
export async function sendPreview(env, issue, city) {
  const { data, subject, html, siteUrl } = await buildIssue(env, issue, city);
  const { n } = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active' AND city=?").bind(city.slug).first();
  const { n: noProfile } = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active' AND city=? AND profile_completed_at IS NULL").bind(city.slug).first();
  const sample = await interestSample(env.DB, city.slug);
  const picksNote = !data.events.length ? "" : sample.withInterests
    ? ` Picked for you under the note goes to the ${sample.withInterests} subscriber${sample.withInterests === 1 ? "" : "s"} who chose interests, each matched to their own; this preview uses the most common: ${sample.labels.join(" and ")}.`
    : " Picked for you is not in this issue yet because no subscriber has chosen interests.";
  const banner = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto 18px;padding:12px 16px;border:2px solid #1FB6F0;border-radius:10px;font-size:14px;line-height:1.5;color:#0E1B2E;">
    <strong>Preview for ${city.name}.</strong> This goes to ${n} subscriber${n === 1 ? "" : "s"} on Sunday at ${SEND_HOUR}:00 AM ${city.name} time with the subject line <em>${subject.replace(/</g, "&lt;")}</em>.<br>
    To change the note, subject or picks, edit it at <a href="${siteUrl}/admin/issues/${issue.id}">${siteUrl}/admin/issues/${issue.id}</a> any time before then. To stop it, press Cancel this send on that page. If you do nothing, it goes out as shown.<br>
    ${data.events.length} event${data.events.length === 1 ? "" : "s"} this week${issue.personal_note ? "" : " <strong>(no personal note yet)</strong>"}.${picksNote} The "Two quick questions" box near the bottom only goes to the ${noProfile} who have not answered the profile questions yet.${data.jobs && data.jobs.length ? ` Hiring this week shows three of the ${data.jobs.length} live roles, matched to each subscriber's level; this preview shows the default pick.` : ""}</div>`;
  const to = env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai";
  // A city with no subscribers yet gets no preview email of its own (nineteen plus cities would mean nineteen plus
  // Saturday emails). The issue still builds, is marked, and shows up in the one Saturday digest sent by previewDigest.
  if (!issue.force_preview && n === 0) {
    const c = await env.DB.prepare("UPDATE issues SET preview_sent_at=datetime('now'), preview_skipped=1, subject=COALESCE(subject, ?), updated_at=datetime('now') WHERE id=? AND preview_sent_at IS NULL").bind(subject, issue.id).run();
    return c.meta && c.meta.changes === 1 ? { skipped: "no subscribers", events: data.events.length, subject } : { skipped: "preview already sent" };
  }
  // Claim the preview so two ticks at once cannot both send it (forced previews from the admin pass issue.force_preview).
  if (!issue.force_preview) {
    const c = await env.DB.prepare("UPDATE issues SET preview_sent_at=datetime('now') WHERE id=? AND preview_sent_at IS NULL").bind(issue.id).run();
    if (!c.meta || c.meta.changes !== 1) return { skipped: "preview already sent" };
  }
  try { await resend(env, "/emails", { from: fromFor(city), reply_to: replyToFor(env), to, subject: `[Preview, sends Sunday] ${subject}`, html: banner + personalize(html, siteUrl, { unsub_token: "preview", profile_token: "preview", ref_code: "preview", interests: sample.top }, { jobs: data.jobs, events: data.events, city, issueId: issue.id }) }); }
  catch (e) { if (!issue.force_preview) await env.DB.prepare("UPDATE issues SET preview_sent_at=NULL WHERE id=?").bind(issue.id).run(); throw e; }
  await env.DB.prepare("UPDATE issues SET subject=COALESCE(subject, ?), preview_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(subject, issue.id).run();
  return { to, subject, subscribers: n };
}

// Sunday: send to subscribers. Safe to run from several places at once (the cron, page views, Send now):
// every batch is claimed in the database before it goes out, so no subscriber can be sent the issue twice, and
// Resend gets an idempotency key per batch as a second guard. The HTML is built once, on the first run, and every
// later run reuses it so the whole list (and the archive) get the same issue. Cancel stops it before the next batch.
async function resendBatch(env, emails, key) {
  if (isPreview(env)) { previewSkip("newsletter batch", `${emails.length} emails, key ${key}`); return; }
  const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(emails) });
  const text = await r.text();
  if (!r.ok) throw new Error(`resend ${r.status}: ${text.slice(0, 300)}`);
}

export async function dispatchIssue(env, issue, city) {
  const db = env.DB;
  if (issue.status === "cancelled" || issue.status === "sent") return { skipped: issue.status };
  if (issue.status !== "sending") {
    const { data, subject, html } = await buildIssue(env, issue, city);
    // Only one run moves the issue from draft (or cancelled, for Send now) to sending and stores the HTML.
    await db.prepare("UPDATE issues SET status='sending', subject=?, dispatched_at=COALESCE(dispatched_at, datetime('now')), generated_html=?, updated_at=datetime('now') WHERE id=? AND status IN ('draft','cancelled')").bind(subject, html, issue.id).run();
  }
  issue = await db.prepare("SELECT * FROM issues WHERE id=?").bind(issue.id).first();
  if (!issue || issue.status !== "sending" || !issue.generated_html) return { skipped: issue ? issue.status : "missing" };
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const data = await loadIssueData(db, issue); // for the per subscriber blocks (jobs, picks); the main HTML is the stored copy
  const ctx = { jobs: data.jobs, events: data.events, city, issueId: issue.id };
  const html = issue.generated_html, subject = issue.subject;
  let lastId = issue.last_sent_subscriber_id || 0, sent = 0, batches = 0;
  while (batches < MAX_BATCHES_PER_RUN) {
    const { results } = await db.prepare("SELECT id, email, unsub_token, profile_token, ref_code, profile_completed_at, seniority, interests, personalize, click_token FROM subscribers WHERE status='active' AND city=? AND id>? ORDER BY id LIMIT ?").bind(city.slug, lastId, BATCH).all();
    if (!results.length) {
      await db.prepare("UPDATE issues SET status='sent', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='sending' AND last_sent_subscriber_id=?").bind(issue.id, lastId).run();
      return { done: true, sent };
    }
    const nextId = results[results.length - 1].id;
    // Claim this batch: only the run that moves the pointer from lastId to nextId sends it. A cancelled issue claims nothing.
    const claim = await db.prepare("UPDATE issues SET last_sent_subscriber_id=?, sent_count=sent_count+?, updated_at=datetime('now') WHERE id=? AND status='sending' AND COALESCE(last_sent_subscriber_id,0)=?").bind(nextId, results.length, issue.id, lastId).run();
    if (!claim.meta || claim.meta.changes !== 1) return { done: false, sent, yielded: true }; // another run has it, or it was cancelled
    const emails = results.map((s) => ({
      from: fromFor(city), reply_to: replyToFor(env), to: s.email, subject, html: personalize(html, siteUrl, s, ctx),
      headers: { "List-Unsubscribe": `<${siteUrl}/unsubscribe?t=${s.unsub_token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "issue", value: String(issue.id) }, { name: "city", value: city.slug }],
    }));
    try { await resendBatch(env, emails, `issue-${issue.id}-after-${lastId}`); }
    catch (e) {
      // Give the batch back so the next tick retries it (the idempotency key stops a double send if Resend did take it).
      await db.prepare("UPDATE issues SET last_sent_subscriber_id=?, sent_count=sent_count-?, send_error=?, updated_at=datetime('now') WHERE id=? AND last_sent_subscriber_id=?").bind(lastId, results.length, String(e.message).slice(0, 300), issue.id, nextId).run();
      return { error: String(e.message), sent };
    }
    lastId = nextId; sent += results.length; batches++;
    await db.prepare("UPDATE issues SET send_error=NULL WHERE id=? AND send_error IS NOT NULL").bind(issue.id).run();
  }
  return { done: false, sent };
}

// Saturday digest: one email listing the cities whose preview was skipped for lack of subscribers, sent once per week
// after the last time zone (Pacific) has passed the preview hour, so every city's issue has been built.
export async function previewDigest(env, weekStart) {
  const db = env.DB;
  const { results } = await db.prepare("SELECT i.id, i.city, i.subject, (SELECT COUNT(*) FROM events e WHERE e.city=i.city AND e.status='published' AND substr(e.start_at,1,10) BETWEEN i.week_start AND date(i.week_start,'+6 days')) n FROM issues i WHERE i.week_start=? AND i.preview_skipped=1 ORDER BY i.city").bind(weekStart).all();
  if (!results.length) return { skipped: "nothing to digest" };
  const claim = await db.prepare("INSERT OR IGNORE INTO weekend_digests (week_start) VALUES (?)").bind(weekStart).run();
  if (!claim.meta || claim.meta.changes !== 1) return { skipped: "digest already sent" };
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const rows = results.map((r) => { const c = CITIES[r.city] || { name: r.city }; return `<tr><td style="padding:6px 10px 6px 0;"><a href="${siteUrl}/admin/issues/${r.id}">${c.name}</a></td><td style="padding:6px 10px;">${r.n} event${r.n === 1 ? "" : "s"}</td><td style="padding:6px 0;color:#555;">${String(r.subject || "").replace(/</g, "&lt;")}</td></tr>`; }).join("");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;font-size:14px;line-height:1.5;color:#0E1B2E;">
    <p><strong>Saturday digest.</strong> These ${results.length} cities have no subscribers yet, so their issues were built and archived without a preview email. Each goes out Sunday at ${SEND_HOUR}:00 AM local time to nobody, and lands in the archive. Open any one to edit it before then.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    <p style="color:#555;">Cities with subscribers got their own preview as usual.</p></div>`;
  try { await resend(env, "/emails", { from: "The Watch <watch@bettersecurity.ai>", reply_to: replyToFor(env), to: env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai", subject: `[Saturday digest] ${results.length} city issues built, no subscribers yet`, html }); }
  catch (e) { await db.prepare("DELETE FROM weekend_digests WHERE week_start=?").bind(weekStart).run(); throw e; }
  await db.prepare("UPDATE weekend_digests SET body=? WHERE week_start=?").bind(results.map((r) => r.city).join(","), weekStart).run();
  return { sent: results.length };
}

// Called every few minutes on weekends (cron) and lazily from page views. Idempotent.
export async function newsletterTick(env) {
  const out = [];
  for (const city of Object.values(CITIES)) {
    if (city.newsletter !== "sunday") continue;
    const now = localNow(city.timezone);
    const weekStart = upcomingWeekStart(now.date);
    if (now.weekday === "Sat" && now.hour >= PREVIEW_HOUR) {
      const issue = await ensureIssue(env.DB, city.slug, weekStart);
      if (!issue.preview_sent_at && issue.status === "draft") { try { out.push({ city: city.slug, preview: await sendPreview(env, issue, city) }); } catch (e) { out.push({ city: city.slug, error: String(e.message) }); } }
    }
    if (now.weekday === "Sun" && now.hour >= SEND_HOUR && now.hour < 13) {
      const issue = await ensureIssue(env.DB, city.slug, weekStart);
      if (["draft", "sending"].includes(issue.status)) { try { out.push({ city: city.slug, send: await dispatchIssue(env, issue, city) }); } catch (e) { out.push({ city: city.slug, error: String(e.message) }); } }
    }
  }
  // After the loop, so the Pacific cities (the last zone) are marked before the digest is composed.
  const pacific = localNow("America/Los_Angeles");
  if (pacific.weekday === "Sat" && pacific.hour >= PREVIEW_HOUR) { try { out.push({ digest: await previewDigest(env, upcomingWeekStart(pacific.date)) }); } catch (e) { out.push({ digest: "error", error: String(e.message) }); } }
  return out;
}

let lastLazy = 0;
export function lazyNewsletterTick(env, waitUntil) {
  if (isPreview(env)) return;
  const now = Date.now(); const dow = new Date().getUTCDay();
  if (dow === 2 || dow === 3 || dow === 4) return; // Friday to Monday UTC covers Saturday and Sunday mornings in every zone
  if (now - lastLazy < 300000) return;
  lastLazy = now;
  const p = newsletterTick(env).catch(() => {});
  if (waitUntil) waitUntil(p);
}
