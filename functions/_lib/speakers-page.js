import { html, page } from "./html.js";
import { shell } from "./layout.js";
import { eventPath } from "./constants.js";
import { todayKey, fmtDateLong, fmtDateShort } from "./dates.js";
import { buildSpeakers, bySurname, surnameInitial } from "./speakers.js";

const SOON = 15;   // speakers in the "Speaking soon" box
const PAST = 3;    // past events listed per speaker before "and N more"

// /<city>/speakers and /virtual/speakers. c is a CITIES entry or VIRTUAL.
export async function speakersPage(env, c, request = null, waitUntil = null) {
  // The board is parsed from every event's speakers on each build, so keep a rendered copy at the edge for five minutes.
  const cache = typeof caches !== "undefined" && request ? caches.default : null;
  const key = cache ? new Request(new URL(request.url).origin + new URL(request.url).pathname) : null;
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit; }
  const res = await renderSpeakersPage(env, c);
  if (cache && res.status === 200) { const p = cache.put(key, res.clone()).catch(() => {}); if (waitUntil) waitUntil(p); }
  return res;
}

async function renderSpeakersPage(env, c) {
  const today = todayKey(c.timezone);
  const people = (await buildSpeakers(env.DB, { city: c.slug })).map((s) => {
    const upcoming = s.events.filter((e) => e.start_at.slice(0, 10) >= today).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const past = s.events.filter((e) => e.start_at.slice(0, 10) < today); // newest first
    return { ...s, upcoming, past, next: upcoming[0] || null };
  }).sort(bySurname);
  const virtual = c.slug === "virtual";
  const home = virtual ? "/virtual" : `/${c.slug}`;
  const where = virtual ? "online security sessions" : `security events in ${c.name}`;
  const soon = people.filter((p) => p.next).sort((a, b) => a.next.start_at.localeCompare(b.next.start_at) || bySurname(a, b));
  const byLetter = new Map();
  for (const p of people) { const l = surnameInitial(p.name); if (!byLetter.has(l)) byLetter.set(l, []); byLetter.get(l).push(p); }
  const letters = [...byLetter.entries()].map(([l, items]) => ({ l, items })).sort((a, b) => (a.l === "#") - (b.l === "#") || a.l.localeCompare(b.l));
  const evLink = (e) => html`<a href="${eventPath(e)}">${e.title}</a>`;

  const item = (p) => html`<li class="dir-item spk-item">
    <h3>${p.name}</h3>
    ${p.affiliation ? html`<p class="dir-cadence">${p.affiliation}</p>` : ""}
    ${p.next ? html`<p class="dir-next"><span class="dir-label">Next</span> ${evLink(p.next)} <span class="dir-when">${fmtDateLong(p.next.start_at)}</span>${p.upcoming.length > 1 ? html` <span class="spk-more">plus ${p.upcoming.length - 1} more scheduled</span>` : ""}</p>` : ""}
    ${p.past.length ? html`<p class="spk-past"><span class="dir-label dir-label-quiet">Spoke at</span> ${p.past.slice(0, PAST).map((e, i) => html`${i ? "; " : ""}${evLink(e)} <span class="dir-when">${fmtDateShort(e.start_at)}</span>`)}${p.past.length > PAST ? html`<span class="spk-more">; and ${p.past.length - PAST} more</span>` : ""}</p>` : ""}
  </li>`;

  const body = html`
  <div class="wrap narrow org-dir spk-dir">
    <p class="crumbs"><a href="${home}">${virtual ? "Virtual sessions" : `${c.name} calendar`}</a> <span class="sep"></span> Speakers</p>
    <h1>Who speaks at ${where}</h1>
    ${people.length ? html`
    <p class="lede">${people.length === 1 ? "One person has" : `${people.length} people have`} spoken or are scheduled to speak at ${where} on The Watch${virtual ? "" : ` ${c.name}`}. Names come straight from the event listings, grouped by person, with the next date for anyone on the calendar now.</p>
    ${soon.length ? html`<section class="dir-group spk-soon" id="soon">
      <h2>Speaking soon</h2>
      <ul class="dir-list">${soon.slice(0, SOON).map((p) => html`<li class="dir-item"><p class="dir-next"><strong>${p.name}</strong>${p.affiliation ? html` <span class="spk-aff">${p.affiliation}</span>` : ""}<br>${evLink(p.next)} <span class="dir-when">${fmtDateLong(p.next.start_at)}</span></p></li>`)}</ul>
      ${soon.length > SOON ? html`<p class="dir-blurb">And ${soon.length - SOON} more with a date on the calendar, listed below.</p>` : ""}
    </section>` : ""}
    <nav class="dir-jump spk-jump" aria-label="Jump to a letter">${letters.map((g) => html`<a href="#l-${g.l}">${g.l}</a>`)}</nav>
    ${letters.map((g) => html`<section class="dir-group" id="l-${g.l}"><h2>${g.l}</h2><ul class="dir-list">${g.items.map(item)}</ul></section>`)}`
    : html`<p class="lede">No speakers are listed for ${where} yet. They show up here as organizers name them on their events.</p>`}
    <div class="dir-cta">
      <h2>Speaking at an event that is missing?</h2>
      <p>Submit it with the speakers listed and it shows up on the calendar and here once it is approved.</p>
      <p><a class="btn btn-primary" href="/submit">Submit an event</a></p>
    </div>
  </div>`;

  return page(shell({
    title: virtual ? "Speakers at online sessions" : `Speakers in ${c.name}`,
    description: `Everyone who has spoken or is scheduled to speak at ${where}, with the events they spoke at and their next date.`,
    body, city: c.slug, path: `${home}/speakers`, canonical: `${home}/speakers`, head: people.length ? "" : '<meta name="robots" content="noindex">',
  }), 200, { "Cache-Control": "public, max-age=300" });
}
