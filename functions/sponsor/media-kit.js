import { html, page } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { CITIES, TOPICS, SENIORITY, cityListText, MEDIA_KIT_MIN_SUBSCRIBERS, MEDIA_KIT_MIN_CITY_SUBSCRIBERS, MEDIA_KIT_MIN_PROFILES } from "../_lib/constants.js";
import { todayKey, addDays, fmtDateLong } from "../_lib/dates.js";

// Public media kit. Every number is read live from D1. Audience numbers stay hidden until they are
// large enough to mean something (thresholds in constants.js), so the page never advertises a tiny list.
// No pricing here: the deck goes out on request from /sponsor.

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

async function cityStats(db, slug, today) {
  const in90 = addDays(today, 90);
  const [up, year, orgs, cpe] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM events WHERE status='published' AND city=? AND COALESCE(format,'in_person') != 'virtual' AND start_at >= ? AND start_at < ?").bind(slug, today, in90).first(),
    db.prepare("SELECT COUNT(*) n FROM events WHERE status IN ('published','cancelled') AND city=?").bind(slug).first(),
    db.prepare("SELECT COUNT(DISTINCT organization_id) n FROM events WHERE status='published' AND city=? AND organization_id IS NOT NULL").bind(slug).first(),
    db.prepare("SELECT COUNT(*) n FROM events WHERE status='published' AND city=? AND COALESCE(format,'in_person') != 'virtual' AND start_at >= ? AND start_at < ? AND cpe_eligible=1").bind(slug, today, in90).first(),
  ]);
  return { upcoming: up.n, listed: year.n, orgs: orgs.n, cpeShare: pct(cpe.n, up.n) };
}

