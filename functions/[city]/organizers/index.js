import { html, page, notFound } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { upcomingEvents } from "../../_lib/events.js";
import { fmtDateLong, fmtTimeRange } from "../../_lib/dates.js";
import { CITIES, eventPath, orgPath, SHOW_BS_EVENTS } from "../../_lib/constants.js";

// Group order and headings for the directory. Anything with an unknown type lands in "Other organizers".
const GROUPS = [
  ["chapter", "Professional chapters", "ISACA, ISSA, ISC2, OWASP, IIA, IAPP and the other member associations."],
  ["meetup", "Meetups", "Free practitioner groups that meet on a regular rhythm."],
  ["conference", "Conferences and summits", "Annual and regional gatherings, some application only."],
  ["community", "Community groups", "Nonprofits, councils and independent communities."],
  ["university", "Universities", "Public talks, research events and career nights."],
  ["government", "Government", "Agencies and public sector programs."],
  ["vendor", "Vendors", "Security companies that host their own in person events."],
  ["media", "Media and event series", "Publications and producers that run events here."],
];

export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");

  // Every organization with at least one published event filed under this city, past or upcoming.
  const { results: orgs } = await env.DB.prepare(
    `SELECT o.id, o.slug, o.name, o.short_name, o.type, o.usual_cadence_text, o.description,
            COUNT(e.id) AS n, MAX(e.start_at) AS last_at
     FROM organizations o JOIN events e ON e.organization_id = o.id
     WHERE e.city = ? AND e.status = 'published'${SHOW_BS_EVENTS ? "" : " AND COALESCE(e.is_better_security_event, 0) = 0 AND COALESCE(o.slug, '') != 'better-security'"}
     GROUP BY o.id`
  ).bind(city.slug).all();
  const visible = orgs.filter((o) => SHOW_BS_EVENTS || o.slug !== "better-security");

  // Next upcoming event per organizer in this city.
  const next = new Map();
  for (const e of await upcomingEvents(env.DB, { city: city.slug, limit: 1000 })) {
    if (e.org_slug && !next.has(e.org_slug)) next.set(e.org_slug, e);
  }

  const known = new Set(GROUPS.map((g) => g[0]));
  const groups = GROUPS.concat([["other", "Other organizers", ""]]).map(([type, label, blurb]) => ({
    type, label, blurb,
    items: visible
      .filter((o) => (type === "other" ? !known.has(o.type) : o.type === type))
      .sort((a, b) => (a.short_name || a.name).localeCompare(b.short_name || b.name)),
  })).filter((g) => g.items.length);

  const withNext = visible.filter((o) => next.has(o.slug)).length;

  const body = html`
  <div class="wrap narrow org-dir">
    <p class="crumbs"><a href="/${city.slug}">${city.name} calendar</a> <span class="sep"></span> Organizers</p>
    <h1>Who runs security events in ${city.name}</h1>
    <p class="lede">${!visible.length ? `No organizers have put events on The Watch ${city.name} yet. As chapters, meetups and conferences submit their dates, each one gets a page here.`
      : html`${visible.length === 1 ? "One organization has" : `${visible.length} organizations have`} put events on The Watch ${city.name}, and ${withNext === visible.length ? (visible.length === 1 ? "it has" : "every one of them has") : withNext === 0 ? "none of them has" : `${withNext} of them ${withNext === 1 ? "has" : "have"}`} something on the calendar right now. Each one links to its own page with every upcoming date.`}</p>
    ${groups.length > 1 ? html`<nav class="dir-jump" aria-label="Jump to a group">${groups.map((g) => html`<a href="#${g.type}">${g.label} <span>${g.items.length}</span></a>`)}</nav>` : ""}
    ${groups.map((g) => html`
    <section class="dir-group" id="${g.type}">
      <h2>${g.label}</h2>
      ${g.blurb ? html`<p class="dir-blurb">${g.blurb}</p>` : ""}
      <ul class="dir-list">
        ${g.items.map((o) => {
          const e = next.get(o.slug);
          return html`<li class="dir-item">
            <h3><a href="${orgPath(o.slug, city.slug)}">${o.name}</a></h3>
            ${o.description ? html`<p class="dir-desc">${o.description}</p>` : ""}
            ${o.usual_cadence_text ? html`<p class="dir-cadence">${o.usual_cadence_text}</p>` : ""}
            <p class="dir-next">${e
              ? html`<span class="dir-label">Next</span> <a href="${eventPath(e)}">${e.title}</a> <span class="dir-when">${fmtDateLong(e.start_at)}${fmtTimeRange(e.start_at, e.end_at) ? `, ${fmtTimeRange(e.start_at, e.end_at)}` : ""}</span>`
              : html`<span class="dir-label dir-label-quiet">No date listed yet</span> <span class="dir-when">Last on the calendar ${fmtDateLong(o.last_at)}</span>`}</p>
          </li>`;
        })}
      </ul>
    </section>`)}
    <div class="dir-cta">
      <h2>Run a group that is missing?</h2>
      <p>Submit your next event and your organization gets a page here once it is approved.</p>
      <p><a class="btn btn-primary" href="/submit">Submit an event</a></p>
    </div>
  </div>`;

  return page(
    shell({ head: visible.length ? "" : '<meta name="robots" content="noindex">', title: `Organizers in ${city.name}`, description: `Every chapter, meetup, conference and company that runs cybersecurity, privacy and audit events in ${city.region || city.name}, with each one's next date.`, body, city: city.slug, path: `/${city.slug}/organizers` }),
    200,
    { "Cache-Control": "public, max-age=300" }
  );
}
