// "Email me a reminder". One email per (event, address), sent from 6 AM local time the day before the event.
// A reminder is not registration: the form and the email both say so and point to the organizer.
// Sends run from the daily cron (via /api/events/autopublish) and lazily from page views.
import { token, sha256 } from "./html.js";
import { sendEmail, emailShell } from "./integrations.js";
import { cityOf, eventPath, CITIES, DEFAULT_CITY } from "./constants.js";
import { toUtc, addDays, nowLocalIso, fmtDateLong, fmtTimeRange } from "./dates.js";
import { googleCalendarUrl } from "./calendar.js";
import { eventById } from "./events.js";

export const MAX_QUEUED_PER_EMAIL = 5;
const SEND_HOUR = 6; // local time, the day before. The daily cron runs at 6 AM PST / 7 AM PDT.

function startUtc(e) {
  if (e.start_utc) return new Date(e.start_utc);
  return toUtc(e.start_at, e.timezone || "America/Los_Angeles");
}
// When this reminder becomes due: 6 AM local on the day before the event.
export function dueAt(e) {
  const tz = e.timezone || "America/Los_Angeles";
  return toUtc(`${addDays(e.start_at.slice(0, 10), -1)}T${String(SEND_HOUR).padStart(2, "0")}:00`, tz);
}

