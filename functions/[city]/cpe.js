import { html, page, raw, notFound } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { CITIES, orgPath, eventPath } from "../_lib/constants.js";
import { queryEvents, costLabel, eventObject } from "../_lib/events.js";
import { todayKey, addDays, fmtDateLong, fmtTimeRange, monthName } from "../_lib/dates.js";

// Public, indexable guide: how to earn CPE in this city this quarter, built from the live calendar so it is never
// stale. Chapters and their cadence, the free CPE sessions coming up, the virtual options, and how the CPE log works.
const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const BODIES = [
  { key: "ISACA", name: "ISACA (CISA, CISM, CRISC, CGEIT, CDPSE)", rule: "20 hours a year at minimum and 120 over each three year cycle, reported each January." },
  { key: "ISC2", name: "ISC2 (CISSP, CCSP, SSCP)", rule: "120 hours over each three year cycle for the CISSP, with 40 a year suggested; group A credits for security topics." },
  { key: "IIA", name: "IIA (CIA, CRMA)", rule: "40 hours a year for practicing CIAs, reported by December 31." },
  { key: "IAPP", name: "IAPP (CIPP, CIPM, CIPT, AIGP)", rule: "20 hours over each two year term, with privacy and AI governance sessions counting directly." },
];

export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const db = env.DB, today = todayKey(city.timezone), siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const [cpeEvents, virtual] = await Promise.all([
    queryEvents(db, { city: city.slug, from: `${today}T00:00`, to: `${addDays(today, 90)}T00:00`, cpe: "1", limit: 300 }),
    queryEvents(db, { city: "virtual", from: `${today}T00:00`, to: `${addDays(today, 30)}T00:00`, cpe: "1", limit: 300 }),
  ]);
  const inPerson = cpeEvents.filter((e) => e.format !== "virtual");
  const free = cpeEvents.filter((e) => ["free", "members_free", "donation"].includes(e.cost_type)).slice(0, 12);
  const hours = cpeEvents.reduce((a, e) => a + (+e.cpe_hours || 0), 0);
  // Organizers offering CPE here, with cadence and the next date.
  const byOrg = new Map();
  for (const e of cpeEvents) { if (!e.org_slug) continue; const o = byOrg.get(e.org_slug) || { slug: e.org_slug, name: e.org_name, type: e.org_type, next: e, count: 0, hours: 0 }; o.count++; o.hours += +e.cpe_hours || 0; byOrg.set(e.org_slug, o); }
  const orgRows = byOrg.size ? (await db.prepare(`SELECT slug, usual_cadence_text, cpe_notes, website FROM organizations WHERE slug IN (${[...byOrg.keys()].map(() => "?").join(",")})`).bind(...byOrg.keys()).all()).results : [];
  for (const r of orgRows) Object.assign(byOrg.get(r.slug), { cadence: r.usual_cadence_text, cpe_notes: r.cpe_notes, website: r.website });
  const orgs = [...byOrg.values()].sort((a, b) => (a.type === "vendor") - (b.type === "vendor") || b.count - a.count);
  const quarterEnd = addDays(today, 90);
  const faq = [
    { q: `How many CPE hours can I earn in ${city.name} this quarter?`, a: cpeEvents.length ? `About ${Math.round(hours)} hours across ${n(cpeEvents.length, "CPE eligible event", "CPE eligible events")} in ${city.region} between now and ${monthName(quarterEnd)} ${quarterEnd.slice(8, 10).replace(/^0/, "")}, ${inPerson.length} of them in person, plus ${n(virtual.length, "online session", "online sessions")} with CPE in the next 30 days.` : `The ${city.name} calendar is new; as chapters post their dates the CPE eligible ones appear here, and ${n(virtual.length, "online session", "online sessions")} with CPE are on the virtual calendar for the next 30 days.` },
    { q: "Do chapter meetings count toward CISA, CISSP or CIA renewal?", a: "Yes. ISACA, ISC2, IIA and IAPP all accept chapter meetings, conferences and educational webinars that cover their domains; the organizer states the hours and you self report them to your certification body with the event details as evidence." },
    { q: "Which events are free?", a: free.length ? `${free.length} of the coming CPE events in ${city.name} are free or free for members, listed below, and most online sessions are free.` : `Free CPE sessions appear on the calendar as organizers post them; most online sessions are free.` },
    { q: "How do I keep track of the hours?", a: "Subscribers to The Watch get a private CPE log: mark an event attended from the email or the event page and the hours, date and organizer are recorded, with a CSV export for your renewal." },
  ];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">${city.region}</p>
    <h1>How to earn CPE in ${city.name} this quarter</h1>
    <p class="lede">${hours ? `About ${Math.round(hours)} hours of continuing education are on the ${city.name} calendar for the next 90 days: ${n(inPerson.length, "in person event", "in person events")} and ${n(cpeEvents.length - inPerson.length, "online one", "online ones")} from local chapters, ` : `Every CPE eligible chapter meeting, meetup, conference and webinar in ${city.region}, in one place, `}plus ${n(virtual.length, "online session", "online sessions")} with CPE in the next 30 days. Each listing says the hours, the certification body and the price, and links to the organizer's own registration.</p>
    <p><a class="btn btn-electric" href="/${city.slug}?cpe=1">See every CPE event in ${city.name}</a> <a class="btn btn-outline" href="/virtual">Online CPE sessions</a></p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <h2>Who offers CPE in ${city.name}</h2>
    ${orgs.length ? html`<ul class="dir-list">${orgs.map((o) => html`<li class="dir-item">
      <h3><a href="${orgPath(o.slug, city.slug)}">${o.name}</a></h3>
      <p class="dir-desc">${o.count} CPE event${o.count === 1 ? "" : "s"} in the next 90 days${o.hours ? `, about ${Math.round(o.hours)} hours` : ""}. Next: <a href="${eventPath(o.next)}">${o.next.title}</a>, ${fmtDateLong(o.next.start_at)}.${o.cadence ? ` ${o.cadence}.` : ""}${o.cpe_notes ? ` ${o.cpe_notes}` : ""}</p>
    </li>`)}</ul>` : html`<p class="empty">${city.empty}</p>`}
  </div></section>
  <section class="band"><div class="wrap narrow">
    <h2>Free CPE coming up</h2>
    ${free.length ? html`<ul class="dir-list cpe-free">${free.map((e) => html`<li class="dir-item"><a href="${eventPath(e)}"><strong>${e.title}</strong></a><br><small>${fmtDateLong(e.start_at)}, ${fmtTimeRange(e.start_at, e.end_at)}${e.org_name ? `, ${e.org_name}` : ""}${e.cpe_hours ? `, ${e.cpe_hours} CPE` : ", CPE"}${e.cpe_body ? ` (${e.cpe_body})` : ""}, ${costLabel(e) || "free"}</small></li>`)}</ul>` : html`<p class="empty">No free CPE sessions are posted for ${city.name} yet. <a href="/virtual">Online sessions</a> are mostly free and count the same way.</p>`}
  </div></section>
  <section class="band"><div class="wrap narrow">
    <h2>What each certification body expects</h2>
    <p>The organizer states the hours; you report them. The rules below are the common ones, and your body's current handbook is the final word.</p>
    <ul class="dir-list">${BODIES.map((b) => html`<li class="dir-item"><h3>${b.name}</h3><p class="dir-desc">${b.rule}</p></li>`)}</ul>
    <h2>Keeping the hours straight</h2>
    <p>Every subscriber to The Watch gets a private CPE log. Mark an event attended from the Sunday email or the event page and the date, organizer, hours and body are recorded for you, with a CSV export when renewal comes around. <a href="/subscribe?city=${city.slug}&src=cpe_page">Subscribe for ${city.name}</a> to start one.</p>
    <h2>Questions people ask</h2>
    ${faq.map((f) => html`<h3>${f.q}</h3><p>${f.a}</p>`)}
  </div></section>
  ${raw(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`)}
  ${raw(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: free.slice(0, 12).map((e, i) => ({ "@type": "ListItem", position: i + 1, item: { ...eventObject(e, siteUrl), "@context": undefined } })) }).replace(/</g, "\\u003c")}</script>`)}`;
  return page(shell({ title: `How to earn CPE in ${city.name} this quarter`, description: `CPE eligible cybersecurity, audit and privacy events in ${city.region} for ISACA, ISC2, IIA and IAPP renewals: chapters, free sessions, hours and online options.`, body, city: city.slug, path: `/${city.slug}`, canonical: `/${city.slug}/cpe` }), 200, { "Cache-Control": "public, max-age=600" });
}
