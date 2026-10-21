import { html, page, notFound } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { upcomingEvents, queryEvents, dayList } from "../../_lib/events.js";
import { nowLocalIso } from "../../_lib/dates.js";
import { CITIES, eventPath } from "../../_lib/constants.js";

export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const o = await env.DB.prepare("SELECT * FROM organizations WHERE slug=?").bind(params.slug).first();
  if (!o) return notFound("Organizer not found");
  // An organizer page shows that organizer's events in this city plus its virtual sessions.
  const merge = (a, b) => a.concat(b).sort((x, y) => x.start_at < y.start_at ? -1 : 1);
  const upcoming = merge(await upcomingEvents(env.DB, { city: city.slug, org: o.slug, limit: 50 }), await upcomingEvents(env.DB, { city: "virtual", org: o.slug, limit: 50 }));
  const past = merge(await queryEvents(env.DB, { city: city.slug, org: o.slug, to: nowLocalIso(), limit: 400 }), await queryEvents(env.DB, { city: "virtual", org: o.slug, to: nowLocalIso(), limit: 400 })).reverse().slice(0, 8);
  const body = html`
  <div class="wrap narrow org-page">
    <p class="crumbs"><a href="/${city.slug}">${city.name} calendar</a> <span class="sep"></span> Organizer</p>
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
    ${past.length ? html`<h2>Recent</h2><ul class="event-list past">${past.map((e) => html`<li class="event-row"><div class="event-time">${e.start_at.slice(0, 10)}</div><div class="event-main"><h3 class="event-title"><a href="${eventPath(e)}">${e.title}</a></h3></div></li>`)}</ul>` : ""}
    <p><a class="btn btn-outline" href="/submit?org=${o.slug}">Submit an event for ${o.short_name || o.name}</a></p>
  </div>`;
  return page(shell({ title: o.name, description: o.description, body, city: city.slug, path: `/${city.slug}` }), 200, { "Cache-Control": "public, max-age=300" });
}
