import { html, page, raw } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { interestForm } from "../_lib/forms.js";

// Padel Social 2027. Registration button switches from the interest form to
// Eventbrite when PADEL_EVENTBRITE_URL is set in the Pages environment.
import { SHOW_BS_EVENTS } from "../_lib/constants.js";
import { notFound as _nf } from "../_lib/html.js";
export async function onRequestGet(ctx) { if (!SHOW_BS_EVENTS) return _nf("Not yet"); return _onRequestGet(ctx); }
async function _onRequestGet({ env }) {
  const eventbrite = env.PADEL_EVENTBRITE_URL || "";
  const { results: sponsors } = await env.DB.prepare("SELECT name, logo_url, website FROM organizations WHERE type='vendor' AND notes LIKE '%padel-sponsor%' ORDER BY name").all().catch(() => ({ results: [] }));

  const body = html`
  <section class="hero hero-padel">
    <div class="wrap">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="kicker">Better Security presents</p>
          <h1>Padel Social 2027</h1>
          <p class="lede">Thursday, March 18, 2027, 5:30 to 7:30 PM<br>Padel N9NE, Sorrento Valley, San Diego</p>
          <p>Two hours of padel, the fastest growing racquet sport in the world and the easiest to pick up, with a room full of San Diego security, audit, risk and privacy people. Coaching for first timers, open play for everyone else, food, a DJ and no slide decks.</p>
          <p class="price">$35 general admission</p>
          ${eventbrite
            ? html`<a class="btn btn-electric btn-large" href="${eventbrite}" rel="noopener" target="_blank">Get tickets on Eventbrite</a>`
            : html`<div class="interest-box"><p><strong>Registration opens soon.</strong> Leave your email and you'll get the ticket link first.</p>${interestForm({ key: "padel_2027", cta: "Send me the ticket link" })}</div>`}
        </div>
        <div class="hero-card padel-facts">
          <h2>What to expect</h2>
          <ul class="fact-list">
            <li><strong>Courts for everyone.</strong> Beginners get a short clinic from the Padel N9NE pros, then rotate into friendly games. Experienced players get matched by level.</li>
            <li><strong>Bring nothing.</strong> Paddles and balls are provided. Wear court or running shoes and something you can move in.</li>
            <li><strong>Food and drinks</strong> served courtside through the evening.</li>
            <li><strong>Who comes.</strong> Practitioners and leaders in security, GRC, audit, privacy and AI from across San Diego County. This is a social, not a sales floor.</li>
            <li><strong>Getting there.</strong> Padel N9NE is in Sorrento Valley with on site parking. Doors at 5:15.</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="band band-paper">
    <div class="wrap narrow">
      <h2>Why padel</h2>
      <p>Security events in San Diego mostly happen at a podium or a bar. We wanted a third option: something active enough to break the ice, easy enough that nobody needs to have played, and short enough to fit a Thursday evening. Padel is played in doubles on an enclosed court, the rallies are long and forgiving, and after one game strangers are a team.</p>
      <h2>Sponsors</h2>
      ${sponsors.length
        ? html`<div class="sponsor-logos">${sponsors.map((s) => html`<a href="${s.website || "#"}" rel="noopener" target="_blank">${s.logo_url ? html`<img src="${s.logo_url}" alt="${s.name}">` : s.name}</a>`)}</div>`
        : html`<p>Sponsor spots for the Padel Social are open. Each sponsor gets a court activation, a welcome mention and logo placement across the event and the calendar. <a href="/sponsor">See how sponsorship works</a> or write to <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>.</p>`}
      <h2>Questions</h2>
      <p><strong>I've never played.</strong> Perfect, most people there won't have either. The clinic covers everything in fifteen minutes.<br>
      <strong>Can I come and not play?</strong> Yes. Plenty of people come for the food and the people and watch from courtside.<br>
      <strong>Refunds.</strong> Full refund up to seven days before the event, and tickets are transferable any time.<br>
      <strong>Is there member pricing?</strong> Community partner pricing will be announced with the ticket link.</p>
    </div>
  </section>`;

  const head = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "SocialEvent", name: "Padel Social 2027",
    startDate: "2027-03-18T17:30:00-07:00", endDate: "2027-03-18T19:30:00-07:00",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: "Padel N9NE", address: { "@type": "PostalAddress", addressLocality: "San Diego", addressRegion: "CA" } },
    organizer: { "@type": "Organization", name: "Better Security", url: "https://bettersecurity.ai" },
    offers: { "@type": "Offer", price: "35", priceCurrency: "USD", availability: eventbrite ? "https://schema.org/InStock" : "https://schema.org/PreOrder", url: eventbrite || "https://bettersecurity.ai/events/padel-social-2027" },
  })}</script>`;

  return page(shell({ title: "Padel Social 2027", description: "Thursday, March 18, 2027 at Padel N9NE, Sorrento Valley. Padel, food and a DJ with San Diego's security community. $35.", body, path: "/events", head }), 200, { "Cache-Control": "public, max-age=300" });
}
