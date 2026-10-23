import { html, page, notFound } from "../../_lib/html.js";
import { shell, signupForm } from "../../_lib/layout.js";
import { CITIES } from "../../_lib/constants.js";
import { monthName, parts } from "../../_lib/dates.js";

// Public archive of sent issues for a city.
export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const { results } = await env.DB.prepare("SELECT id, issue_number, week_start, week_end, subject, preheader, completed_at FROM issues WHERE city=? AND status='sent' ORDER BY week_start DESC LIMIT 200").bind(city.slug).all();
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">${city.name}</p>
    <h1>Past issues</h1>
    <p class="lede">Every Sunday email, as it went out. The week's events, a note from Jerome, and the sessions worth your time.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    ${results.length ? html`<ul class="issue-list">${results.map((i) => html`<li>
      <a href="/${city.slug}/issues/${i.week_start}"><span class="issue-week">Week of ${monthName(i.week_start)} ${parts(i.week_start).d}, ${parts(i.week_start).y}</span><span class="issue-subject">${i.subject || "The Watch"}</span></a>
      ${i.preheader ? html`<p class="issue-pre">${i.preheader}</p>` : ""}
    </li>`)}</ul>` : html`<p class="empty">The first issue goes out soon. Subscribe below and it lands in your inbox Sunday morning.</p>`}
  </div></section>
  <section class="band band-navy band-tight"><div class="wrap split-center"><div><h2>Get the next one.</h2><p>Sunday at 8 AM, ${city.name} time.</p></div>${signupForm({ source: `archive:${city.slug}`, city: city.slug })}</div></section>`;
  return page(shell({ title: `Past issues`, description: `The Watch ${city.name} archive: every Sunday email of ${city.name} security events.`, body, city: city.slug, path: `/${city.slug}`, canonical: `/${city.slug}/issues` }), 200, { "Cache-Control": "public, max-age=300" });
}