// Queue a reminder. Returns { ok, message } or { ok: false, error, status }.
export async function requestReminder(db, { event, email, request }) {
  email = email.toLowerCase();
  if (!event || event.status !== "published") return { ok: false, status: 404, error: "That event is not on the calendar anymore." };
  if (startUtc(event).getTime() <= Date.now()) return { ok: false, status: 400, error: "That event has already started." };
  const existing = await db.prepare("SELECT id, status FROM reminders WHERE event_id=? AND email=?").bind(event.id, email).first();
  if (existing && ["queued", "sending", "sent"].includes(existing.status)) return { ok: true, already: true, sent: existing.status === "sent" };
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE email=? AND status='queued'").bind(email).first();
  if (n >= MAX_QUEUED_PER_EMAIL) return { ok: false, status: 429, error: `That address already has ${MAX_QUEUED_PER_EMAIL} reminders waiting. Once one of those events passes you can add another.` };
  const sub = await db.prepare("SELECT id, status FROM subscribers WHERE email=?").bind(email).first();
  const ip = request ? request.headers.get("cf-connecting-ip") || "" : "";
  const ipHash = ip ? (await sha256(ip)).slice(0, 16) : null;
  if (existing) {
    await db.prepare("UPDATE reminders SET status='queued', requested_start_at=?, subscriber_id=?, ip_hash=?, note=NULL, sent_at=NULL, created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(event.start_at, sub && sub.status === "active" ? sub.id : null, ipHash, existing.id).run();
  } else {
    await db.prepare("INSERT INTO reminders (event_id, email, subscriber_id, token, requested_start_at, ip_hash) VALUES (?,?,?,?,?,?)")
      .bind(event.id, email, sub && sub.status === "active" ? sub.id : null, token(), event.start_at, ipHash).run();
  }
  // Asking for a new reminder is explicit, so it lifts an earlier "stop these reminders".
  await db.prepare("DELETE FROM reminder_optouts WHERE email=?").bind(email).run();
  return { ok: true, subscribed: !!(sub && sub.status === "active") };
}

function linkStyle() { return "color:#1B4A8A;"; }

export function reminderEmail(siteUrl, e, r, { subscribed }) {
  const city = cityOf(e.city) || CITIES[DEFAULT_CITY];
  const tz = e.timezone || "America/Los_Angeles";
  const today = nowLocalIso(tz).slice(0, 10), day = e.start_at.slice(0, 10);
  const when = day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : fmtDateLong(e.start_at);
  const time = fmtTimeRange(e.start_at, e.end_at);
  const where = e.format === "virtual" ? "Online" : [e.venue_display, e.venue_address_display].filter(Boolean).join(", ");
  const page = `${siteUrl}${eventPath(e)}`;
  const moved = r.requested_start_at && r.requested_start_at !== e.start_at;
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#1B4A8A;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;">${label}</a>`;
  const inner = `
    <p>Hi,</p>
    <p>You asked for a reminder about <strong>${esc(e.title)}</strong>. Here are the details.</p>
    ${moved ? `<p style="background:#FFF4E5;color:#8A4B00;padding:10px 12px;border-radius:8px;">The date or time changed since you asked. It was ${esc(fmtDateLong(r.requested_start_at))}${fmtTimeRange(r.requested_start_at) ? ", " + esc(fmtTimeRange(r.requested_start_at)) : ""}. The details below are current.</p>` : ""}
    <table role="presentation" style="border-collapse:collapse;margin:8px 0 18px;font-size:15px;">
      <tr><td style="padding:4px 14px 4px 0;color:#5B6B80;vertical-align:top;">When</td><td style="padding:4px 0;"><strong>${esc(when)}</strong>${when !== fmtDateLong(e.start_at) ? `, ${esc(fmtDateLong(e.start_at))}` : ""}${time ? `<br>${esc(time)} ${e.city === "virtual" ? "Pacific" : ""}` : ""}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#5B6B80;vertical-align:top;">Where</td><td style="padding:4px 0;">${esc(where || "See the event page")}</td></tr>
      ${e.org_name ? `<tr><td style="padding:4px 14px 4px 0;color:#5B6B80;vertical-align:top;">Organizer</td><td style="padding:4px 0;">${esc(e.org_name)}</td></tr>` : ""}
    </table>
    ${e.registration_url ? `<p>A reminder is not registration. If you have not registered with the organizer yet, do it now so they hold a spot for you.</p><p>${btn(`${siteUrl}/go/${e.id}?t=register`, "Register with the organizer")}</p>` : ""}
    <p style="font-size:14px;"><a href="${googleCalendarUrl(e, siteUrl)}" style="${linkStyle()}">Add to Google Calendar</a> &nbsp;·&nbsp; <a href="${page}/ics" style="${linkStyle()}">Apple or Outlook</a> &nbsp;·&nbsp; <a href="${page}" style="${linkStyle()}">Event page</a></p>
    ${subscribed ? `<p style="font-size:14px;margin:18px 0 0;color:#5B6B80;">After the event, <a href="${siteUrl}/cpe/attend?r=${r.token}" style="${linkStyle()}">add it to your CPE log</a> with the organizer's credit hours.</p>` : ""}
    ${subscribed ? "" : `<div style="margin:22px 0 0;padding:14px 16px;background:#F4F7FB;border-radius:10px;"><p style="margin:0 0 6px;"><strong>Want the whole week?</strong> ${city.newsletter === "sunday" || e.city === "virtual" ? `The Watch ${esc(city.name)} goes out Sunday at 8 AM with every security event worth your time, plus the best online sessions with CPE.` : `The Watch ${esc(city.name)} is starting a Sunday email with every security event worth your time. Join now and you get the first issue.`}</p><p style="margin:0;"><a href="${siteUrl}/remind/join?t=${r.token}" style="${linkStyle()}font-weight:700;">Get the Sunday email</a></p></div>`}`;
  const footer = `<p style="max-width:560px;margin:12px auto 0;color:#5B6B80;font-size:12px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">You are getting this because this address asked for a reminder on bettersecurity.ai. <a href="${siteUrl}/remind/stop?t=${r.token}" style="color:#5B6B80;">Stop all reminders</a>.</p>`;
  const subject = `${when === fmtDateLong(e.start_at) ? "Reminder" : when}: ${e.title}`;
  return { subject, html: emailShell(`${when === "Today" || when === "Tomorrow" ? when : "Coming up"}: ${esc(e.title)}`, inner, e.city === "virtual" ? null : city) + footer };
}

// Send every reminder that is due. Safe to call concurrently: each row is claimed before sending.
export async function runReminders(env, { limit = 50 } = {}) {
  const db = env.DB;
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const { results } = await db.prepare(
    `SELECT r.* FROM reminders r JOIN events e ON e.id = r.event_id WHERE r.status = 'queued' ORDER BY e.start_at LIMIT 500`).all();
  const now = Date.now();
  let sent = 0, skipped = 0, failed = 0;
  const cache = new Map();
  for (const r of results) {
    if (sent >= limit) break;
    let e = cache.get(r.event_id);
    if (e === undefined) { e = await eventById(db, r.event_id); cache.set(r.event_id, e); }
    // Gone, not published any more, or already started: drop it quietly.
    if (!e || e.status !== "published" || startUtc(e).getTime() <= now) {
      await db.prepare("UPDATE reminders SET status='skipped', note=? WHERE id=? AND status='queued'")
        .bind(!e ? "event deleted" : e.status !== "published" ? `event ${e.status}` : "event already started", r.id).run();
      skipped++; continue;
    }
    if (dueAt(e).getTime() > now) continue; // not yet
    const optout = await db.prepare("SELECT 1 FROM reminder_optouts WHERE email=?").bind(r.email).first();
    if (optout) { await db.prepare("UPDATE reminders SET status='cancelled', note='address opted out' WHERE id=? AND status='queued'").bind(r.id).run(); skipped++; continue; }
    const claim = await db.prepare("UPDATE reminders SET status='sending' WHERE id=? AND status='queued'").bind(r.id).run();
    if (!claim.meta || claim.meta.changes !== 1) continue; // another run took it
    const sub = await db.prepare("SELECT status FROM subscribers WHERE email=?").bind(r.email).first();
    const city = cityOf(e.city) && e.city !== "virtual" ? cityOf(e.city) : CITIES[DEFAULT_CITY];
    const msg = reminderEmail(siteUrl, e, r, { subscribed: !!(sub && sub.status === "active") });
    const res = await sendEmail(env, {
      to: r.email, subject: msg.subject, html: msg.html,
      from: `The Watch ${e.city === "virtual" ? "" : city.name + " "}<watch@bettersecurity.ai>`.replace("  ", " "),
      headers: { "List-Unsubscribe": `<${siteUrl}/remind/stop?t=${r.token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (res.ok) { await db.prepare("UPDATE reminders SET status='sent', sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(r.id).run(); sent++; }
    else { await db.prepare("UPDATE reminders SET status='queued', note='send failed, will retry' WHERE id=?").bind(r.id).run(); failed++; }
  }
  return { sent, skipped, failed };
}

// Page-view trigger: at most one pass per worker instance every 10 minutes.
let lastLazy = 0;
export function lazyReminders(env, waitUntil) {
  const now = Date.now();
  if (now - lastLazy < 600000) return;
  lastLazy = now;
  const p = runReminders(env).catch((e) => console.error("reminders failed", e && e.message));
  if (waitUntil) waitUntil(p);
}

// Stop link: cancel everything queued for the address behind this token and remember the opt out.
export async function stopReminders(db, tok) {
  const r = tok ? await db.prepare("SELECT email FROM reminders WHERE token=?").bind(tok).first() : null;
  if (!r) return null;
  await db.prepare("UPDATE reminders SET status='cancelled', note='stopped by recipient' WHERE email=? AND status='queued'").bind(r.email).run();
  await db.prepare("INSERT OR IGNORE INTO reminder_optouts (email) VALUES (?)").bind(r.email).run();
  return r.email;
}
