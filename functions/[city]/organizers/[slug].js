import { html, page, notFound } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { upcomingEvents, queryEvents, dayList } from "../../_lib/events.js";
import { nowLocalIso, todayKey, fmtDateLong, fmtTime, fmtTimeRange } from "../../_lib/dates.js";
import { findClashes, eventsOnDate } from "../../_lib/clashes.js";
import { CITIES, eventPath, SHOW_BS_EVENTS } from "../../_lib/constants.js";

export async function onRequestGet({ params, env, request }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const o = await env.DB.prepare("SELECT * FROM organizations WHERE slug=?").bind(params.slug).first();
  if (!o || (!SHOW_BS_EVENTS && o.slug === "better-security")) return notFound("Organizer not found");
  // An organizer page shows that organizer's events in this city plus its virtual sessions.
  // A hybrid event flagged also_virtual comes back from both lists; keep one copy.
  const merge = (a, b) => [...new Map(a.concat(b).map((e) => [e.id, e])).values()].sort((x, y) => x.start_at < y.start_at ? -1 : 1);
  const upcoming = merge(await upcomingEvents(env.DB, { city: city.slug, org: o.slug, limit: 50 }), await upcomingEvents(env.DB, { city: "virtual", org: o.slug, limit: 50 }));
  const past = merge(await queryEvents(env.DB, { city: city.slug, org: o.slug, to: nowLocalIso(), limit: 400 }), await queryEvents(env.DB, { city: "virtual", org: o.slug, to: nowLocalIso(), limit: 400 })).reverse().slice(0, 8);
  // No published events at all (for example an employer added from a job post): there is no organizer page to show.
  if (!upcoming.length && !past.length) return notFound("Organizer not found");
  // Clashes: this organizer's upcoming in person dates that start within two hours of another group's event.
  const clashes = await findClashes(env.DB, upcoming.filter((e) => e.city === city.slug));
  const clashRows = upcoming.filter((e) => clashes.has(e.id))
    .map((e) => ({ e, hits: clashes.get(e.id).filter((x) => x.organization_id !== o.id) })) // their own sessions do not count
    .filter((r) => r.hits.length);
  // "Check a date": what is already on the city calendar that day.
  const check = new URL(request.url).searchParams.get("date") || "";
  const checkDate = /^\d{4}-\d{2}-\d{2}$/.test(check) ? check : "";
  const onDate = checkDate ? await eventsOnDate(env.DB, city.slug, checkDate) : null;
  const name = o.short_name || o.name;
  const body = html`
  <div class="wrap narrow org-page">
    <p class="crumbs"><a href="/${city.slug}">${city.name} calendar</a> <span class="sep"></span> <a href="/${city.slug}/organizers">Organizers</a></p>
    <h1>${o.name}</h1>
    ${o.description ? html`<p class="lede">${o.description}</p>` : ""}
    <dl class="event-facts">
      ${o.usual_cadence_text ? html`<div><dt>Usually meets</dt><dd>${o.usual_cadence_text}</dd></div>` : ""}
      ${o.cost_notes ? html`<div><dt>Cost</dt><dd>${o.cost_notes}</dd></div>` : ""}
      ${o.cpe_notes ? html`<div><dt>CPE</dt><dd>${o.cpe_notes}</dd></div>` : ""}
      <div><dt>Links</dt><dd>${o.website ? html`<a href="${o.website}" rel="noopener" target="_blank">Website</a>` : ""}${o.events_url ? html` <span class="sep"></span> <a href="${o.events_url}" rel="noopener" target="_blank">Their events page</a>` : ""}${o.linkedin_url ? html` <span class="sep"></span> <a href="${o.linkedin_url}" rel="noopener" target="_blank">LinkedIn</a>` : ""}</dd></div>
    </dl>
    <h2>Upcoming</h2>
    ${dayList(upcoming, { empty: "No upcoming events listed yet. If you run this group, submit your next one and it appears here." })}
    ${clashRows.length ? html`<div class="clash-box">
      <h2>Heads up on dates</h2>
      <ul>${clashRows.map(({ e, hits }) => html`<li><a href="${eventPath(e)}">${e.title}</a> on ${fmtDateLong(e.start_at)} starts within two hours of ${hits.map((x, i) => html`${i ? " and " : ""}<a href="${eventPath(x)}">${x.title}</a> at ${fmtTime(x.start_at)}`)}.</li>`)}</ul>
    </div>` : ""}
    <form class="date-check" method="get" action="/${city.slug}/organizers/${o.slug}#date-check" id="date-check">
      <h2>Planning a date?</h2>
      <p>See what is already on The Watch ${city.name} that day before you lock it in.</p>
      <div class="date-check-row"><label class="sr-only" for="dc-date">Date</label><input id="dc-date" type="date" name="date" value="${checkDate}" min="${todayKey()}" required><button class="btn btn-outline" type="submit">Check the date</button></div>
      ${onDate ? (onDate.length
        ? html`<ul class="date-check-results">${onDate.map((x) => html`<li><span class="dc-time">${fmtTimeRange(x.start_at, x.end_at) || "All day"}</span> <a href="${eventPath(x)}">${x.title}</a>${x.org_short || x.org_name ? html` <span class="dc-org">${x.org_short || x.org_name}</span>` : ""}${x.format === "virtual" ? html` <span class="dc-org">(online)</span>` : ""}</li>`)}</ul>`
        : html`<p class="date-check-clear">${fmtDateLong(checkDate)} is open. Nothing is on the ${city.name} calendar that day yet.</p>`) : ""}
    </form>
    ${past.length ? html`<h2>Recent</h2><ul class="event-list past">${past.map((e) => html`<li class="event-row"><div class="event-time">${e.start_at.slice(0, 10)}</div><div class="event-main"><h3 class="event-title"><a href="${eventPath(e)}">${e.title}</a></h3></div></li>`)}</ul>` : ""}
    <p><a class="btn btn-outline" href="/submit?org=${o.slug}">Submit an event for ${o.short_name || o.name}</a></p>
  </div>`;
  return page(shell({ title: o.name, description: o.description, body, city: city.slug, path: `/${city.slug}` }), 200, { "Cache-Control": "public, max-age=300" });
}
