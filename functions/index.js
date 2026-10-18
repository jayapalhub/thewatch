import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";
import { upcomingEvents, eventRow, groupByDay, dayHeading } from "./_lib/events.js";
import { addDays, todayKey, mondayOf } from "./_lib/dates.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const today = todayKey();
  const weekEnd = addDays(today, 7);
  const [thisWeek, picks, orgCount, eventCount] = await Promise.all([
    upcomingEvents(db, { to: weekEnd + "T00:00", limit: 5 }),
    upcomingEvents(db, { featured: true, limit: 3 }),
    db.prepare("SELECT COUNT(*) AS n FROM organizations").first(),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published' AND start_at >= ?").bind(today).first(),
  ]);
  const preview = thisWeek.length ? thisWeek : await upcomingEvents(db, { limit: 5 });

  const body = html`
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="kicker">A calendar and a Sunday email for San Diego security people</p>
        <h1>Know what's happening in San Diego security.</h1>
        <p class="lede">Every cybersecurity, AI security, privacy and audit event in the county, from chapter meetings and meetups to the big summits, in one calendar. Each Sunday evening you get the week ahead with a short note from Jerome on what's worth your time.</p>
        ${signupForm({ source: "home" })}
        <p class="hero-stats"><span><strong>${eventCount?.n ?? 0}</strong> upcoming events</span><span><strong>${orgCount?.n ?? 0}</strong> organizers</span><span><strong>Sunday 5 PM</strong> every week</span></p>
      </div>
      <div class="hero-card">
        <div class="hero-card-head"><span>${thisWeek.length ? "The next seven days" : "Coming up"}</span><a href="/sandiego">Full calendar</a></div>
        ${preview.length ? html`${groupByDay(preview).map((g) => html`<div class="mini-day">${dayHeading(g.key)}<ul class="event-list">${g.events.map(eventRow)}</ul></div>`)}` : html`<p class="empty">The calendar is filling up. Check back soon or <a href="/submit">submit an event</a>.</p>`}
      </div>
    </div>
  </section>

  <section class="band band-paper">
    <div class="wrap three-up">
      <div>
        <h2>One place, every organizer</h2>
        <p>ISACA, ISSA, OWASP, IIA, IAPP, ISC2, InfraGard, the meetups, the universities and the summits. If it's in San Diego County and it's about security, it belongs on the calendar. <a href="/submit">Organizers can submit directly.</a></p>
      </div>
      <div>
        <h2>Filters that matter to practitioners</h2>
        <p>Sort by topic, organizer, cost and format, and see at a glance which sessions carry CPE credit. Add any event to your own calendar in one click, or subscribe to the whole feed.</p>
      </div>
      <div>
        <h2>Curated, not dumped</h2>
        <p>The Sunday email is scannable in two minutes: a short note, the week day by day, and a pick or two when something deserves your evening. No forty item lists.</p>
      </div>
    </div>
  </section>

  <section class="band band-navy">
    <div class="wrap split">
      <div>
        <p class="kicker kicker-light">Better Security events</p>
        <h2>A few events of our own, built for practitioners.</h2>
        <p>Alongside the calendar, Better Security runs a small number of elevated events each year where mid career and senior security people meet as peers. First up is the Padel Social in March, with an AI Security Conference and a sponsored dinner series to follow in 2027.</p>
        <p><a class="btn btn-electric" href="/events/padel-social-2027">Padel Social 2027</a> <a class="btn btn-ghost" href="/events">All our events</a></p>
      </div>
      <div class="event-feature">
        <div class="ef-date"><span>18</span><span>Mar 2027</span></div>
        <div>
          <h3>Padel Social 2027</h3>
          <p>Thursday, 5:30 to 7:30 PM at Padel N9NE, Sorrento Valley. Courts, coaching for first timers, food and a DJ. $35 general admission.</p>
          <a href="/events/padel-social-2027">Details and early interest</a>
        </div>
      </div>
    </div>
  </section>

  ${picks.length ? html`
  <section class="band">
    <div class="wrap">
      <h2>Jerome's picks</h2>
      <ul class="event-list">${picks.map(eventRow)}</ul>
    </div>
  </section>` : ""}

  <section class="band band-paper">
    <div class="wrap split">
      <div>
        <h2>For sponsors</h2>
        <p>Reach San Diego's security community through the Sunday email, or put your team in a room with twenty of the right practitioners at a sponsored dinner. We don't sell lists; we build rooms.</p>
        <a class="btn btn-outline" href="/sponsor">How sponsorship works</a>
      </div>
      <div>
        <h2>For organizers</h2>
        <p>Submit your event once and it reaches subscribers, the calendar and the feed. Offer a subscriber discount if you like; we'll feature it.</p>
        <a class="btn btn-outline" href="/submit">Submit an event</a>
      </div>
    </div>
  </section>`;

  return page(shell({ title: "", body, path: "/" }), 200, { "Cache-Control": "public, max-age=300" });
}
