import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { MEDIA_KIT_MIN_SUBSCRIBERS, cityListText } from "./_lib/constants.js";

export async function onRequestGet({ env }) {
  const cities = cityListText();
  const subs = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE status='active'").first().catch(() => ({ n: 0 }));
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Sponsorship</p>
    <h1>We don't sell lists. We build rooms.</h1>
    <p class="lede">Better Security reaches the security community in ${cities} two ways: the Sunday email that practitioners read to plan their week, and a small number of events where the right twenty or two hundred people are in one place. Sponsors fund the room and meet the people in it. Attendee data stays with attendees.</p>
  </div></section>
  <section class="band band-paper"><div class="wrap narrow">
    <div class="three-up">
      <div><h2>The Sunday email</h2><p>One sponsor slot per issue, placed between the personal note and the week's listings, written in plain language and clearly marked. Good for a field event you're running, a report you want read, or simply being the name security people see every Sunday.</p></div>
      <div><h2>Events</h2><p>Better Security will run a small number of its own events for practitioners, each with a handful of sponsor spots. Details are being finalized; ask and we will tell you what is coming.</p></div>
      <div><h2>Dinners and roundtables</h2><p>Around twenty qualified practitioners on one topic, invited by hand from the subscriber base, one sponsor at the table, no pitch required. The most effective format we run and the one with the shortest guest list.</p></div>
    </div>
  </div></section>
  <section class="band"><div class="wrap narrow split">
    <div>
      <h2>Who you reach</h2>
      <p>Security, GRC, audit, privacy and AI governance professionals across ${cities}, weighted toward mid career and senior practitioners because that's who our events are built for and who the Sunday email is written for. Subscribers tell us their role, seniority and areas of interest when they sign up, which is how we match the right people to a dinner topic.</p>
      <p>${subs.n >= MEDIA_KIT_MIN_SUBSCRIBERS ? html`<strong>${subs.n}</strong> subscribers and counting.` : html`The list is new and growing weekly; ask for current numbers.`} Jerome Jayapal, who writes The Watch, sits on the ISACA San Diego chapter board as Community Director and has spent more than a decade in enterprise security, which is why the people who come are the people who do the work.</p>
      <h2>How it works</h2>
      <p>Coverage by city, audience and placements are in the <a href="/sponsor/media-kit">media kit</a>, updated live from the calendar.</p>
      <p>Fill in the form and you'll get the current sponsor deck with options and pricing within two business days, then a short call to match you to the right format. We keep the number of sponsors per issue and per event small on purpose.</p>
    </div>
    <form class="form" id="sponsor-form" method="post" action="/api/sponsor" data-ajax>
      <input type="text" name="website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <h2>Talk to Jerome</h2>
      <label>Company <input name="company" required maxlength="120"></label>
      <div class="row-2">
        <label>Your name <input name="contact_name" required maxlength="100"></label>
        <label>Role <input name="role_title" maxlength="100" placeholder="Field marketing manager"></label>
      </div>
      <label>Work email <input type="email" name="email" required></label>
      <label>Most interested in <select name="interest"><option value="newsletter">The Sunday email</option><option value="event">An upcoming Better Security event</option><option value="dinner">A sponsored dinner or roundtable</option><option value="multiple">A combination</option></select></label>
      <label>Anything we should know <textarea name="message" rows="4" maxlength="3000" placeholder="Products, target roles, timing, budget range if you have one"></textarea></label>
      <label class="check"><input type="checkbox" name="subscribe" value="1" checked> Send me The Watch on Sundays too</label>
      <button class="btn btn-primary" type="submit">Request the sponsor deck</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>`;
  return page(shell({ title: "Sponsor", description: `Reach the security community in ${cities} through The Watch Sunday email and Better Security events.`, body, path: "/sponsor" }));
}
