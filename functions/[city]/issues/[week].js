import { html, page, notFound, raw } from "../../_lib/html.js";
import { shell, signupForm } from "../../_lib/layout.js";
import { CITIES } from "../../_lib/constants.js";
import { monthName, parts } from "../../_lib/dates.js";

// One sent issue, rendered from the HTML that was emailed, with the personal unsubscribe link swapped for a subscribe link.
export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(params.week)) return notFound("Issue not found");
  const issue = await env.DB.prepare("SELECT * FROM issues WHERE city=? AND week_start=? AND status='sent'").bind(city.slug, params.week).first();
  if (!issue || !issue.generated_html) return notFound("Issue not found");
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const inner = issue.generated_html.replace(/\{\{PROFILE_NUDGE\}\}/g, "").replace(/\{\{UNSUB\}\}/g, `${siteUrl}/subscribe?src=archive`).replace(/<a href="[^"]*\/subscribe\?src=archive"[^>]*>Unsubscribe<\/a> in one click\./g, `<a href="${siteUrl}/subscribe?src=archive" style="color:#1B4A8A;">Subscribe</a> to get the next one.`);
  const title = issue.subject || `Week of ${monthName(issue.week_start)} ${parts(issue.week_start).d}`;
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker"><a href="/${city.slug}/issues">${city.name} past issues</a></p>
    <h1>${title}</h1>
    <p class="lede">Sent ${issue.completed_at ? issue.completed_at.slice(0, 10) : issue.week_start}. ${issue.preheader || ""}</p>
  </div></section>
  <section class="band"><div class="wrap narrow issue-body">${raw(inner)}</div></section>
  <section class="band band-navy band-tight"><div class="wrap split-center"><div><h2>Get the next one.</h2><p>Sunday at 8 AM, ${city.name} time.</p></div>${signupForm({ source: `archive:${city.slug}` })}</div></section>`;
  const head = `<meta property="og:title" content="${title.replace(/"/g, "&quot;")}"><meta property="og:description" content="${(issue.preheader || `The week's security events in ${city.name}.`).replace(/"/g, "&quot;")}">`;
  return page(shell({ title, description: issue.preheader || `The Watch ${city.name}, week of ${issue.week_start}.`, body, city: city.slug, path: `/${city.slug}`, head, image: `/og/issue/${city.slug}/${issue.week_start}.png` }), 200, { "Cache-Control": "public, max-age=3600" });
}
