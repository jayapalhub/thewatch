// Date helpers. Event times are local wall-clock ISO strings in America/Los_Angeles.
export const TZ = "America/Los_Angeles";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse "YYYY-MM-DDTHH:MM[:SS]" or "YYYY-MM-DD" into parts without any timezone math.
export function parts(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] == null ? null : +m[4], mi: m[5] == null ? null : +m[5] };
}
// A Date object representing the same wall-clock in UTC (for weekday math only).
export function wall(iso) {
  const p = parts(iso); if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h || 0, p.mi || 0));
}
export function dateKey(iso) { return String(iso).slice(0, 10); }
export function weekday(iso) { return DAYS[wall(iso).getUTCDay()]; }
export function weekday3(iso) { return DAYS3[wall(iso).getUTCDay()]; }
export function monthName(iso) { return MONTHS[parts(iso).mo - 1]; }
export function month3(iso) { return MONTHS3[parts(iso).mo - 1]; }
export function dayNum(iso) { return parts(iso).d; }

export function fmtTime(iso) {
  const p = parts(iso); if (!p || p.h == null) return "";
  const ampm = p.h >= 12 ? "PM" : "AM";
  const h = p.h % 12 === 0 ? 12 : p.h % 12;
  return p.mi ? `${h}:${String(p.mi).padStart(2, "0")} ${ampm}` : `${h} ${ampm}`;
}
export function fmtTimeRange(start, end) {
  const a = fmtTime(start); if (!a) return "";
  if (!end || dateKey(end) !== dateKey(start)) return a;
  const b = fmtTime(end);
  if (!b) return a;
  // Drop the first AM/PM when both match: "5:30 to 7:30 PM"
  const sa = a.split(" "), sb = b.split(" ");
  if (sa[1] === sb[1]) return `${sa[0]} to ${b}`;
  return `${a} to ${b}`;
}
export function fmtDateLong(iso) { const p = parts(iso); return `${weekday(iso)}, ${monthName(iso)} ${p.d}, ${p.y}`; }
export function fmtDateShort(iso) { const p = parts(iso); return `${weekday3(iso)} ${month3(iso)} ${p.d}`; }

// Current wall-clock in the site timezone as "YYYY-MM-DDTHH:MM".
export function nowLocalIso(tz = TZ) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {}; f.formatToParts(new Date()).forEach((x) => { o[x.type] = x.value; });
  const hh = o.hour === "24" ? "00" : o.hour;
  return `${o.year}-${o.month}-${o.day}T${hh}:${o.minute}`;
}
export function todayKey(tz = TZ) { return nowLocalIso(tz).slice(0, 10); }

export function addDays(key, n) {
  const d = wall(key); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Monday of the week containing key (Monday-first weeks).
export function mondayOf(key) {
  const d = wall(key); const dow = d.getUTCDay(); // 0 Sun
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(key, -back);
}
export function monthStart(key) { return key.slice(0, 7) + "-01"; }
export function monthEnd(key) {
  const p = parts(key); const d = new Date(Date.UTC(p.y, p.mo, 0));
  return d.toISOString().slice(0, 10);
}
export function addMonths(key, n) {
  const p = parts(key); const d = new Date(Date.UTC(p.y, p.mo - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

// Convert a local wall-clock ISO in tz to a UTC Date (for .ics and Google links).
export function toUtc(iso, tz = TZ) {
  const p = parts(iso); if (!p) return null;
  const guess = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h || 0, p.mi || 0));
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const offsetAt = (d) => { const o = {}; f.formatToParts(d).forEach((x) => { o[x.type] = x.value; }); return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - d.getTime(); };
  // The offset at the guess can differ from the offset at the answer on daylight saving change days; check once more.
  const first = offsetAt(guess);
  const second = offsetAt(new Date(guess.getTime() - first));
  return new Date(guess.getTime() - second);
}
export function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// A wall clock ISO string ("2026-10-28T10:00:00") for a UTC instant in the given zone.
export function utcToWall(date, tz = TZ) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o = {}; f.formatToParts(date instanceof Date ? date : new Date(date)).forEach((x) => { o[x.type] = x.value; });
  return `${o.year}-${o.month}-${o.day}T${o.hour === "24" ? "00" : o.hour}:${o.minute}:00`;
}

// Re-express an event stored in one zone (its wall clock plus start_utc/end_utc) in another city's zone, for lists
// that mix calendars, such as the virtual sessions in an Eastern city's email. Same zone returns the row unchanged.
export function inZone(e, tz) {
  if (!e || !tz || (e.timezone || TZ) === tz) return e;
  const su = e.start_utc ? new Date(e.start_utc) : toUtc(e.start_at, e.timezone || TZ);
  const eu = e.end_at ? (e.end_utc ? new Date(e.end_utc) : toUtc(e.end_at, e.timezone || TZ)) : null;
  return { ...e, start_at: utcToWall(su, tz), end_at: eu ? utcToWall(eu, tz) : e.end_at, timezone: tz };
}

// "Pacific", "Eastern", "Central European Time": how an email names the zone its times are in.
const ZONE_NAMES = { "America/Los_Angeles": "Pacific", "America/Denver": "Mountain", "America/Phoenix": "Arizona", "America/Chicago": "Central", "America/New_York": "Eastern", "America/Anchorage": "Alaska", "Pacific/Honolulu": "Hawaii" };
export function zoneLabel(tz = TZ) {
  if (ZONE_NAMES[tz]) return ZONE_NAMES[tz];
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value; }
  catch { return "local time"; }
}

// "Thu Oct 22, 12:14 AM Pacific" for a UTC datetime as SQLite stores it ("2026-10-22 07:14:05" or ISO). Admin pages only.
export function fmtUtcLocal(s, tz = TZ) {
  if (!s) return "";
  const iso = String(s).replace(" ", "T").replace(/(\.\d+)?Z?$/, "Z");
  const d = new Date(iso); if (isNaN(d)) return String(s);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${f.format(d)} ${zoneLabel(tz)}`;
}
