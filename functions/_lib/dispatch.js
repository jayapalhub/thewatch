// Newsletter dispatch: one issue per city per week, previewed Saturday 8 AM local to Jerome,
// sent Sunday 8 AM local to that city's subscribers through Resend, with no human step required.
import { CITIES, MAIL_ADDRESS } from "./constants.js";
import { loadIssueData, renderIssueHtml, suggestSubjects, profileNudgeHtml } from "./newsletter.js";
import { mondayOf, addDays } from "./dates.js";

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

async function resend(env, path, body) {
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

function personalize(html, siteUrl, sub) {
  const nudge = sub.profile_token && !sub.profile_completed_at ? profileNudgeHtml(siteUrl, sub.profile_token) : "";
  return html.replace(/\{\{UNSUB\}\}/g, `${siteUrl}/unsubscribe?t=${sub.unsub_token || ""}`).replace(/\{\{PROFILE_NUDGE\}\}/g, nudge);
}

// Saturday: the preview to Jerome.
export async function sendPreview(env, issue, city) {
  const { data, subject, html, siteUrl } = await buildIssue(env, issue, city);
  const { n } = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active' AND city=?").bind(city.slug).first();
  const { n: noProfile } = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active' AND city=? AND profile_completed_at IS NULL").bind(city.slug).first();
  const banner = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto 18px;padding:12px 16px;border:2px solid #1FB6F0;border-radius:10px;font-size:14px;line-height:1.5;color:#0E1B2E;">
    <strong>Preview for ${city.name}.</strong> This goes to ${n} subscriber${n === 1 ? "" : "s"} on Sunday at ${SEND_HOUR}:00 AM ${city.name} time with the subject line <em>${subject.replace(/</g, "&lt;")}</em>.<br>
    To change the note, subject or picks, edit it at <a href="${siteUrl}/admin/issues/${issue.id}">${siteUrl}/admin/issues/${issue.id}</a> any time before then. To stop it, press Cancel this send on that page. If you do nothing, it goes out as shown.<br>
    ${data.events.length} event${data.events.length === 1 ? "" : "s"} this week${issue.personal_note ? "" : " <strong>(no personal note yet)</strong>"}. The "Two quick questions" box near the bottom only goes to the ${noProfile} who have not answered the profile questions yet.</div>`;
  const to = env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai";
  await resend(env, "/emails", { from: fromFor(city), to, subject: `[Preview, sends Sunday] ${subject}`, html: banner + personalize(html, siteUrl, { unsub_token: "preview", profile_token: "preview" }) });
  await env.DB.prepare("UPDATE issues SET subject=COALESCE(subject, ?), preview_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(subject, issue.id).run();
  return { to, subject, subscribers: n };
}

// Sunday: send to subscribers. Resumable: each run sends up to MAX_BATCHES_PER_RUN batches and records progress.
export async function dispatchIssue(env, issue, city) {
  if (issue.status === "cancelled" || issue.status === "sent") return { skipped: issue.status };
  const { subject, html, siteUrl } = await buildIssue(env, issue, city);
  if (issue.status !== "sending") await env.DB.prepare("UPDATE issues SET status='sending', subject=?, dispatched_at=COALESCE(dispatched_at, datetime('now')), generated_html=?, updated_at=datetime('now') WHERE id=?").bind(subject, html, issue.id).run();
  let lastId = issue.last_sent_subscriber_id || 0, sent = 0, batches = 0;
  while (batches < MAX_BATCHES_PER_RUN) {
    const { results } = await env.DB.prepare("SELECT id, email, unsub_token, profile_token, profile_completed_at FROM subscribers WHERE status='active' AND city=? AND id>? ORDER BY id LIMIT ?").bind(city.slug, lastId, BATCH).all();
    if (!results.length) {
      await env.DB.prepare("UPDATE issues SET status='sent', completed_at=datetime('now'), sent_count=sent_count+?, last_sent_subscriber_id=?, updated_at=datetime('now') WHERE id=?").bind(sent, lastId, issue.id).run();
      return { done: true, sent };
    }
    const emails = results.map((s) => ({
      from: fromFor(city), to: s.email, subject, html: personalize(html, siteUrl, s),
      headers: { "List-Unsubscribe": `<${siteUrl}/unsubscribe?t=${s.unsub_token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "issue", value: String(issue.id) }, { name: "city", value: city.slug }],
    }));
    try { await resend(env, "/emails/batch", emails); }
    catch (e) { await env.DB.prepare("UPDATE issues SET send_error=?, updated_at=datetime('now') WHERE id=?").bind(String(e.message).slice(0, 300), issue.id).run(); return { error: String(e.message), sent }; }
    lastId = results[results.length - 1].id; sent += results.length; batches++;
    await env.DB.prepare("UPDATE issues SET sent_count=sent_count+?, last_sent_subscriber_id=?, send_error=NULL, updated_at=datetime('now') WHERE id=?").bind(results.length, lastId, issue.id).run();
  }
  return { done: false, sent };
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
  return out;
}

let lastLazy = 0;
export function lazyNewsletterTick(env, waitUntil) {
  const now = Date.now(); const dow = new Date().getUTCDay();
  if (dow !== 0 && dow !== 6 && dow !== 1) return; // weekends (UTC Monday covers Sunday evening Pacific)
  if (now - lastLazy < 300000) return;
  lastLazy = now;
  const p = newsletterTick(env).catch(() => {});
  if (waitUntil) waitUntil(p);
}
