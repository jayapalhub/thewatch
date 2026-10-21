// Personal CPE log. A subscriber is identified by their profile token: in ?t= on links we email them, or in the
// watch_pt cookie that /profile and /cpe set (HttpOnly, so page scripts never see it). The readable watch_cpe=1
// cookie only tells event pages to show the Mark attended button; it carries nothing private.
export const PT_COOKIE = "watch_pt";
export const FLAG_COOKIE = "watch_cpe";
const YEAR = 31536000;

export function tokenFromCookie(request) {
  const m = ((request && request.headers.get("Cookie")) || "").match(/(?:^|;\s*)watch_pt=([a-z0-9]{8,64})/);
  return m ? m[1] : null;
}
export function cpeCookies(token) {
  return [
    `${PT_COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
    `${FLAG_COOKIE}=1; Path=/; Max-Age=${YEAR}; Secure; SameSite=Lax`,
  ];
}
export function withCookies(res, token) {
  for (const c of cpeCookies(token)) res.headers.append("Set-Cookie", c);
  return res;
}

export async function subscriberByToken(db, token) {
  if (!token || !/^[a-z0-9]{8,64}$/.test(token)) return null;
  return db.prepare("SELECT id, email, first_name, profile_token, status, city FROM subscribers WHERE profile_token=?").bind(token).first();
}

// Has the event started? Uses the stored UTC instant.
export function eventStarted(e, now = Date.now()) {
  const t = e.start_utc ? Date.parse(e.start_utc) : NaN;
  return Number.isFinite(t) ? t <= now : false;
}

export function cleanHours(v) {
  const n = parseFloat(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 40) return null;
  return Math.round(n * 4) / 4; // quarter hours
}

// Record attendance with the organizer's figure as the default. Returns the row.
export async function markAttended(db, subscriberId, e, source = "event_page") {
  const hours = e.cpe_eligible && e.cpe_hours != null ? e.cpe_hours : null;
  await db.prepare("INSERT INTO event_attendance (subscriber_id, event_id, hours, source) VALUES (?,?,?,?) ON CONFLICT(subscriber_id, event_id) DO NOTHING")
    .bind(subscriberId, e.id, hours, source).run();
  return db.prepare("SELECT * FROM event_attendance WHERE subscriber_id=? AND event_id=?").bind(subscriberId, e.id).first();
}

export async function logEntries(db, subscriberId) {
  const { results } = await db.prepare(
    `SELECT a.id, a.hours, a.event_id, a.created_at, e.title, e.slug, e.city, e.start_at, e.cpe_hours, e.cpe_body, e.cpe_eligible, o.name AS org_name
     FROM event_attendance a JOIN events e ON e.id = a.event_id LEFT JOIN organizations o ON o.id = e.organization_id
     WHERE a.subscriber_id = ? ORDER BY e.start_at DESC`).bind(subscriberId).all();
  return results;
}

// Totals per calendar year, with a per body breakdown.
export function yearTotals(rows) {
  const years = new Map();
  for (const r of rows) {
    const y = r.start_at.slice(0, 4);
    const t = years.get(y) || { year: y, hours: 0, events: 0, byBody: {} };
    t.events++;
    if (r.hours != null) { t.hours += r.hours; const b = r.cpe_body || "Not stated"; t.byBody[b] = (t.byBody[b] || 0) + r.hours; }
    years.set(y, t);
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}

export function csvCell(v) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // keep spreadsheet apps from treating a title as a formula
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
