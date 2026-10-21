import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";

export async function onRequestGet({ request }) {
  const src = new URL(request.url).searchParams.get("src") || "subscribe_page";
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Sundays at 5 PM</p>
    <h1>The week in San Diego security, in one email.</h1>
    <p class="lede">A short note from Jerome, then the week day by day: chapter meetings, meetups, summits and vendor sessions. Which ones carry CPE, which ones cost money, and which ones are worth your evening.</p>
    ${signupForm({ source: src.replace(/[^a-z0-9_:-]/gi, "").slice(0, 40) || "subscribe_page" })}
  </div></section>
  <section class="band band-paper"><div class="wrap narrow three-up">
    <div><h2>Two minute read</h2><p>Scannable by design. If you only read the day headers and the picks, you still know your week.</p></div>
    <div><h2>Nothing sold</h2><p>One clearly marked sponsor per issue. Your email is never shared with organizers or sponsors.</p></div>
    <div><h2>Invitations</h2><p>Tell us your role and interests after you sign up and you'll be first to hear about Better Security's dinners and roundtables on your topic.</p></div>
  </div></section>`;
  return page(shell({ title: "Subscribe", body, path: "/subscribe" }));
}
