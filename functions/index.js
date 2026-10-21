import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";
import { upcomingEvents, eventRow, groupByDay, dayHeading } from "./_lib/events.js";
import { addDays, todayKey } from "./_lib/dates.js";
import { CITIES, cityOf, SHOW_BS_EVENTS } from "./_lib/constants.js";

// The root is a city chooser. A returning reader who has visited a calendar is sent straight back to it
// (cookie watch_city) unless they ask to choose again with ?choose=1.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)watch_city=([a-z]+)/);
  const remembered = cookie && cityOf(cookie[1]) ? cookie[1] : null;
  if (remembered && !url.searchParams.has("choose")) return Response.redirect(new URL(`/${remembered}`, request.url).toString(), 302);

  const db = env.DB;
  const today = todayKey();
  const cities = Object.values(CITIES);
  const counts = await Promise.all(cities.map((c) => db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND city=? AND start_at >= ?").bind(c.slug, today).first()));
  const nextByCity = await Promise.all(cities.map((c) => upcomingEvents(db, { city: c.slug, limit: 2 })));
  const virtualCount = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND (city='virtual' OR also_virtual=1) AND start_at >= ?").bind(today).first();
  const [picks, orgCount] = await Promise.all([upcomingEvents(db, { featured: true, limit: 3 }), db.prepare("SELECT COUNT(*) AS n FROM organizations").first()]);

  const body = html`
  <section class="hero hero-short">
    <div class="wrap">
      <p class="kicker">A calendar and a Sunday email for security people</p>
      <h1>Pick your city.</h1>
      <p class="lede">Every cybersecurity, AI security, privacy and audit event near you, from chapter meetings and meetups to the big summits, in one calendar. Plus the best live online sessions with CPE, from anywhere.</p>
    </div>
  </section>
  <section class="band">
    <div class="wrap city-grid">
      ${cities.map((c, i) => html`
      <a class="city-card" href="/${c.slug}">
        <span class="city-card-name">${c.name}</span>
        <span class="city-card-region">${c.region}</span>
        <span class="city-card-count">${counts[i]?.n ?? 0} upcoming event${(counts[i]?.n ?? 0) === 1 ? "" : "s"}${c.newsletter ? " and a Sunday email" : ""}</span>
        ${nextByCity[i].length ? html`<span class="city-card-next">Next: ${nextByCity[i][0].title}</span>` : html`<span class="city-card-next">Calendar filling up</span>`}
      </a>`)}
      <a class="city-card city-card-virtual" href="/virtual">
        <span class="city-card-name">Virtual</span>
        <span class="city-card-region">Live online, from anywhere</span>
        <span class="city-card-count">${virtualCount?.n ?? 0} sessions, most with CPE</span>
        <span class="city-card-next">Webinars, virtual summits and online chapter meetings</span>
      </a>
    </div>
    <div class="wrap"><p class="a-muted city-foot">Your pick is remembered on this device. Not here yet? <a href="mailto:watch@bettersecurity.ai?subject=Bring%20The%20Watch%20to%20my%20city">Tell us your city</a> or <a href="/submit">submit an event</a>.</p></div>
  </section>

  <section class="band band-navy band-tight"><div class="wrap split-center">
    <div><h2>Get the week in your inbox on Sunday.</h2><p>The San Diego email goes out every Sunday at 5 PM with a short note from Jerome. Other cities are on the way; subscribe now and you are on the first send.</p></div>
    ${signupForm({ source: "home" })}
  </div></section>

  <section class="band band-paper">
    <div class="wrap three-up">
      <div><h2>One place, every organizer</h2><p>ISACA, ISSA, OWASP, IIA, IAPP, ISC2, InfraGard, the meetups, the universities and the summits, ${orgCount?.n ?? 0} organizers so far. If it is about security and it is near you, it belongs on the calendar. <a href="/submit">Organizers can submit directly.</a></p></div>
      <div><h2>Filters that matter to practitioners</h2><p>Sort by topic, organizer, cost and format, and see at a glance which sessions carry CPE credit. Add any event to your own calendar in one click, or subscribe to the whole feed.</p></div>
      <div><h2>Curated, not dumped</h2><p>The Sunday email is scannable in two minutes: a short note, the week day by day, and a pick or two when something deserves your evening. No forty item lists.</p></div>
    </div>
  </section>

  ${SHOW_BS_EVENTS ? html`  <section class="band band-navy">
    <div class="wrap split">
      <div>
        <p class="kicker kicker-light">Better Security events</p>
        <h2>A few events of our own, built for practitioners.</h2>
        <p>Alongside the calendar, Better Security runs a small number of elevated events each year where mid career and senior security people meet as peers. First up is the Padel Social in March, with an AI Security Conference and a sponsored dinner series to follow in 2027.</p>
        <p><a class="btn btn-electric" href="/events/padel-social-2027">Padel Social 2027</a> <a class="btn btn-ghost" href="/events">All our events</a></p>
      </div>
      <div class="event-feature">
        <div class="ef-date"><span>18</span><span>Mar 2027</span></div>
        <div><h3>Padel Social 2027</h3><p>Thursday, 5:30 to 7:30 PM at Padel N9NE, Sorrento Valley. Courts, coaching for first timers, food and a DJ. $35 general admission.</p><a href="/events/padel-social-2027">Details and early interest</a></div>
      </div>
    </div>
  </section>` : ""}

  ${picks.length ? html`<section class="band"><div class="wrap"><h2>Jerome's picks</h2><ul class="event-list">${picks.map(eventRow)}</ul></div></section>` : ""}

  <section class="band band-paper">
    <div class="wrap split">
      <div><h2>For sponsors</h2><p>Reach the security community through the Sunday email, with a sponsor slot in front of practitioners who chose to read it. We don't sell lists.</p><a class="btn btn-outline" href="/sponsor">How sponsorship works</a></div>
      <div><h2>For organizers</h2><p>Submit your event once and it reaches subscribers, the calendar and the feed. Offer a subscriber discount if you like; we'll feature it.</p><a class="btn btn-outline" href="/submit">Submit an event</a></div>
    </div>
  </section>`;

  return page(shell({ title: "", body, path: "/" }), 200, { "Cache-Control": "private, no-store", "Vary": "Cookie" });
}
