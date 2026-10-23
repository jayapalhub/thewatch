// A signup page for one city's Sunday email: /<city>/subscribe. It is the link to share from a city's posts, so it
// names the city, shows what the calendar holds over the next thirty days and the next few events, and files every
// signup under that city with no city picker to get wrong. The page is the same for every visitor, so it is edge cached.
import { html, page, notFound } from "../_lib/html.js";
import { shell, signupForm } from "../_lib/layout.js";
import { CITIES } from "../_lib/constants.js";
import { queryEvents, dayList } from "../_lib/events.js";
import { todayKey, addDays } from "../_lib/dates.js";

export async function onRequestGet({ params, env, request }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  // ?src= from a share link (embed, cpe_page) keeps its attribution; anything else counts as this page.
  const src = (new URL(request.url).searchParams.get("src") || "").replace(/[^a-z0-9_:-]/gi, "").slice(0, 40) || `city_subscribe:${city.slug}`;
  const today = todayKey(city.timezone);
  const events = await queryEvents(env.DB, { city: city.slug, from: today, to: addDays(today, 31), limit: 300 }).catch(() => []);
  const free = events.filter((e) => ["free", "members_free", "donation"].includes(e.cost_type)).length;
  const cpe = events.filter((e) => e.cpe_eligible).length;
  const sending = city.newsletter === "sunday";
  const facts = [free ? `${free} free` : "", cpe ? `${cpe} with CPE credit` : ""].filter(Boolean);
  const count = events.length
    ? `${events.length} ${events.length === 1 ? "event is" : "events are"} on the ${city.name} calendar over the next thirty days${facts.length ? `, ${facts.join(" and ")}` : ""}.`
    : `The ${city.name} calendar is filling up now.`;
  const where = city.slug === "virtual" ? "online" : `in ${city.region || city.name}`;
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">${city.title} · Sundays at 8 AM</p>
    <h1>Every security event ${where}, in one Sunday email.</h1>
    <p class="lede">${count} The Sunday email puts the week in order: chapter meetings, meetups, summits and vendor sessions, which ones carry CPE, which ones cost money, and which ones are worth your evening.</p>
    ${sending ? "" : html`<p class="lede-note">The ${city.name} email starts soon. Subscribe now and you get the first issue.</p>`}
    ${signupForm({ source: src, city: city.slug })}
    <p class="small-note">One email a week. One clearly marked sponsor per issue. Your email is never shared with organizers or sponsors.</p>
  </div></section>
  ${events.length ? html`
  <section class="band"><div class="wrap narrow">
    <h2>Coming up in ${city.name}</h2>
    ${dayList(events.slice(0, 5), { today })}
    <p><a class="btn btn-outline" href="/${city.slug}">See the full ${city.name} calendar</a></p>
  </div></section>` : ""}`;
  return page(shell({
    title: `${city.name} security events, every Sunday`,
    description: `${count} Get every security event ${where} in one email, Sunday mornings at 8.`,
    body, city: city.slug, path: `/${city.slug}/subscribe`, canonical: `/${city.slug}/subscribe`,
  }), 200, { "Cache-Control": "public, max-age=300" });
}
