// Monday numbers: one email to Jerome every Monday at 8 AM Pacific with the week's numbers for every live city,
// and the same block on the admin home page. Pure reads; the only write is the digest_log row that stops a
// second send in the same week. Nothing here publishes, posts or emails anyone but Jerome.
// The job board sections (roles, named roles, boards that failed) went with the board on 2026-10-25.
import { CITIES } from "./constants.js";
import { notifyJerome, emailShell } from "./integrations.js";
import { localNow } from "./dispatch.js";
import { mondayOf, addDays } from "./dates.js";

const DIGEST_HOUR = 8;

export async function weeklyNumbers(db) {
  const since = `datetime('now', '-7 days')`;
  const all = async (sql) => (await db.prepare(sql).all()).results || [];
  const cities = Object.values(CITIES).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const subs = await all(`SELECT city, SUM(status='active') active, SUM(status='active' AND created_at >= ${since}) added, SUM(status='unsubscribed' AND updated_at >= ${since}) gone, SUM(status='active' AND profile_completed_at IS NOT NULL) profiled FROM subscribers GROUP BY city`);
  const issues = await all(`SELECT city, issue_number, week_start, status, sent_count, send_error, subject FROM issues WHERE (completed_at >= ${since} OR dispatched_at >= ${since} OR status='sending') ORDER BY city, issue_number`);
  const clicks = await all(`SELECT target, COUNT(*) n FROM link_clicks WHERE clicked_at >= ${since} AND is_bot=0 AND is_dup=0 GROUP BY target ORDER BY n DESC, target`);
  const topEvents = await all(`SELECT e.title, e.city, COUNT(*) n FROM link_clicks c JOIN events e ON e.id=c.event_id WHERE c.clicked_at >= ${since} AND c.is_bot=0 AND c.is_dup=0 GROUP BY e.id ORDER BY n DESC LIMIT 5`);
  const events = await all(`SELECT city, SUM(status='published' AND published_at >= ${since}) published, SUM(status='pending_review' AND hold=1) held, SUM(status='pending_review' AND hold=0) clocked, SUM(status='rejected' AND updated_at >= ${since}) rejected, SUM(status='published' AND start_at >= date('now') AND start_at < date('now','+70 days')) upcoming FROM events GROUP BY city`);
  const invites = (await all(`SELECT COUNT(*) n, SUM(created_at >= ${since}) week FROM invitation_requests`).catch(() => []))[0] || {};
  const feedsBad = await all(`SELECT name, last_status FROM feed_sources WHERE active=1 AND last_status IS NOT NULL AND last_status NOT LIKE 'ok%' ORDER BY id`);
  const linkedin = await all(`SELECT city, kind, status FROM linkedin_posts WHERE created_at >= ${since} ORDER BY id`);
  const sponsors = await all(`SELECT COUNT(*) n FROM sponsor_inquiries WHERE created_at >= ${since}`);
  // Delivery: permanent bounces and spam complaints reported by Resend this week (table from migration 0021).
  const delivery = (await all(`SELECT SUM(action='bounced') bounced, SUM(action='unsubscribed') complaints, SUM(action='logged' AND type='email.bounced') soft FROM email_events WHERE created_at >= ${since}`).catch(() => []))[0] || {};
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.city, r]));
  return { cities, subs: by(subs), issues, clicks, topEvents, events: by(events), invites: { total: invites.n || 0, week: invites.week || 0 }, feedsBad, linkedin, sponsorInquiries: (sponsors[0] || {}).n || 0, delivery: { bounced: delivery.bounced || 0, complaints: delivery.complaints || 0, soft: delivery.soft || 0 } };
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const td = (v, right = false) => `<td style="padding:4px 8px;border-bottom:1px solid #EEF2F7;${right ? "text-align:right;" : ""}">${esc(v)}</td>`;
const th = (v, right = false) => `<th style="padding:4px 8px;text-align:${right ? "right" : "left"};font-size:12px;color:#5B6B80;border-bottom:1px solid #DCE4EE;">${esc(v)}</th>`;

