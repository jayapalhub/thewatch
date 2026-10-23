import { lazyAutoPublish } from "../_lib/autopublish.js";
import { lazyNewsletterTick } from "../_lib/dispatch.js";
import { lazyReminders } from "../_lib/reminders.js";
import { lazyJobs } from "../_lib/jobs.js";
import { pageSponsor, clickUrl } from "../_lib/sponsors.js";
import { html, page, raw, notFound } from "../_lib/html.js";
import { shell, subscribeBand, emailValueLine } from "../_lib/layout.js";
import { queryEvents, dayList, groupByDay, eventListJsonLd } from "../_lib/events.js";
import { TOPICS, COST_TYPES, CITIES, DEFAULT_CITY, cityOf } from "../_lib/constants.js";
import { addDays, todayKey, mondayOf, monthStart, monthEnd, addMonths, parts, monthName, weekday3, dayNum, month3, fmtTime, wall } from "../_lib/dates.js";

export async function onRequestGet({ request, env, params, waitUntil }) {
  lazyAutoPublish(env.DB, waitUntil);
  lazyNewsletterTick(env, waitUntil);
  lazyReminders(env, waitUntil);
  lazyJobs(env.DB, waitUntil);
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const url = new URL(request.url);
  const q = url.searchParams;
  const view = q.get("view") === "month" ? "month" : "list";
  const today = todayKey(city.timezone); // the city's own day, not Pacific
  const filters = {
    topic: TOPICS[q.get("topic")] ? q.get("topic") : "",
    org: (q.get("org") || "").slice(0, 80),
    cost: ["free", "paid"].includes(q.get("cost")) ? q.get("cost") : "",
    cpe: q.get("cpe") === "1" ? "1" : "",
    format: ["in_person", "virtual", "hybrid"].includes(q.get("format")) ? q.get("format") : "",
    q: (q.get("q") || "").slice(0, 80),
  };
  const anyFilter = Object.values(filters).some(Boolean);

  const { results: orgs } = await env.DB.prepare(
    "SELECT DISTINCT o.slug, o.short_name, o.name FROM organizations o JOIN events e ON e.organization_id=o.id WHERE e.status='published' AND e.city=? AND e.start_at >= ? ORDER BY COALESCE(o.short_name,o.name)"
  ).bind(city.slug, today).all();

  let body;
  if (view === "month") {
    // Month pages are bounded (three months back to fifteen ahead) so crawlers following the arrows cannot walk forever.
    const m = monthKeyOf(q, today);
    const from = monthStart(m), to = addDays(monthEnd(m), 1);
    const events = await queryEvents(env.DB, { city: city.slug, from, to: to + "T00:00", ...filters });
    body = html`${header(city, "month", filters, orgs, anyFilter, m)}${monthGrid(city, m, events, today, filters)}`;
  } else {
    // List: from today (or ?from) through 10 weeks out, with a week strip for the current week.
    const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") || "") ? q.get("from") : today;
    const horizon = addDays(fromKey, 70);
    const events = await queryEvents(env.DB, { city: city.slug, from: fromKey + "T00:00", to: horizon + "T00:00", ...filters });
    const strip = weekStrip(today, events, today);
    body = html`${header(city, "list", filters, orgs, anyFilter)}${strip}
      <div class="wrap">
        ${dayList(events, { today, empty: anyFilter ? "No events match these filters in the next ten weeks. Try clearing a filter." : city.empty })}
        ${events.length ? html`<p class="list-foot">Showing events through ${monthName(horizon)} ${dayNum(horizon)}. <a href="/${city.slug}?view=month">Browse by month</a> or <a href="/${city.slug}/feed.ics">subscribe to the calendar feed</a>.</p>` : ""}
        ${anyFilter ? "" : eventListJsonLd(events, env.SITE_URL || "https://bettersecurity.ai")}
      </div>`;
  }

  const sp = await pageSponsor(env.DB, city.slug);
  const full = html`${body}
    ${sp ? html`<aside class="sponsor-strip" aria-label="Sponsor"><div class="wrap">
      <span class="sponsor-label">The Watch ${city.name} is supported by</span>
      <a class="sponsor-link" href="${clickUrl("", sp, "page", { city: city.slug })}" rel="sponsored noopener" target="_blank">${sp.logo_url ? html`<img src="${sp.logo_url}" alt="${sp.name}" loading="lazy">` : html`<strong>${sp.name}</strong>`}</a>
      ${sp.tagline ? html`<span class="sponsor-tagline">${sp.tagline}</span>` : ""}
    </div></aside>` : ""}
    ${city.newsletter === "sunday"
      ? subscribeBand({ city, source: `calendar:${city.slug}`, text: "Everything on this calendar, curated down to what's worth your time, with a short note from Jerome. One email at 8 AM your time, and one click to unsubscribe." })
      : subscribeBand({ city, source: `calendar:${city.slug}`, heading: `A ${city.name} email is on the way.`, text: "Subscribe now and you're on the first send, the week it launches." })}`;

  const title = view === "month" && !anyFilter ? `${city.name} cybersecurity events in ${monthName(monthKeyOf(q, today))} ${parts(monthKeyOf(q, today)).y}` : `${city.name} cybersecurity events calendar`;
  const res = page(shell({ title, description: cityDescription(city), body: full, city: city.slug, path: `/${city.slug}`, canonical: `/${city.slug}`, wide: true }), 200, { "Cache-Control": "public, max-age=120" });
  res.headers.append("Set-Cookie", `watch_city=${city.slug}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  return res;
}

function monthKeyOf(q, today) {
  const asked = /^\d{4}-\d{2}$/.test(q.get("month") || "") ? q.get("month") + "-01" : "";
  return asked && asked >= addMonths(monthStart(today), -3) && asked <= addMonths(monthStart(today), 15) ? asked : monthStart(today);
}

// The meta description for a city calendar: what is on it, for where, and that there is a Sunday email. Written here
// rather than read from cities.description so all 40 cities say it the same way and mention the email.
export function cityDescription(city) {
  return `Cybersecurity, AI security, privacy and audit events in ${city.region || city.name}: chapter meetings, meetups and conferences, with CPE and cost noted${city.newsletter === "sunday" ? ", plus a free Sunday email" : ""}. By Better Security.`;
}

function header(city, view, f, orgs, anyFilter, monthKey) {
  const keep = (over) => {
    const p = new URLSearchParams();
    const merged = { ...f, ...over };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    const s = p.toString(); return `/${city.slug}` + (s ? "?" + s : "");
  };
  return html`
  <section class="cal-head">
    <div class="wrap">
      <div class="cal-title-row">
        <div>
          <p class="kicker">${city.region}</p>
          <h1>${view === "month" ? `${monthName(monthKey)} ${parts(monthKey).y}` : "The next ten weeks"}</h1>
          <p class="cal-sub">${emailValueLine(city)} <a href="#subscribe">${city.newsletter === "sunday" ? "Get the Sunday email" : "Join the list"}</a></p>
        </div>
        <div class="toggle-row">
          <div class="view-toggle city-toggle" role="tablist" aria-label="Calendar">
            ${Object.values(CITIES).map((c) => html`<a role="tab" aria-selected="${c.slug === city.slug ? "true" : "false"}" href="/${c.slug}">${c.name}</a>`)}
            <a role="tab" aria-selected="false" href="/virtual">Virtual</a>
          </div>
          <div class="view-toggle" role="tablist" aria-label="View">
            <a role="tab" aria-selected="${view === "list" ? "true" : "false"}" href="${keep({ view: "" })}">List</a>
            <a role="tab" aria-selected="${view === "month" ? "true" : "false"}" href="${keep({ view: "month" })}">Month</a>
          </div>
        </div>
      </div>
      <form class="filters" method="get" action="/${city.slug}">
        ${view === "month" ? html`<input type="hidden" name="view" value="month"><input type="hidden" name="month" value="${monthKey.slice(0, 7)}">` : ""}
        <label>Topic<select name="topic"><option value="">All topics</option>${Object.entries(TOPICS).map(([k, v]) => html`<option value="${k}" ${f.topic === k ? raw("selected") : ""}>${v}</option>`)}</select></label>
        <label>Organizer<select name="org"><option value="">All organizers</option>${orgs.map((o) => html`<option value="${o.slug}" ${f.org === o.slug ? raw("selected") : ""}>${o.short_name || o.name}</option>`)}</select></label>
        <label>Cost<select name="cost"><option value="">Any cost</option><option value="free" ${f.cost === "free" ? raw("selected") : ""}>Free</option><option value="paid" ${f.cost === "paid" ? raw("selected") : ""}>Paid</option></select></label>
        <label>Format<select name="format"><option value="">In person and virtual</option><option value="in_person" ${f.format === "in_person" ? raw("selected") : ""}>In person</option><option value="virtual" ${f.format === "virtual" ? raw("selected") : ""}>Virtual</option><option value="hybrid" ${f.format === "hybrid" ? raw("selected") : ""}>Hybrid</option></select></label>
        <label class="check"><input type="checkbox" name="cpe" value="1" ${f.cpe ? raw("checked") : ""}> CPE eligible</label>
        <label class="search">Search<input type="search" name="q" value="${f.q}" placeholder="Title or organizer"></label>
        <button class="btn btn-small btn-primary" type="submit">Apply</button>
        ${anyFilter ? html`<a class="clear" href="${view === "month" ? keep({ topic: "", org: "", cost: "", cpe: "", format: "", q: "", view: "month", month: monthKey.slice(0, 7) }) : `/${city.slug}`}">Clear</a>` : ""}
      </form>
    </div>
  </section>`;
}

function weekStrip(weekStart, events, today) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(weekStart, i);
    const n = events.filter((e) => e.start_at.slice(0, 10) === k).length;
    days.push({ k, n, past: k < today, today: k === today });
  }
  return html`<div class="wrap"><ol class="week-strip" aria-label="The next seven days">
    ${days.map((d) => html`<li class="${d.today ? "is-today" : ""} ${d.past ? "is-past" : ""} ${d.n ? "has-events" : ""}">
      ${d.n && !d.past ? html`<a href="#d-${d.k}">` : html`<span>`}
        <span class="ws-day">${weekday3(d.k)}</span><span class="ws-num">${dayNum(d.k)}</span><span class="ws-count">${d.n ? `${d.n} event${d.n === 1 ? "" : "s"}` : ""}</span>
      ${d.n && !d.past ? html`</a>` : html`</span>`}
    </li>`)}
  </ol></div>`;
}

function monthGrid(city, m, events, today, f) {
  const first = monthStart(m), last = monthEnd(m);
  const dow = wall(first).getUTCDay(); const lead = dow === 0 ? 6 : dow - 1; // Monday first
  const byDay = {}; events.forEach((e) => { const k = e.start_at.slice(0, 10); (byDay[k] = byDay[k] || []).push(e); });
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dayNum(last); d++) cells.push(`${m.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); }); p.set("view", "month");
  const link = (mk) => { const q = new URLSearchParams(p); q.set("month", mk.slice(0, 7)); return `/${city.slug}?` + q; };
  return html`
  <div class="wrap">
    <div class="month-nav"><a href="${link(addMonths(m, -1))}">&larr; ${month3(addMonths(m, -1))}</a><a href="${link(addMonths(m, 1))}">${month3(addMonths(m, 1))} &rarr;</a></div>
    <div class="month-grid" role="grid">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => html`<div class="mg-head">${d}</div>`)}
      ${cells.map((k) => k ? html`<div class="mg-cell ${k === today ? "is-today" : ""} ${k < today ? "is-past" : ""}"><span class="mg-num">${dayNum(k)}</span>
          ${(byDay[k] || []).slice(0, 4).map((e) => html`<a class="mg-ev ${e.is_better_security_event ? "is-bs" : ""}" href="/${city.slug}/events/${e.slug}" title="${e.title}"><span class="mg-time">${fmtTime(e.start_at)}</span> ${e.title}</a>`)}
          ${(byDay[k] || []).length > 4 ? html`<a class="mg-more" href="/${city.slug}?from=${k}">+${byDay[k].length - 4} more</a>` : ""}
        </div>` : html`<div class="mg-cell is-blank"></div>`)}
    </div>
    <div class="month-list"><h2>All events in ${monthName(m)}</h2>${dayList(events, { empty: "Nothing published for this month yet." })}</div>
  </div>`;
}
