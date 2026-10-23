// One role's own page: /<city>/jobs/<id>-<slug>. It carries the role's JobPosting markup (one per page, as Google
// asks) and sends people to the employer's own posting to apply. Only a published, unexpired role is shown: a closed
// or expired one answers 410 Gone, and anything else (held, rejected, never existed) answers 404, so search engines
// drop it and nobody lands on a stale listing.
import { html, page, notFound } from "../../_lib/html.js";
import { shell, subscribeBand } from "../../_lib/layout.js";
import { CITIES, TOPICS, SENIORITY } from "../../_lib/constants.js";
import { todayKey, fmtDateLong } from "../../_lib/dates.js";
import { jobById, jobPath, jobJsonLd, cleanJobUrl, isFeatured, agoLabel, REMOTE, JOB_DAYS } from "../../_lib/jobs.js";

// 410 for a role that was listed and has ended. Nothing about the role itself is shown.
function gone(city) {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <h1>This role is no longer open</h1>
    <p class="lede">The employer has closed this posting, or it reached the end of its ${JOB_DAYS} days on the board. The ${city.name} board has the roles that are open now.</p>
    <p><a class="btn btn-electric" href="/${city.slug}/jobs">See open roles in ${city.name}</a></p>
  </div></section>`;
  return page(shell({ title: "Role closed", body, city: city.slug, path: `/${city.slug}/jobs`, head: '<meta name="robots" content="noindex">' }), 410, { "Cache-Control": "public, max-age=300" });
}

export async function onRequestGet({ params, request, env }) {
  if (!CITIES[params.city]) return notFound("Calendar not found");
  const m = /^(\d{1,12})(?:-[a-z0-9-]*)?$/.exec(String(params.job || ""));
  if (!m) return notFound("Role not found");
  const j = await jobById(env.DB, parseInt(m[1], 10)).catch(() => null);
  const city = j && CITIES[j.city];
  if (!j || !city) return notFound("Role not found");
  const today = todayKey(city.timezone);
  if (j.status === "closed" || j.status === "expired" || (j.status === "published" && j.expires_at && j.expires_at < today)) return gone(city);
  if (j.status !== "published") return notFound("Role not found");
  // One canonical address per role: an old slug or the wrong city redirects to the current one.
  const path = jobPath(j);
  if (new URL(request.url).pathname !== path) return Response.redirect(new URL(path, request.url).toString(), 301);

  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const apply = cleanJobUrl(j.url) || `/go/j/${j.id}`; // the saved posting; the tracked redirect if it does not parse
  const loc = String(j.location || "").split(";")[0].trim();
  const salary = j.salary_text ? String(j.salary_text).trim().replace(/[.\s]+$/, "") : "";
  const topics = j.topics.filter((t) => TOPICS[t]);
  const posted = j.posted_at || String(j.created_at || "").slice(0, 10);
  const byline = j.posted_by_name ? html`${j.posted_by_url ? html`<a href="${j.posted_by_url}" rel="noopener nofollow" target="_blank">${j.posted_by_name}</a>` : j.posted_by_name}${j.posted_by_title ? `, ${j.posted_by_title}` : ""}${j.posted_by_kind === "staffing" ? html` <span class="tag">Staffing firm</span>` : ""}${j.posted_by_date ? html`<br><small>Posted about it ${agoLabel(j.posted_by_date, today)}</small>` : ""}` : null;

  const body = html`
  <article class="event-page job-page">
    <div class="wrap narrow">
      <p class="crumbs"><a href="/${city.slug}/jobs">Security jobs in ${city.name}</a></p>
      ${isFeatured(j, today) ? html`<span class="job-flag">Featured</span>` : ""}
      <h1>${j.title}</h1>
      <p class="job-employer">${j.employer}</p>
      ${topics.length ? html`<div class="tags">${topics.map((t) => html`<span class="tag tag-topic">${TOPICS[t]}</span>`)}</div>` : ""}
      <dl class="event-facts">
        <div><dt>Employer</dt><dd>${j.employer}</dd></div>
        <div><dt>Location</dt><dd>${loc || city.name}</dd></div>
        <div><dt>Work model</dt><dd>${REMOTE[j.remote] || "Not stated"}</dd></div>
        ${SENIORITY[j.seniority] ? html`<div><dt>Level</dt><dd>${SENIORITY[j.seniority]}</dd></div>` : ""}
        ${salary ? html`<div><dt>Salary</dt><dd>${salary}</dd></div>` : ""}
        ${posted ? html`<div><dt>Posted</dt><dd>${fmtDateLong(posted)}<br><small>${agoLabel(posted, today)}</small></dd></div>` : ""}
        ${byline ? html`<div><dt>Posted by</dt><dd>${byline}</dd></div>` : ""}
      </dl>
      <div class="cta-row">
        <a class="btn btn-primary job-apply" href="${apply}" rel="noopener nofollow" target="_blank" ping="/go/j/${j.id}">Apply on the employer's site</a>
        <a class="btn btn-outline" href="/${city.slug}/jobs">More roles in ${city.name}</a>
      </div>
      <p class="source">The full description and the application are on ${j.employer}'s own careers page. ${j.posted_by_name ? `${j.posted_by_name} posted about this role publicly, so you know who to reach out to. ` : ""}Listings come down after ${JOB_DAYS} days or as soon as the employer's posting closes. <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Correction: " + j.title + " at " + j.employer)}">Report a correction</a>.</p>
    </div>
  </article>
  ${jobJsonLd(j, city, siteUrl, today)}
  ${city.newsletter === "sunday"
    ? subscribeBand({ city, source: `job:${city.slug}`, heading: `New ${city.name} security roles, in your inbox Sunday morning.`, text: `The Sunday email carries a few of the best new roles from the ${city.name} board, alongside every security event in ${city.name} that week.` })
    : subscribeBand({ city, source: `job:${city.slug}` })}`;

  const description = `${j.title} at ${j.employer}, ${loc || city.name}${REMOTE[j.remote] ? ` (${REMOTE[j.remote].toLowerCase()})` : ""}.${salary ? ` ${salary}.` : ""}${posted ? ` Posted ${fmtDateLong(posted)}.` : ""} Apply on ${j.employer}'s own careers page.`;
  return page(shell({ title: `${j.title} at ${j.employer}, ${loc || city.name}`, description, body, city: city.slug, path: `/${city.slug}/jobs`, canonical: path }), 200, { "Cache-Control": "public, max-age=300" });
}