// One HTML block, used by the email and the admin home page.
export function renderNumbers(n, { siteUrl = "https://bettersecurity.ai" } = {}) {
  const row = (c) => { const s = n.subs[c.slug] || {}, e = n.events[c.slug] || {}; return `<tr>${td(c.name)}${td(`${s.active || 0} (${s.added || 0} new, ${s.gone || 0} left)`, true)}${td(`${e.published || 0} / ${e.upcoming || 0}`, true)}${td(e.held || 0, true)}</tr>`; };
  const virt = n.events.virtual ? `<tr>${td("Virtual")}${td("", true)}${td(`${n.events.virtual.published || 0} / ${n.events.virtual.upcoming || 0}`, true)}${td(n.events.virtual.held || 0, true)}</tr>` : "";
  const issues = n.issues.length ? n.issues.map((i) => `<li>${esc((CITIES[i.city] || {}).name || i.city)} issue ${i.issue_number || ""}, week of ${esc(i.week_start)}: ${i.status === "sent" ? `sent to ${i.sent_count}` : esc(i.status)}${i.send_error ? `, error: ${esc(i.send_error)}` : ""}${i.subject ? `, "${esc(i.subject)}"` : ""}</li>`).join("") : "<li>No issue went out this week.</li>";
  const clicks = n.clicks.length ? n.clicks.map((c) => `${esc(c.target || "other")} ${c.n}`).join(", ") : "none";
  const top = n.topEvents.length ? `<ul style="margin:6px 0 0;padding-left:18px;">${n.topEvents.map((e) => `<li>${esc(e.title)} (${esc((CITIES[e.city] || {}).name || e.city)}): ${e.n}</li>`).join("")}</ul>` : "";
  const trouble = n.feedsBad.map((f) => `Feed ${esc(f.name)}: ${esc(f.last_status)}`);
  const li = n.linkedin.length ? n.linkedin.map((p) => `${esc((CITIES[p.city] || {}).name || p.city)} ${p.kind} ${p.status}`).join(", ") : "nothing (page not connected, or nothing to post)";
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;"><thead><tr>${th("City")}${th("Subscribers (new, left this week)", true)}${th("Events published / upcoming", true)}${th("Held", true)}</tr></thead><tbody>${n.cities.map(row).join("")}${virt}</tbody></table>
  <h3 style="margin:18px 0 6px;font-size:15px;">Invitation requests</h3><p style="margin:0;">${(n.invites || {}).week || 0} new this week, ${(n.invites || {}).total || 0} in all, at <a href="${siteUrl}/admin/invitations">${siteUrl}/admin/invitations</a>.</p>
  <h3 style="margin:18px 0 6px;font-size:15px;">Sunday email</h3><ul style="margin:0;padding-left:18px;">${issues}</ul>
  <p style="margin:6px 0 0;">Delivery: ${(() => { const d = n.delivery || {}; return d.bounced || d.complaints || d.soft ? `${d.bounced || 0} address${d.bounced === 1 ? "" : "es"} bounced for good and ${d.complaints || 0} marked the email as spam this week${d.soft ? `, with ${d.soft} temporary bounce${d.soft === 1 ? "" : "s"} that will be retried` : ""}.` : "no bounces or spam complaints this week."; })()}</p>
  <h3 style="margin:18px 0 6px;font-size:15px;">Clicks this week</h3><p style="margin:0;">${clicks}.</p>${top}
  <h3 style="margin:18px 0 6px;font-size:15px;">LinkedIn page</h3><p style="margin:0;">${li}.</p>
  ${n.usageLine || ""}<h3 style="margin:18px 0 6px;font-size:15px;">Needs a look</h3>${trouble.length ? `<ul style="margin:0;padding-left:18px;">${trouble.map((t) => `<li>${t}</li>`).join("")}</ul>` : `<p style="margin:0;">Every feed read cleanly.</p>`}${n.sponsorInquiries ? `<p style="margin:8px 0 0;">${n.sponsorInquiries} new sponsor inquir${n.sponsorInquiries === 1 ? "y" : "ies"} at <a href="${siteUrl}/admin/sponsors">${siteUrl}/admin/sponsors</a>.</p>` : ""}
  <p style="margin:16px 0 0;color:#5B6B80;font-size:13px;">Counts cover the last seven days. Held rows wait at <a href="${siteUrl}/admin/review">${siteUrl}/admin/review</a>; everything else publishes on its own.</p>`;
}

// Called from the hourly tick. Sends once per week, Monday from 8 AM Pacific, and records the week in digest_log.
export async function runMondayDigest(env, { force = false } = {}) {
  const now = localNow("America/Los_Angeles");
  if (!force && (now.weekday !== "Mon" || now.hour < DIGEST_HOUR)) return { skipped: "not Monday morning" };
  const week = mondayOf(now.date);
  if (!force) {
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO digest_log (week_start) VALUES (?)").bind(week).run();
    if (!claim.meta || !claim.meta.changes) return { skipped: "already sent" };
  } else await env.DB.prepare("INSERT OR IGNORE INTO digest_log (week_start) VALUES (?)").bind(week).run();
  try {
    const n = await weeklyNumbers(env.DB);
    n.usageLine = "";
    try {
      const u = await env.DB.prepare("SELECT sum(reads) reads, sum(writes) writes, sum(requests) requests, sum(errors) errors, max(reads) peak FROM usage_daily WHERE day >= date('now','-7 days')").first();
      if (u && u.requests) n.usageLine = `<p style="margin:8px 0 0;">Database this week: ${Number(u.reads).toLocaleString()} rows read (peak day ${Number(u.peak).toLocaleString()}), ${Number(u.writes).toLocaleString()} written, ${Number(u.requests).toLocaleString()} requests, ${Number(u.errors).toLocaleString()} fallback pages served. Paid plan includes 25 billion reads a month.</p>`;
    } catch { /* usage table not there yet */ }
    const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
    const totalSubs = n.cities.reduce((a, c) => a + ((n.subs[c.slug] || {}).active || 0), 0);
    const sent = n.issues.filter((i) => i.status === "sent").length;
    await notifyJerome(env, `The Watch, Monday numbers: ${totalSubs} subscribers, ${sent} issue${sent === 1 ? "" : "s"} sent`, emailShell(`Monday numbers, week of ${addDays(week, -7)}`, renderNumbers(n, { siteUrl })));
    await env.DB.prepare("UPDATE digest_log SET sent_at=datetime('now') WHERE week_start=?").bind(week).run();
    return { sent: true, week };
  } catch (e) {
    if (!force) await env.DB.prepare("DELETE FROM digest_log WHERE week_start=? AND sent_at IS NULL").bind(week).run(); // let the next tick retry
    return { error: String(e && e.message) };
  }
}
