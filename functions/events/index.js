import { html, page } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { interestForm } from "../_lib/forms.js";

export async function onRequestGet() {
  const body = html`
  <section class="hero hero-short">
    <div class="wrap narrow">
      <p class="kicker">Better Security events</p>
      <h1>A few rooms a year, built for the people who do the work.</h1>
      <p class="lede">The calendar covers everyone's events. These are ours: a small number of elevated gatherings where San Diego's mid career and senior security people meet as peers, with sponsors who fund the room rather than fill it.</p>
    </div>
  </section>
  <section class="band">
    <div class="wrap narrow">
      <article class="bs-event">
        <div class="ef-date"><span>18</span><span>Mar 2027</span></div>
        <div>
          <p class="status status-live">Registration opens soon</p>
          <h2><a href="/events/padel-social-2027">Padel Social 2027</a></h2>
          <p>Thursday, March 18, 2027, 5:30 to 7:30 PM at Padel N9NE in Sorrento Valley. Two hours of padel with coaching for first timers, food, a DJ and a room full of security people who would rather rally than network. $35 general admission.</p>
          <a class="btn btn-electric" href="/events/padel-social-2027">Details and early interest</a>
        </div>
      </article>
      <article class="bs-event">
        <div class="ef-date"><span>May</span><span>2027</span></div>
        <div>
          <p class="status">Coming in 2027</p>
          <h2>AI Security Conference</h2>
          <p>A one day, CPE eligible conference on securing and governing AI systems, built for practitioners and the leaders who sign off on them. Date and venue to be announced; May is the working target.</p>
          ${interestForm({ key: "ai_security_conf_2027", cta: "Tell me when details land" })}
        </div>
      </article>
      <article class="bs-event">
        <div class="ef-date"><span>2027</span><span>Series</span></div>
        <div>
          <p class="status">Coming in 2027</p>
          <h2>Sponsored dinners and executive roundtables</h2>
          <p>Small invitation led dinners of around twenty qualified practitioners on a single topic, from vulnerability management to identity, hosted with one sponsor. Tell us what you work on and we'll invite you to the right table.</p>
          ${interestForm({ key: "dinner_series", cta: "Keep me in mind for a dinner" })}
        </div>
      </article>
    </div>
  </section>
  <section class="band band-paper"><div class="wrap narrow split">
    <div><h2>Want to sponsor one?</h2><p>Every Better Security event has a small number of sponsor spots. <a href="/sponsor">See how sponsorship works.</a></p></div>
    <div><h2>Run your own event?</h2><p>It belongs on the calendar. <a href="/submit">Submit it here.</a></p></div>
  </div></section>`;
  return page(shell({ title: "Our events", body, path: "/events" }), 200, { "Cache-Control": "public, max-age=600" });
}
