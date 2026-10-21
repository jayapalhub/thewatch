import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";

export async function onRequestGet() {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow"><p class="kicker">Last updated October 2026</p><h1>Terms</h1></div></section>
  <section class="band"><div class="wrap narrow prose">
    <h2>The calendar</h2>
    <p>Event listings are compiled from organizers' public pages and from submissions, and are reviewed before publishing, but dates, times, prices and CPE details can change without notice and the organizer's own page is always the authoritative source. Better Security is not the organizer of third party events and isn't responsible for them. CPE eligibility is as reported by the organizer; confirm with your certifying body.</p>
    <h2>Submissions</h2>
    <p>By submitting an event you confirm you're authorized to promote it and you give Better Security permission to publish, edit for clarity and distribute the listing in the calendar, feeds and email. We can decline or remove any listing, and we generally decline events that are sales presentations without an educational or community purpose.</p>
    <h2>Better Security events</h2>
    <p>Tickets for Better Security's own events are sold through Eventbrite under the terms shown at purchase, including the refund policy on each event page. Participation in physical activities such as padel is at your own risk; venues will ask you to sign their own waiver.</p>
    <h2>Content and feeds</h2>
    <p>You're welcome to link to any page and to use the public calendar feeds for personal use or to cross list events, with attribution to The Watch (bettersecurity.ai). Please don't scrape the subscriber forms or republish the site wholesale.</p>
    <h2>Contact</h2>
    <p><a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a></p>
  </div></section>`;
  return page(shell({ title: "Terms", body, path: "/terms" }), 200, { "Cache-Control": "public, max-age=3600" });
}
