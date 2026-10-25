import { CITIES, eventPath, orgPath, cityOf, SHOW_BS_EVENTS, singleCity } from "./_lib/constants.js";
import { todayKey } from "./_lib/dates.js";
import { parseSpeakers, nameKey, resolveKey, loadOverrides } from "./_lib/speakers.js";

// Only pages that answer 200 and are meant to be indexed. A page that would render noindex (an organizer or speaker
// directory with nobody on it) or answer 404 (an organizer with no events in that city) is left out. Paused cities
// are not in CITIES, so nothing of theirs is listed. lastmod comes from the rows behind each page where one exists.
// Five queries in all, whatever the number of cities; the response is edge cached like any public page.
const NOT_BS_EVENT = SHOW_BS_EVENTS ? "" : " AND COALESCE(e.is_better_security_event, 0) = 0 AND COALESCE(o.slug, '') != 'better-security'";

// D1 dates come as "YYYY-MM-DD HH:MM:SS" (datetime('now')) or "YYYY-MM-DDTHH:MM:SS.sssZ", both UTC.
function lastmod(v) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/.exec(String(v || "").trim());
  return m ? (m[2] ? `${m[1]}T${m[2]}Z` : m[1]) : null;
}
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rows = async (stmt) => { try { return (await stmt.all()).results || []; } catch { return []; } }; // a table missing before its migration

export async function onRequestGet({ env }) {
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const db = env.DB;
  const cities = Object.keys(CITIES);
  const listed = (c) => !!CITIES[c] || c === "virtual";

  const [events, orgs, speakerRows, overrides, sentIssues] = await Promise.all([
    // Upcoming events (from the start of today, Pacific, the same day the calendars use) plus past events that have a
    // recording, since their pages stay useful after the date.
    rows(db.prepare(`SELECT e.slug, e.city, e.updated_at FROM events e LEFT JOIN organizations o ON o.id = e.organization_id
      WHERE e.status = 'published' AND (e.start_at >= ? OR (e.recording_url IS NOT NULL AND trim(e.recording_url) != ''))${NOT_BS_EVENT}`).bind(todayKey())),
    // Organizer pages exist per city where the organizer has published events (the same rule the page uses).
    rows(db.prepare(`SELECT o.slug, e.city, MAX(e.updated_at) AS updated_at FROM organizations o JOIN events e ON e.organization_id = o.id
      WHERE e.status = 'published'${NOT_BS_EVENT} GROUP BY o.id, e.city`)),
    // Speaker boards render noindex when no listed name parses as a person, so check the names the way the board does.
    rows(db.prepare(`SELECT e.city, e.also_virtual, e.format, e.speakers FROM events e LEFT JOIN organizations o ON o.id = e.organization_id
      WHERE e.status = 'published' AND e.speakers IS NOT NULL AND trim(e.speakers) != ''${NOT_BS_EVENT}`)),
    loadOverrides(db),
    rows(db.prepare("SELECT city, week_start, updated_at FROM issues WHERE status='sent'")),
  ]);

  const urls = new Map(); // path -> lastmod (or null); the first entry for a path wins its position
  const add = (path, mod = null) => { urls.set(path, later(urls.get(path) || null, lastmod(mod))); };

  // Freshest event change per calendar, as the calendar page's lastmod.
  const cityMod = new Map();
  for (const e of events) { const c = cityOf(e.city) ? e.city : null; if (c) cityMod.set(c, later(cityMod.get(c), lastmod(e.updated_at))); }

  const orgCities = new Set();
  for (const o of orgs) if (CITIES[o.city]) orgCities.add(o.city);

  const speakerCities = new Set();
  for (const e of speakerRows) {
    const boards = [];
    if (CITIES[e.city] && !speakerCities.has(e.city)) boards.push(e.city);
    if ((e.city === "virtual" || (e.also_virtual && ["virtual", "hybrid"].includes(e.format))) && !speakerCities.has("virtual")) boards.push("virtual");
    if (!boards.length) continue;
    if (parseSpeakers(e.speakers).some((p) => resolveKey(nameKey(p.name), overrides))) boards.forEach((b) => speakerCities.add(b));
  }

  // With one city the root sends visitors to its calendar, so the calendar is the page to index.
  if (!singleCity()) add("/");
  for (const c of cities) add(`/${c}`, cityMod.get(c));
  add("/virtual", cityMod.get("virtual"));
  for (const c of cities) add(`/${c}/issues`);
  for (const c of cities) if (orgCities.has(c)) add(`/${c}/organizers`);
  for (const c of cities) if (speakerCities.has(c)) add(`/${c}/speakers`);
  if (speakerCities.has("virtual")) add("/virtual/speakers");
  for (const c of cities) add(`/${c}/cpe`);
  for (const c of cities) add(`/${c}/subscribe`);
  for (const i of sentIssues) if (CITIES[i.city]) add(`/${i.city}/issues/${i.week_start}`, i.updated_at);
  for (const p of [...(SHOW_BS_EVENTS ? ["/events", "/events/padel-social-2027"] : []), "/submit", "/sponsor", "/sponsor/media-kit", "/subscribe", "/about", "/privacy", "/terms"]) add(p);
  for (const e of events) if (listed(e.city)) add(eventPath(e), e.updated_at);
  for (const o of orgs) if (listed(o.city)) add(orgPath(o.slug, o.city), o.updated_at);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map(([u, mod]) => `  <url><loc>${esc(site + u)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}
