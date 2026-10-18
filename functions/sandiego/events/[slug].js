import { html, page, notFound } from "../../_lib/html.js";
import { shell, signupForm } from "../../_lib/layout.js";
import { eventBySlug, eventTags, upcomingEvents, eventRow, eventJsonLd, costLabel } from "../../_lib/events.js";
import { fmtDateLong, fmtTimeRange } from "../../_lib/dates.js";
import { googleCalendarUrl, outlookUrl } from "../../_lib/calendar.js";
import { FORMATS, AUDIENCE } from "../../_lib/constants.js";

export async function onRequestGet({ params, env }) {
  const e = await eventBySlug(env.DB, params.slug);
  if (!e || !["published", "cancelled"].includes(e.status)) return notFound("Event not found");
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const more = e.org_slug ? (await upcomingEvents(env.DB, { org: e.org_slug, limit: 4 })).filter((x) => x.id !== e.id).slice(0, 3) : [];
  const where = e.format === "virtual" ? "Online" : [e.venue_display, e.venue_address_display].filter(Boolean).join(", ");
  const mapsUrl = e.format !== "virtual" && where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : null;

  const body = html`
  <article class="event-page">
    <div class="wrap narrow">
      <p class="crumbs"><a href="/sandiego">Calendar</a> <span class="sep"></span> ${e.org_display ? html`<a href="/sandiego/organizers/${e.org_slug}">${e.org_display}</a>` : "Event"}</p>
      ${e.status === "cancelled" ? html`<p class="notice notice-warn">This event has been cancelled by the organizer.</p>` : ""}
      <h1>${e.title}</h1>
      <div class="tags">${eventTags(e)}</div>
      <dl class="event-facts">
        <div><dt>When</dt><dd>${fmtDateLong(e.start_at)}<br>${fmtTimeRange(e.start_at, e.end_at) || "Time to be announced"} Pacific</dd></div>
        <div><dt>Where</dt><dd>${where || "To be announced"}${mapsUrl ? html`<br><a href="${mapsUrl}" rel="noopener" target="_blank">Open in Maps</a>` : ""}${e.format === "hybrid" ? html`<br>Also available online` : ""}</dd></div>
        <div><dt>Cost</dt><dd>${costLabel(e) || "Not listed"}${e.cost_notes ? html`<br><small>${e.cost_notes}</small>` : ""}${e.member_price_notes ? html`<br><small>${e.member_price_notes}</small>` : ""}</dd></div>
        ${e.cpe_eligible ? html`<div><dt>CPE</dt><dd>Organizer reports ${e.cpe_hours ? `${e.cpe_hours} hours` : "credit"}${e.cpe_body ? ` (${e.cpe_body})` : ""}${e.cpe_notes ? html`<br><small>${e.cpe_notes}</small>` : ""}</dd></div>` : ""}
        <div><dt>Who it's for</dt><dd>${AUDIENCE[e.audience_level] || "Open to all"}</dd></div>
      </dl>
      ${e.discount_code ? html`<p class="notice notice-deal"><strong>Subscriber discount:</strong> ${e.discount_text || "Use this code when you register."} <code>${e.discount_code}</code></p>` : ""}
      <div class="cta-row">
        ${e.registration_url && e.status !== "cancelled" ? html`<a class="btn btn-primary" href="/go/${e.id}?t=register" rel="noopener">Register with the organizer</a>` : ""}
        <details class="add-cal"><summary class="btn btn-outline">Add to calendar</summary>
          <div class="add-cal-menu">
            <a href="${googleCalendarUrl(e, siteUrl)}" target="_blank" rel="noopener">Google Calendar</a>
            <a href="${outlookUrl(e, siteUrl)}" target="_blank" rel="noopener">Outlook.com</a>
            <a href="/sandiego/events/${e.slug}/ics">Apple, Outlook desktop (.ics)</a>
          </div></details>
      </div>
      <div class="event-body">${(e.description_long || e.description_short || "").split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>
      ${e.source_url ? html`<p class="source">Details from <a href="${e.source_url}" rel="noopener nofollow" target="_blank">the organizer's page</a>. Times and prices can change; the organizer's page is authoritative. <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Correction: " + e.title)}">Report a correction</a>.</p>` : ""}
    </div>
  </article>
  ${more.length ? html`<section class="band band-paper"><div class="wrap narrow"><h2>More from ${e.org_display}</h2><ul class="event-list">${more.map(eventRow)}</ul></div></section>` : ""}
  <section class="band band-navy band-tight"><div class="wrap split-center"><div><h2>Never miss one.</h2><p>The Sunday email has the whole week.</p></div>${signupForm({ source: "event:" + e.slug })}</div></section>
  ${eventJsonLd(e, siteUrl)}`;

  return page(shell({ title: e.title, description: e.description_short || `${fmtDateLong(e.start_at)} in San Diego`, body, path: "/sandiego" }), 200, { "Cache-Control": "public, max-age=300" });
}
