import { html, raw, list } from "./html.js";
import { TOPICS, FORMATS, COST_TYPES, eventPath, orgPath, calendarPath } from "./constants.js";
import { fmtTimeRange, fmtDateLong, weekday, month3, dayNum, dateKey, todayKey, nowLocalIso } from "./dates.js";

const SELECT = `
  SELECT e.*, o.name AS org_name, o.slug AS org_slug, o.short_name AS org_short, o.type AS org_type,
         v.name AS v_name, v.address_line AS v_address, v.neighborhood AS v_neighborhood, v.city AS v_city
  FROM events e
  LEFT JOIN organizations o ON o.id = e.organization_id
  LEFT JOIN venues v ON v.id = e.venue_id`;

export function hydrate(row) {
  if (!row) return null;
  row.topics = list(row.topics);
  row.venue_display = row.v_name || row.venue_name || (row.format === "virtual" ? "Online" : "");
  row.venue_address_display = row.v_address || row.venue_address || "";
  row.neighborhood = row.v_neighborhood || row.v_city || "";
  row.org_display = row.org_short || row.org_name || "";
  return row;
}

// Public calendar query with filters.
export async function queryEvents(db, { city = "sandiego", from, to, topic, org, orgType, cost, cpe, format, q, featured, limit = 500, status = "published" } = {}) {
  // The virtual calendar shows events filed under 'virtual' plus any San Diego event flagged also_virtual.
  const where = [city === "virtual" ? "(e.city = 'virtual' OR (e.also_virtual = 1 AND e.format IN ('virtual','hybrid')))" : "e.city = ?", "e.status = ?"];
  const args = city === "virtual" ? [status] : [city, status];
  if (orgType === "vendor") { where.push("o.type = 'vendor'"); }
  if (orgType === "nonvendor") { where.push("(o.type IS NULL OR o.type != 'vendor')"); }
  if (orgType && !["vendor","nonvendor"].includes(orgType)) { where.push("o.slug = ?"); args.push(orgType); }
  if (from) { where.push("e.start_at >= ?"); args.push(from); }
  if (to) { where.push("e.start_at < ?"); args.push(to); }
  if (topic) { where.push("e.topics LIKE ?"); args.push(`%"${topic}"%`); }
  if (org) { where.push("o.slug = ?"); args.push(org); }
  if (cost === "free") { where.push("e.cost_type IN ('free','members_free','donation')"); }
  if (cost === "paid") { where.push("e.cost_type = 'paid'"); }
  if (cpe === "1") { where.push("e.cpe_eligible = 1"); }
  if (format) { where.push("e.format = ?"); args.push(format); }
  if (featured) { where.push("e.is_featured = 1"); }
  if (q) { where.push("(e.title LIKE ? OR e.description_short LIKE ? OR o.name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `${SELECT} WHERE ${where.join(" AND ")} ORDER BY e.start_at ASC LIMIT ?`;
  args.push(limit);
  const { results } = await db.prepare(sql).bind(...args).all();
  return results.map(hydrate);
}

export async function upcomingEvents(db, opts = {}) {
  return queryEvents(db, { from: nowLocalIso(), ...opts });
}

export async function eventBySlug(db, slug) {
  const row = await db.prepare(`${SELECT} WHERE e.slug = ?`).bind(slug).first();
  return hydrate(row);
}
export async function eventById(db, id) {
  const row = await db.prepare(`${SELECT} WHERE e.id = ?`).bind(id).first();
  return hydrate(row);
}

export function groupByDay(events) {
  const groups = [];
  let cur = null;
  for (const e of events) {
    const k = dateKey(e.start_at);
    if (!cur || cur.key !== k) { cur = { key: k, events: [] }; groups.push(cur); }
    cur.events.push(e);
  }
  return groups;
}

export function costLabel(e) {
  if (e.cost_type === "paid") {
    if (e.cost_min != null && e.cost_max != null && e.cost_max !== e.cost_min) return `$${fmt(e.cost_min)} to $${fmt(e.cost_max)}`;
    if (e.cost_min != null) return `$${fmt(e.cost_min)}`;
    return "Paid";
  }
  return COST_TYPES[e.cost_type] || "";
}
function fmt(n) { return Number.isInteger(+n) ? String(+n) : (+n).toFixed(2); }

export function cpeLabel(e) {
  if (!e.cpe_eligible) return "";
  const hrs = e.cpe_hours ? `${fmt(e.cpe_hours)} CPE` : "CPE";
  return hrs;
}

export function eventTags(e, { showFormat = true } = {}) {
  const tags = [];
  if (e.is_better_security_event) tags.push(html`<span class="tag tag-bs">Better Security</span>`);
  if (e.is_featured) tags.push(html`<span class="tag tag-pick">Jerome's pick</span>`);
  if (e.discount_code && e.status !== "cancelled") tags.push(html`<span class="tag tag-deal" title="Subscriber discount code on the event page">Subscriber discount</span>`);
  const cpe = cpeLabel(e); if (cpe) tags.push(html`<span class="tag tag-cpe" title="${e.cpe_body ? `Organizer reports ${e.cpe_body} credit` : "Organizer reports CPE credit"}">${cpe}</span>`);
  const cost = costLabel(e); if (cost && e.cost_type !== "unknown") tags.push(html`<span class="tag">${cost}</span>`);
  if (showFormat && e.format !== "in_person") tags.push(html`<span class="tag">${FORMATS[e.format] || e.format}</span>`);
  e.topics.slice(0, 3).forEach((t) => { if (TOPICS[t]) tags.push(html`<a class="tag tag-topic" href="${calendarPath(e.city)}?topic=${t}">${TOPICS[t]}</a>`); });
  return tags;
}

// One row in the day-grouped list.
export function eventRow(e) {
  const where = e.format === "virtual" ? "Online" : [e.venue_display, e.neighborhood].filter(Boolean).join(", ");
  return html`
  <li class="event-row ${e.is_featured ? "is-featured" : ""} ${e.is_better_security_event ? "is-bs" : ""}">
    <div class="event-time">${fmtTimeRange(e.start_at, e.end_at) || "All day"}</div>
    <div class="event-main">
      <h3 class="event-title"><a href="${eventPath(e)}">${e.title}</a></h3>
      <p class="event-meta">${e.org_display ? html`<a href="${orgPath(e.org_slug, e.city)}">${e.org_display}</a>` : ""}${where ? html`<span class="sep"></span>${where}` : ""}</p>
      ${e.description_short ? html`<p class="event-blurb">${e.description_short}</p>` : ""}
      <div class="tags">${eventTags(e)}</div>
    </div>
    <div class="event-actions">
      ${e.registration_url ? html`<a class="btn btn-small btn-outline" href="/go/${e.id}?t=register" rel="noopener">Register</a>` : ""}
    </div>
  </li>`;
}

export function dayHeading(key) {
  const today = todayKey();
  const label = key === today ? "Today" : weekday(key);
  return html`<div class="day-head"><span class="day-num">${dayNum(key)}</span><span class="day-text"><span class="day-name">${label}</span><span class="day-month">${month3(key)}</span></span></div>`;
}

export function dayList(events, { empty = "Nothing on the calendar yet for these days." } = {}) {
  if (!events.length) return html`<p class="empty">${empty}</p>`;
  return html`${groupByDay(events).map((g) => html`
    <section class="day-group" id="d-${g.key}">
      ${dayHeading(g.key)}
      <ul class="event-list">${g.events.map(eventRow)}</ul>
    </section>`)}`;
}

export function longDate(e) { return fmtDateLong(e.start_at); }

export function eventJsonLd(e, siteUrl) {
  const o = {
    "@context": "https://schema.org", "@type": "Event", name: e.title,
    startDate: e.start_at, endDate: e.end_at || undefined,
    eventAttendanceMode: e.format === "virtual" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    description: e.description_short || undefined,
    url: `${siteUrl}${eventPath(e)}`,
    organizer: e.org_name ? { "@type": "Organization", name: e.org_name } : undefined,
    location: e.format === "virtual" ? { "@type": "VirtualLocation", url: e.registration_url || undefined } : { "@type": "Place", name: e.venue_display || undefined, address: e.venue_address_display || undefined },
  };
  return raw(`<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`);
}
