// One role's own page: /<city>/jobs/<id>-<slug>. It carries the role's JobPosting markup (one per page, as Google
// asks) and sends people to the employer's own posting to apply. Only a published, unexpired role is shown: a closed
// or expired one answers 410 Gone, and anything else (held, rejected, never existed) answers 404, so search engines
// drop it and nobody lands on a stale listing.
import { html, raw, page, notFound } from "../../_lib/html.js";
import { shell, subscribeBand } from "../../_lib/layout.js";
import { TOPICS, SENIORITY, jobBoardOf } from "../../_lib/constants.js";
import { todayKey, fmtDateLong } from "../../_lib/dates.js";
import { initialsOf, hueOf } from "../../_lib/logos.js";
import { jobById, jobPath, jobJsonLd, cleanJobUrl, isFeatured, agoLabel, postedHighlight, postedLabel, removalLink, POSTED_ROLES, REMOTE, JOB_DAYS } from "../../_lib/jobs.js";

// 410 for a role that was listed and has ended. Nothing about the role itself is shown.
function gone(city) {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <h1>This role is no longer open</h1>
    <p class="lede">The employer has closed this posting, or it reached the end of its ${JOB_DAYS} days on the board. The ${city.remote ? "remote" : city.name} board has the roles that are open now.</p>
    <p><a class="btn btn-electric" href="/${city.slug}/jobs">See open roles${city.remote ? "" : ` in ${city.name}`}</a></p>
  </div></section>`;
  return page(shell({ title: "Role closed", body, city: city.remote ? null : city.slug, path: `/${city.slug}/jobs`, head: '<meta name="robots" content="noindex">' }), 410, { "Cache-Control": "public, max-age=300" });
}

export async function onRequestGet({ params, request, env }) {
  if (!jobBoardOf(params.city)) return notFound("Calendar not found");
  const m = /^(\d{1,12})(?:-[a-z0-9-]*)?$/.exec(String(params.job || ""));
  if (!m) return notFound("Role not found");
  const j = await jobById(env.DB, parseInt(m[1], 10)).catch(() => null);
  const city = j && jobBoardOf(j.city);
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
  // The person highlight lasts 21 days from their post; after that the role is an ordinary listing. Rows from before
  // the role field existed keep the plain byline.
  const highlight = postedHighlight(j, today);
  const byline = highlight
    ? html`<span class="job-by-label">${postedLabel(j)}</span><br><span class="person-badge" style="--hue:${hueOf(j.posted_by_name)}" aria-hidden="true">${initialsOf(j.posted_by_name)}</span>${j.posted_by_name}${j.posted_by_title ? `, ${j.posted_by_title}` : ""}<br><small>${agoLabel(j.posted_by_date, today)}${j.posted_by_url ? html` · <a href="${j.posted_by_url}" rel="noopener nofollow" target="_blank">Read their post</a>` : ""} · <a class="job-remove" href="${removalLink(j)}">Ask to be removed</a></small>`
    : j.posted_by_name && !POSTED_ROLES[j.posted_by_role]
      ? html`${j.posted_by_url ? html`<a href="${j.posted_by_url}" rel="noopener nofollow" target="_blank">${j.posted_by_name}</a>` : j.posted_by_name}${j.posted_by_title ? `, ${j.posted_by_title}` : ""}${j.posted_by_kind === "staffing" ? html` <span class="tag">Staffing firm</span>` : ""}${j.posted_by_date ? html`<br><small>Posted about it ${agoLabel(j.posted_by_date, today)}</small>` : ""}<br><small><a class="job-remove" href="${removalLink(j)}">Ask to be removed</a></small>`
      : null;

  const body = html`
  <article class="event-page job-page">
    <div class="wrap narrow">
      <p class="crumbs"><a href="/${city.slug}/jobs">${city.remote ? "Remote security jobs" : `Security jobs in ${city.name}`}</a></p>
      ${isFeatured(j, today) ? html`<span class="job-flag">Featured</span>` : ""}
      <h1>${j.title}</h1>
      <p class="job-employer">${highlight && j.org_slug ? html`<img class="emp-logo emp-logo-inline" src="/logo/${j.org_slug}" alt="" width="32" height="32" decoding="async">` : ""}${j.employer}</p>
      ${topics.length ? html`<div class="tags">${topics.map((t) => html`<span class="tag tag-topic">${TOPICS[t]}</span>`)}</div>` : ""}
      <dl class="event-facts">
        <div><dt>Employer</dt><dd>${j.employer}</dd></div>
        <div><dt>Location</dt><dd>${loc || city.name}</dd></div>
        <div><dt>Work model</dt><dd>${REMOTE[j.remote] || "Not stated"}</dd></div>
        ${SENIORITY[j.seniority] ? html`<div><dt>Level</dt><dd>${SENIORITY[j.seniority]}</dd></div>` : ""}
        ${salary ? html`<div><dt>Salary</dt><dd>${salary}</dd></div>` : ""}
        ${posted ? html`<div><dt>Posted</dt><dd>${fmtDateLong(posted)}<br><small>${agoLabel(posted, today)}</small></dd></div>` : ""}
        ${byline ? html`<div><dt>${highlight ? "Who posted" : "Posted by"}</dt><dd>${byline}</dd></div>` : ""}
      </dl>
      ${j.announced ? html`<p class="job-announced">Announced, not yet on ${j.employer}'s site. ${j.posted_by_name || "The person hiring"} announced this role in a public post before it reached ${j.employer}'s careers page. When the official posting appears, this page switches to it.</p>` : ""}
      ${j.excerpt ? html`<section class="job-excerpt"><h2>From ${j.employer}'s posting</h2><p>${j.excerpt}</p></section>` : ""}
      <div class="cta-row">
        <a class="btn btn-primary job-apply" href="${apply}" rel="noopener nofollow" target="_blank" ping="/go/j/${j.id}">${j.announced ? "Read the post" : raw("Apply on the employer's site")}</a>
        <a class="btn btn-outline" href="/${city.slug}/jobs">More roles in ${city.name}</a>
      </div>
      <p class="source">${j.announced ? `There is no official posting yet; the link above goes to the public post that announced the role.` : `${j.excerpt ? "The rest of the description" : "The full description"} and the application are on ${j.employer}'s own careers page.`} ${highlight ? `${j.posted_by_name} posted about this role publicly, so you know who to reach out to: read their post, apply through the official link once it exists, then send a brief note that mentions their post. ` : j.posted_by_name && !POSTED_ROLES[j.posted_by_role] ? `${j.posted_by_name} posted about this role publicly, so you know who to reach out to. ` : ""}Listings come down after ${JOB_DAYS} days or as soon as the employer's posting closes. <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Correction: " + j.title + " at " + j.employer)}">Report a correction</a>.</p>
    </div>
  </article>
  ${jobJsonLd(j, city, siteUrl, today)}
  ${city.newsletter === "sunday"
    ? subscribeBand({ city, source: `job:${city.slug}`, heading: `New ${city.name} security roles, in your inbox Sunday morning.`, text: `The Sunday email carries a few of the best new roles from the ${city.name} board, alongside every security event in ${city.name} that week.` })
    : subscribeBand({ city, source: `job:${city.slug}` })}`;

  const description = `${j.title} at ${j.employer}, ${loc || city.name}${REMOTE[j.remote] ? ` (${REMOTE[j.remote].toLowerCase()})` : ""}.${salary ? ` ${salary}.` : ""}${posted ? ` Posted ${fmtDateLong(posted)}.` : ""} Apply on ${j.employer}'s own careers page.`;
  return page(shell({ title: `${j.title} at ${j.employer}, ${loc || city.name}`, description, body, city: city.remote ? null : city.slug, path: `/${city.slug}/jobs`, canonical: path }), 200, { "Cache-Control": "public, max-age=300" });
}
