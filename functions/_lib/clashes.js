import { SHOW_BS_EVENTS } from "./constants.js";
const BS_OFF = "COALESCE(e.is_better_security_event, 0) = 0 AND COALESCE(o.slug, '') != 'better-security'";
// Clash checker: two in person events in the same city that start within two hours of each other on the same day.
// start_at is stored as local wall time ("2026-11-12T17:30:00"), so comparing wall times within one city is safe.
// The virtual calendar and online only events are skipped: they do not compete for the same room or evening.

export const CLASH_MINUTES = 120;

function minutes(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? +m[1] * 60 + +m[2] : null;
}

// For each event in `events` (rows with id, city, start_at), returns Map(event id => [published events that clash]).
// Events with no time of day (date only) are left alone, since we cannot tell whether they overlap.
export async function findClashes(db, events) {
  const out = new Map();
  const targets = events.filter((e) => e && e.city && e.city !== "virtual" && e.format !== "virtual" && e.start_at && minutes(e.start_at) != null);
  if (!targets.length) return out;
  const keys = [...new Set(targets.map((e) => `${e.city}|${e.start_at.slice(0, 10)}`))];
  // One query per batch of city/day pairs. D1 caps bound parameters, so keep batches modest.
  const others = [];
  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40);
    const cond = batch.map(() => "(e.city = ? AND substr(e.start_at, 1, 10) = ?)").join(" OR ");
    const args = batch.flatMap((k) => k.split("|"));
    const { results } = await db.prepare(
      `SELECT e.id, e.slug, e.title, e.city, e.start_at, e.end_at, e.organization_id, o.name AS org_name, o.short_name AS org_short
       FROM events e LEFT JOIN organizations o ON o.id = e.organization_id
       WHERE e.status = 'published' AND COALESCE(e.format, 'in_person') != 'virtual' AND (${cond})${SHOW_BS_EVENTS ? "" : " AND " + BS_OFF}`
    ).bind(...args).all();
    others.push(...results);
  }
  for (const e of targets) {
    const day = e.start_at.slice(0, 10), m = minutes(e.start_at);
    const hits = others.filter((o) => o.id !== e.id && o.city === e.city && o.start_at.slice(0, 10) === day
      && minutes(o.start_at) != null && Math.abs(minutes(o.start_at) - m) < CLASH_MINUTES);
    if (hits.length) out.set(e.id, hits.sort((a, b) => (a.start_at < b.start_at ? -1 : 1)));
  }
  return out;
}

// All published events in a city on one date, for the "check a date" tool on organizer pages.
export async function eventsOnDate(db, city, date) {
  const { results } = await db.prepare(
    `SELECT e.id, e.slug, e.title, e.city, e.format, e.start_at, e.end_at, o.name AS org_name, o.short_name AS org_short, o.slug AS org_slug
     FROM events e LEFT JOIN organizations o ON o.id = e.organization_id
     WHERE e.status = 'published' AND e.city = ? AND substr(e.start_at, 1, 10) = ?${SHOW_BS_EVENTS ? "" : " AND " + BS_OFF} ORDER BY e.start_at`
  ).bind(city, date).all();
  return results;
}
