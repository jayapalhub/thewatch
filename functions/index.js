import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";
import { upcomingEvents, eventRow, groupByDay, dayHeading } from "./_lib/events.js";
import { addDays, todayKey } from "./_lib/dates.js";
import { CITIES, cityOf, SHOW_BS_EVENTS, cityListText, liveNewsletterCities, pendingNewsletterCities, DEFAULT_CITY, singleCity } from "./_lib/constants.js";

// With one live city the root is the front door: the free calendar as the open offer and the invitation request as
// the second, more exclusive one. With more cities it is a city chooser, and a returning reader who has visited a
// calendar is sent straight back to it (cookie watch_city) unless they ask to choose again with ?choose=1.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (singleCity()) return landing(env);
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)watch_city=([a-z]+)/);
  const remembered = cookie && cityOf(cookie[1]) ? cookie[1] : null;
  if (remembered && !url.searchParams.has("choose")) return Response.redirect(new URL(`/${remembered}`, request.url).toString(), 302);

  const db = env.DB;
  const today = todayKey();
  const cities = Object.values(CITIES);
  // One grouped count for every city, instead of a count and a next event query per city (80 queries at 40 cities).
  const { results: countRows = [] } = await db.prepare("SELECT city, COUNT(*) AS n FROM events WHERE status='published' AND start_at >= ? GROUP BY city").bind(today).all();
  const countOf = Object.fromEntries(countRows.map((r) => [r.city, r.n]));
  // Alphabetical, so a reader can find their city in a list of forty at a glance.
  cities.sort((a, b) => a.name.localeCompare(b.name));
  const virtualCount = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND (city='virtual' OR also_virtual=1) AND start_at >= ?").bind(today).first();
  const [picks, orgCount] = await Promise.all([upcomingEvents(db, { featured: true, limit: 3 }), db.prepare("SELECT COUNT(*) AS n FROM organizations").first()]);

  const body = html`
  <section class="hero hero-short">
    <div class="wrap">
      <p class="kicker">A calendar and a Sunday email for security people</p>
      <h1>Pick your city.</h1>
      <p class="lede">Every cybersecurity, AI security, privacy and audit event near you, from chapter meetings and meetups to the big summits, in one calendar with a Sunday email. Plus the best live online sessions with CPE, from anywhere.</p>
    </div>
  </section>
  <section class="band">
    <div class="wrap city-grid">
      <a class="city-tile city-tile-virtual" href="/virtual">
        <span class="city-tile-name">Virtual</span>
        <span class="city-tile-region">Live online sessions from anywhere, most with CPE</span>
        <span class="city-tile-count">${virtualCount?.n ?? 0} sessions</span>
      </a>
      ${cities.map((c) => { const n = countOf[c.slug] || 0; return html`
      <a class="city-tile" href="/${c.slug}">
        <span class="city-tile-name">${c.name}</span>
        <span class="city-tile-region">${c.region}</span>
        ${n ? html`<span class="city-tile-count">${n} event${n === 1 ? "" : "s"}</span>` : html`<span class="city-tile-count city-tile-new">New calendar</span>`}
      </a>`; })}
    </div>
    <div class="wrap"><p class="a-muted city-foot">Your pick is remembered on this device. Not here yet? <a href="mailto:watch@bettersecurity.ai?subject=Bring%20The%20Watch%20to%20my%20city">Tell us your city</a> or <a href="/submit">submit an event</a>.</p></div>
  </section>

  <section class="band band-navy band-tight"><div class="wrap split-center">
    <div><h2>Get the week in your inbox on Sunday.</h2><p>Each city's email goes out Sunday at 8 AM local time with a short note from Jerome.${(() => { const live = liveNewsletterCities(), pend = pendingNewsletterCities(); return pend.length ? ` ${live.length ? `${cityListText(live)} ${live.length === 1 ? "is" : "are"} sending now; ` : ""}${cityListText(pend)} ${pend.length === 1 ? "starts" : "start"} soon, and subscribing now puts you on the first send.` : ""; })()}</p></div>
    ${signupForm({ source: "home", chooseCity: true, city: remembered || DEFAULT_CITY })}
  </div></section>

  <section class="band band-paper">
    <div class="wrap three-up">
      <div><h2>One place, every organizer</h2><p>ISACA, ISSA, OWASP, IIA, IAPP, ISC2, InfraGard, the meetups, the universities and the summits, ${(orgCount?.n ?? 0).toLocaleString("en-US")} organizers so far. If it is about security and it is near you, it belongs on the calendar. <a href="/submit">Organizers can submit directly.</a></p></div>
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

// The single city front door. Copy approved by Jerome before it went live (doc 222). It names no specific experience,
// date, venue or sponsor, says "experiences" rather than "dinners", and describes the audience as security and
// technology broadly. The same for every visitor, so it is edge cached.
async function landing(env) {
  const db = env.DB;
  const city = CITIES[DEFAULT_CITY];
  const today = todayKey(city.timezone);
  const [count, month, virtualCount, orgCount, picks] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND city=? AND start_at >= ?").bind(city.slug, today).first(),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND city=? AND start_at >= ? AND start_at < ?").bind(city.slug, today, addDays(today, 31)).first(),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND (city='virtual' OR also_virtual=1) AND start_at >= ?").bind(today).first(),
    db.prepare("SELECT COUNT(*) AS n FROM organizations o WHERE EXISTS (SELECT 1 FROM events e WHERE e.organization_id=o.id AND e.status='published' AND e.city=?)").bind(city.slug).first(),
    upcomingEvents(db, { city: city.slug, featured: true, limit: 3 }),
  ]);
  const n = count?.n ?? 0, m = month?.n ?? 0, v = virtualCount?.n ?? 0, orgs = orgCount?.n ?? 0;
  const body = html`
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="kicker">${city.region} · free and open to everyone</p>
        <h1>San Diego's most complete security and tech events calendar.</h1>
        <p class="lede">Every chapter meeting, meetup, summit, university talk and vendor session in ${city.region}, from ${orgs ? `${orgs} organizers` : "every organizer"}, with CPE and cost noted. ${m ? `${m} event${m === 1 ? "" : "s"} in the next thirty days, ${n} on the calendar in all` : `${n} event${n === 1 ? "" : "s"} on the calendar`}, plus ${v} live online session${v === 1 ? "" : "s"} with CPE from anywhere. One email on Sunday morning puts the week in order.</p>
        <p><a class="btn btn-electric btn-large" href="/${city.slug}">Open the calendar</a> <a class="btn btn-ghost" href="/virtual">Virtual sessions and CPE</a></p>
      </div>
      <div class="hero-card">
        <h2 class="hero-card-head">Get the week in your inbox on Sunday.</h2>
        <p>A short note from Jerome, the week day by day, and a pick or two when something deserves your evening. 8 AM Sunday, one click to unsubscribe.</p>
        ${signupForm({ source: "home", city: city.slug })}
      </div>
    </div>
  </section>

  <section class="band band-navy">
    <div class="wrap split">
      <div>
        <p class="kicker kicker-light">Starting in 2027</p>
        <h2>Small, invite only experiences for San Diego security and IT practitioners.</h2>
        <p>Alongside the calendar, Better Security hosts a small number of experiences each year where the people who own security and technology decisions in San Diego meet as peers, some over a meal and some around an activity. Each one is built for a particular group, so seats are matched to the room rather than first come, first served.</p>
        <p>Tell us who you are and the areas you own or influence, and we will reach out when there is a fit. Your details stay with us and are never shared with sponsors.</p>
        <p><a class="btn btn-electric" href="/invite">Request an invitation</a></p>
      </div>
      <div class="stack">
        <div><h3>Practitioners first</h3><p>Rooms are built around the people doing the work, with sponsors there to listen rather than pitch.</p></div>
        <div><h3>Sized for conversation</h3><p>Small enough that everyone talks, varied enough that you meet people outside your usual circle.</p></div>
        <div><h3>Matched, not mass mailed</h3><p>Invitations go by role and by what you own, so the room is useful to the people in it.</p></div>
      </div>
    </div>
  </section>

  <section class="band band-paper">
    <div class="wrap three-up">
      <div><h2>One place, every organizer</h2><p>ISACA, ISSA, OWASP, IIA, IAPP, ISC2, InfraGard, CSA, the meetups, the universities and the summits. If it is about security or technology and it is in San Diego, it belongs on the calendar. <a href="/submit">Organizers can submit directly.</a></p></div>
      <div><h2>Filters that matter to practitioners</h2><p>Sort by topic, organizer, cost and format, and see at a glance which sessions carry CPE credit. Add any event to your own calendar in one click, or subscribe to the whole feed.</p></div>
      <div><h2>Curated, not dumped</h2><p>The Sunday email is scannable in two minutes: a short note, the week day by day, and a pick or two when something deserves your evening. No forty item lists.</p></div>
    </div>
  </section>

  ${picks.length ? html`<section class="band"><div class="wrap"><h2>Jerome's picks</h2><ul class="event-list">${picks.map(eventRow)}</ul></div></section>` : ""}

  <section class="band band-paper">
    <div class="wrap split">
      <div><h2>For sponsors</h2><p>Reach San Diego's security and technology community through the Sunday email and in the room at our experiences, in front of practitioners who chose to be there. We don't sell lists.</p><a class="btn btn-outline" href="/sponsor">How sponsorship works</a></div>
      <div><h2>For organizers</h2><p>Submit your event once and it reaches subscribers, the calendar and the feed. Offer a subscriber discount if you like; we'll feature it.</p><a class="btn btn-outline" href="/submit">Submit an event</a></div>
    </div>
  </section>`;
  return page(shell({ title: "", description: `San Diego's most complete security and technology events calendar, free and open, with a Sunday email, plus small invite only experiences for security and IT practitioners starting in 2027. By Better Security.`, body, path: "/", canonical: "/" }), 200, { "Cache-Control": "public, max-age=300" });
}
