import { html, page, raw } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { TOPICS } from "./_lib/constants.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pre = url.searchParams.get("org") || "";
  const { results: orgs } = await env.DB.prepare("SELECT slug, name FROM organizations ORDER BY name").all();
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">For organizers</p>
    <h1>Submit an event</h1>
    <p class="lede">Anything security related happening in San Diego County belongs here: chapter meetings, meetups, conferences, vendor sessions, university talks. Submissions are reviewed by a person, usually within a day, and published to the calendar, the feed and the Sunday email.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <form class="form big-form" method="post" action="/api/submit" data-ajax>
      <input type="text" name="website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset>
        <legend>The event</legend>
        <label>Event title <input name="title" required maxlength="140" placeholder="November chapter meeting: Securing AI agents"></label>
        <div class="row-2">
          <label>Organization <select name="organization_slug" required><option value="">Choose one</option>${orgs.map((o) => html`<option value="${o.slug}" ${o.slug === pre ? raw("selected") : ""}>${o.name}</option>`)}<option value="__new">My organization isn't listed</option></select></label>
          <label class="new-org" hidden>New organization name <input name="organization_new" maxlength="120"></label>
        </div>
        <div class="row-3">
          <label>Date <input type="date" name="date" required min="2026-10-01"></label>
          <label>Start time <span class="hint">Pacific time</span><input type="time" name="start_time" required></label>
          <label>End time <input type="time" name="end_time"></label>
        </div>
        <div class="row-2">
          <label>Which calendar <select name="calendar"><option value="sandiego">San Diego (in person or local online)</option><option value="virtual">Virtual (online, open to anyone)</option></select></label>
          <label>Format <select name="format"><option value="in_person">In person</option><option value="virtual">Virtual</option><option value="hybrid">Hybrid</option></select></label>
          <label>Registration link <input type="url" name="registration_url" required placeholder="https://"></label>
        </div>
        <div class="row-2">
          <label>Venue name <input name="venue_name" maxlength="120" placeholder="XiFin, Sorrento Valley"></label>
          <label>Venue address <input name="venue_address" maxlength="200"></label>
        </div>
        <label>One line summary <span class="hint">Under 200 characters. This is what appears in the list and the email.</span><input name="description_short" required maxlength="200"></label>
        <label>Full description <span class="hint">Optional. Speakers, agenda, who it's for.</span><textarea name="description_long" rows="5" maxlength="4000"></textarea></label>
      </fieldset>
      <fieldset>
        <legend>Cost and credit</legend>
        <div class="row-3">
          <label>Cost <select name="cost_type"><option value="free">Free</option><option value="paid">Paid</option><option value="members_free">Free for members, paid for guests</option><option value="donation">Donation</option></select></label>
          <label>Lowest price ($) <input type="number" name="cost_min" min="0" step="1"></label>
          <label>Highest price ($) <input type="number" name="cost_max" min="0" step="1"></label>
        </div>
        <label>Pricing notes <input name="cost_notes" maxlength="200" placeholder="$10 for ISACA members, $25 for guests"></label>
        <div class="row-3">
          <label class="check"><input type="checkbox" name="cpe_eligible" value="1"> CPE credit offered</label>
          <label>CPE hours <input type="number" name="cpe_hours" min="0" step="0.5"></label>
          <label>Credit body <select name="cpe_body"><option value="">Not applicable</option><option>ISACA</option><option>ISC2</option><option>IIA</option><option>IAPP</option><option value="other">Other</option></select></label>
        </div>
        <fieldset class="topics"><legend>Topics <span class="hint">Pick up to three.</span></legend>
          ${Object.entries(TOPICS).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="topics" value="${k}"> ${v}</label>`)}
        </fieldset>
        <label>Who is it for? <select name="audience_level"><option value="open">Open to all</option><option value="early_career">Students and early career</option><option value="practitioner">Practitioners</option><option value="senior">Senior leaders</option></select></label>
        <label>Subscriber discount <span class="hint">Optional. A code for Watch subscribers gets your event featured.</span><input name="discount_code" maxlength="40" placeholder="WATCH20"></label>
      </fieldset>
      <fieldset>
        <legend>About you</legend>
        <div class="row-2">
          <label>Your name <input name="submitted_by_name" required maxlength="80"></label>
          <label>Your email <span class="hint">Only used to confirm the listing.</span><input type="email" name="submitted_by_email" required></label>
        </div>
        <label class="check"><input type="checkbox" name="subscribe" value="1" checked> Also send me The Watch San Diego on Sundays</label>
      </fieldset>
      <button class="btn btn-primary btn-large" type="submit">Submit for review</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>`;
  return page(shell({ title: "Submit an event", body, path: "/submit" }));
}