export async function onRequestGet({ env }) {
  const db = env.DB;
  const today = todayKey();
  const cities = Object.values(CITIES);
  const perCity = await Promise.all(cities.map(async (c) => ({ c, ...(await cityStats(db, c.slug, today)) })));
  const [orgsAll, virt, subs, subsByCity, issues] = await Promise.all([
    db.prepare("SELECT COUNT(DISTINCT organization_id) n FROM events WHERE status='published' AND organization_id IS NOT NULL").first(),
    db.prepare("SELECT COUNT(*) n FROM events WHERE status='published' AND city='virtual' AND cpe_eligible=1 AND start_at >= ? AND start_at < ?").bind(today, addDays(today, 60)).first(),
    db.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active'").first(),
    db.prepare("SELECT city, COUNT(*) n FROM subscribers WHERE status='active' GROUP BY city").all(),
    db.prepare("SELECT COUNT(*) n FROM issues WHERE status='sent'").first(),
  ]);
  const showAudience = subs.n >= MEDIA_KIT_MIN_SUBSCRIBERS;

  // Profile answers: seniority and topics, as a share of subscribers who answered.
  let seniority = [], topics = [], profiles = 0;
  if (showAudience) {
    const { results } = await db.prepare("SELECT seniority, interests FROM subscribers WHERE status='active' AND profile_completed_at IS NOT NULL").all();
    profiles = results.length;
    if (profiles >= MEDIA_KIT_MIN_PROFILES) {
      const sen = {}, top = {};
      for (const r of results) {
        if (r.seniority && SENIORITY[r.seniority]) sen[r.seniority] = (sen[r.seniority] || 0) + 1;
        let list = []; try { list = JSON.parse(r.interests || "[]"); } catch {}
        for (const t of list) if (TOPICS[t]) top[t] = (top[t] || 0) + 1;
      }
      seniority = Object.keys(SENIORITY).filter((k) => sen[k]).map((k) => ({ label: SENIORITY[k], share: pct(sen[k], profiles) }));
      topics = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ label: TOPICS[k], share: pct(n, profiles) }));
    }
  }
  const cityCounts = Object.fromEntries(subsByCity.results.map((r) => [r.city, r.n]));
  const cityList = cityListText(cities);
  const bars = (rows) => html`<ul class="kit-bars">${rows.map((r) => html`<li><span class="kit-bar-label">${r.label}</span><span class="kit-bar"><span style="width:${Math.max(r.share, 2)}%"></span></span><span class="kit-bar-n">${r.share}%</span></li>`)}</ul>`;

  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Media kit</p>
    <h1>The Watch, by the numbers</h1>
    <p class="lede">The Watch is the cybersecurity events calendar and Sunday email for ${cityList}, published by Better Security. Every figure on this page is read live from the calendar, so it is current as of ${fmtDateLong(today)}.</p>
  </div></section>

  <section class="band band-paper"><div class="wrap">
    <h2>Coverage</h2>
    <p class="kit-intro">We list every chapter meeting, meetup, conference and vendor event we can find, so readers come to plan their week and come back the next one.</p>
    <div class="kit-stats">
      <div class="kit-stat"><span class="kit-n">${fmt(orgsAll.n)}</span><span class="kit-l">organizations on the calendars</span></div>
      <div class="kit-stat"><span class="kit-n">${fmt(perCity.reduce((a, x) => a + x.upcoming, 0))}</span><span class="kit-l">in person events in the next 90 days</span></div>
      <div class="kit-stat"><span class="kit-n">${fmt(virt.n)}</span><span class="kit-l">online sessions with CPE in the next 60 days</span></div>
      <div class="kit-stat"><span class="kit-n">${cities.length}</span><span class="kit-l">${cities.length === 1 ? "city calendar" : "city calendars"}, with more on the way</span></div>
    </div>
    <div class="kit-cities">
      ${perCity.map((x) => html`<div class="kit-city">
        <h3>${x.c.name}</h3>
        <p class="kit-region">${x.c.region}</p>
        <dl>
          <div><dt>In person, next 90 days</dt><dd>${fmt(x.upcoming)} events</dd></div>
          <div><dt>Organizers covered</dt><dd>${fmt(x.orgs)}</dd></div>
          <div><dt>Events listed so far</dt><dd>${fmt(x.listed)}</dd></div>
          ${x.upcoming ? html`<div><dt>Offering CPE</dt><dd>${x.cpeShare}% of upcoming</dd></div>` : ""}
          ${showAudience && (cityCounts[x.c.slug] || 0) >= MEDIA_KIT_MIN_CITY_SUBSCRIBERS ? html`<div><dt>Subscribers</dt><dd>${fmt(cityCounts[x.c.slug])}</dd></div>` : ""}
        </dl>
        <a href="/${x.c.slug}">See the ${x.c.name} calendar</a>
      </div>`)}
    </div>
  </div></section>

  <section class="band"><div class="wrap narrow">
    <h2>Audience</h2>
    <p>Security, GRC, audit, privacy and AI governance professionals, weighted toward mid career and senior practitioners. People subscribe one email address at a time on the site; we do not buy, rent or import lists, and we do not share subscriber data with sponsors.</p>
    ${showAudience ? html`
      <div class="kit-stats kit-stats-2">
        <div class="kit-stat"><span class="kit-n">${fmt(subs.n)}</span><span class="kit-l">active subscribers</span></div>
        ${issues.n ? html`<div class="kit-stat"><span class="kit-n">${fmt(issues.n)}</span><span class="kit-l">${issues.n === 1 ? "issue" : "issues"} sent so far</span></div>` : ""}
      </div>
      ${seniority.length ? html`<div class="kit-split">
        <div><h3>Seniority</h3>${bars(seniority)}</div>
        <div><h3>What they want more of</h3>${bars(topics)}</div>
      </div>
      <p class="kit-foot">Shares are of the ${fmt(profiles)} subscribers who answered the optional profile questions. Topic shares add up to more than 100% because people pick several.</p>` : html`<p class="kit-foot">Seniority and topic breakdowns appear here once enough subscribers have answered the optional profile questions.</p>`}`
    : html`<p class="kit-callout">The list is new and growing every week. Ask and we will send current subscriber numbers with the sponsor deck.</p>`}
  </div></section>

  <section class="band band-paper"><div class="wrap narrow">
    <h2>Ways to sponsor</h2>
    <div class="kit-ways">
      <div><h3>Issue sponsor</h3><p>One clearly marked block near the top of a city's Sunday email, between the personal note and the week's listings, with your logo, a few sentences in plain language and a link. One sponsor per issue.</p></div>
      <div><h3>Calendar sponsor</h3><p>Your logo on the city calendar page and a "Supported by" line above the Sunday email footer, for a month or a season. Good for staying in front of the same readers week after week.</p></div>
      <div><h3>Events and dinners</h3><p>Better Security events and small roundtables of around twenty invited practitioners on one topic, with a handful of sponsor spots each. Details on request.</p></div>
    </div>
    <h3>What every sponsor gets</h3>
    <ul class="kit-list">
      <li>A clear sponsor label, never disguised as editorial.</li>
      <li>Click counts from tracked links, reported per placement after the run.</li>
      <li>A small number of sponsors per issue and per event, on purpose.</li>
    </ul>
    <p class="kit-cta"><a class="btn btn-primary" href="/sponsor#sponsor-form">Request the sponsor deck</a> <span>Options and pricing within two business days.</span></p>
  </div></section>`;

  return page(shell({ title: "Media kit", description: `The Watch media kit: coverage of security events in ${cityList}, audience and ways to sponsor, updated live.`, body, path: "/sponsor/media-kit" }), 200, { "Cache-Control": "public, max-age=3600" });
}
