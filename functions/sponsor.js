import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { MEDIA_KIT_MIN_SUBSCRIBERS } from "./_lib/constants.js";

export async function onRequestGet({ env }) {
  const subs = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE status='active'").first().catch(() => ({ n: 0 }));
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Sponsorship</p>
    <h1>We don't sell lists. We build rooms.</h1>
    <p class="lede">Better Security reaches San Diego's security and technology community two ways: the Sunday email that practitioners read to plan their week, and small, invite only experiences where the right people are in one room. Sponsors make the room possible and meet the people in it. Attendee details stay with attendees.</p>
  </div></section>
  <section class="band band-paper"><div class="wrap narrow">
    <div class="three-up">
      <div><h2>The Sunday email</h2><p>One sponsor slot per issue, placed between the personal note and the week's listings, written in plain language and clearly marked. Good for a field event you're running, a report you want read, or simply being the name security people see every Sunday.</p></div>
      <div><h2>Experiences</h2><p>Starting in 2027, Better Security hosts a small number of invite only experiences each year, some over a meal and some around an activity, each built for a particular group of practitioners. Each one has a small number of sponsor places. Ask and we will tell you what is coming.</p></div>
      <div><h2>Matched rooms</h2><p>Guests are invited by role and by the areas they own, from people who asked for an invitation and told us what they work on. A sponsor meets a room chosen for its fit, with time for real conversation rather than a pitch.</p></div>
    </div>
  </div></section>
  <section class="band"><div class="wrap narrow split">
    <div>
      <h2>Who you reach</h2>
      <p>Security and IT practitioners and leaders across San Diego, from the engineers and analysts doing the work to the managers, directors and executives who own the decisions. People who request an invitation tell us their seniority and the areas they own or influence, from identity and cloud security to IT operations and security leadership, which is how each room is matched.</p>
      <p>${subs.n >= MEDIA_KIT_MIN_SUBSCRIBERS ? html`<strong>${subs.n}</strong> subscribers and counting.` : html`The list is new and growing weekly; ask for current numbers.`} Jerome Jayapal, who writes The Watch, has spent more than a decade in enterprise security and is active across San Diego's security community, which is why the people who come are the people who do the work.</p>
      <h2>How it works</h2>
      <p>Coverage, audience and placements are in the <a href="/sponsor/media-kit">media kit</a>, updated live from the calendar.</p>
      <p>Fill in the form and you'll get the current sponsor deck with options and pricing within two business days, then a short call to match you to the right format. We keep the number of sponsors per issue and per experience small on purpose.</p>
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
      <label>Most interested in <select name="interest"><option value="newsletter">The Sunday email</option><option value="event">An upcoming Better Security experience</option><option value="dinner">A matched room for a particular audience</option><option value="multiple">A combination</option></select></label>
      <label>Anything we should know <textarea name="message" rows="4" maxlength="3000" placeholder="Products, target roles, timing, budget range if you have one"></textarea></label>
      <label class="check"><input type="checkbox" name="subscribe" value="1" checked> Send me The Watch on Sundays too</label>
      <button class="btn btn-primary" type="submit">Request the sponsor deck</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>`;
  return page(shell({ title: "Sponsor", description: "Reach San Diego's security and technology community through The Watch Sunday email and Better Security's invite only experiences.", body, path: "/sponsor" }));
}
