// From the people hiring: the roles a hiring manager, a security leader or an in house recruiter posted about in the
// last 21 days, nationwide at /jobs/posted and per city at /<city>/jobs/posted. Nothing is copied from anyone's post;
// each row names the person, says who they are and links to the post itself. See the standing rule in CLAUDE.md.
import { html, page } from "./html.js";
import { shell, subscribeBand } from "./layout.js";
import { CITIES } from "./constants.js";
import { todayKey } from "./dates.js";
import { jobRow, POSTED_DAYS } from "./jobs.js";

export const POSTED_TITLE = "From the people hiring";

function intro(city) {
  const where = city ? `in ${city.region || city.name}` : "in every city The Watch covers";
  return html`<p class="jobs-lede">When a hiring manager, a security leader or an in house recruiter posts publicly about a security role ${where}, it appears here: the role, the person's name and title, and a link to their post, so you know who is behind the opening. Nothing is quoted from the post; read it where they wrote it. A role announced in a post before it reaches the employer's site is listed as announced and switches to the official posting once it appears.</p>`;
}

export function approachNote() {
  return html`<aside class="posted-approach">
    <h2>How to approach</h2>
    <ol>
      <li>Read their post first. It usually says what they care about and why the role is open.</li>
      <li>Apply through the official link once it exists. An announced role has no application yet; watch this page, since it switches over when the posting goes up.</li>
      <li>Then send a brief note that mentions their post. Two or three sentences on why their post caught your eye and what you would bring is plenty.</li>
    </ol>
    <p class="jobs-fine">Each person is named for ${POSTED_DAYS} days from their post, with a link to what they wrote and nothing more. Anyone named can <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Please remove my name")}">ask to be removed</a> and we take the name down the same day.</p>
  </aside>`;
}

// city: a CITIES entry for the city page, or null for the nationwide one. jobs: from postedJobs, newest post first.
export function postedPage(city, jobs, { siteUrl } = {}) {
  const today = todayKey(city ? city.timezone : undefined);
  const path = city ? `/${city.slug}/jobs/posted` : "/jobs/posted";
  const groups = city ? [[city, jobs]] : Object.values(CITIES).map((c) => [c, jobs.filter((j) => j.city === c.slug)]).filter(([, js]) => js.length);
  const body = html`
  <section class="cal-head">
    <div class="wrap">
      <p class="kicker">${city ? city.region : "Every city"}</p>
      <h1>${POSTED_TITLE}${city ? ` in ${city.name}` : ""}</h1>
      ${intro(city)}
      <p class="crumbs">${city ? html`<a href="/${city.slug}/jobs">All security jobs in ${city.name}</a> · <a href="/jobs/posted">Every city</a>` : html`${Object.values(CITIES).map((c, i) => html`${i ? " · " : ""}<a href="/${c.slug}/jobs/posted">${c.name}</a>`)}`}</p>
    </div>
  </section>
  <div class="wrap jobs-wrap">
    ${jobs.length
      ? html`<p class="jobs-count">${jobs.length} role${jobs.length === 1 ? "" : "s"} posted about in the last ${POSTED_DAYS} days, newest post first.</p>
        ${groups.map(([c, js]) => html`${city ? "" : html`<h2 class="posted-city">${c.name}</h2>`}<ul class="job-list">${js.map((j) => jobRow(j, today))}</ul>`)}`
      : html`<p class="jobs-empty">Nobody has posted about an open role ${city ? `in ${city.name}` : ""} in the last ${POSTED_DAYS} days. ${city ? html`The <a href="/${city.slug}/jobs">${city.name} board</a> has every open role.` : html`The city boards have every open role.`}</p>`}
    ${approachNote()}
  </div>
  ${city ? subscribeBand({ city, source: `posted:${city.slug}`, heading: `Hear about these roles first, Sunday morning.`, text: `The Sunday email carries the roles people posted about that week for ${city.name}, before the rest of the board.` }) : ""}`;
  const description = city
    ? `Security roles in ${city.region || city.name} that a hiring manager, a security leader or an in house recruiter posted about, with who posted and a link to their post.`
    : "Security roles across The Watch cities that a hiring manager, a security leader or an in house recruiter posted about, with who posted and a link to their post.";
  return page(shell({ title: city ? `${POSTED_TITLE} in ${city.name}` : POSTED_TITLE, description, body, city: city ? city.slug : null, path, canonical: path, wide: true, head: jobs.length ? "" : '<meta name="robots" content="noindex">' }), 200, { "Cache-Control": "public, max-age=300" });
}
