import { html, page, raw, notFound } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { CITIES, TOPICS, SENIORITY } from "../../_lib/constants.js";
import { todayKey } from "../../_lib/dates.js";
import { liveJobs, jobRow, lazyJobs, REMOTE, POSTER_KINDS, JOB_DAYS } from "../../_lib/jobs.js";

export async function onRequestGet({ params, request, env, waitUntil }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  lazyJobs(env.DB, waitUntil);
  const q = new URL(request.url).searchParams;
  const f = {
    seniority: SENIORITY[q.get("seniority")] ? q.get("seniority") : "",
    topic: TOPICS[q.get("topic")] ? q.get("topic") : "",
    remote: REMOTE[q.get("remote")] ? q.get("remote") : "",
    kind: POSTER_KINDS[q.get("kind")] ? q.get("kind") : "",
    named: q.get("contact") === "1" ? "1" : "",
  };
  const anyFilter = Object.values(f).some(Boolean);
  const [jobs, all] = await Promise.all([liveJobs(env.DB, city.slug, f), anyFilter ? liveJobs(env.DB, city.slug) : null]);
  const total = (all || jobs).length;
  const today = todayKey(city.timezone);
  const named = (all || jobs).filter((j) => j.posted_by_name).length;
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => html`<option value="${k}" ${cur === k ? raw("selected") : ""}>${v}</option>`);

  const body = html`
  <section class="cal-head">
    <div class="wrap">
      <p class="kicker">${city.region}</p>
      <h1>Security jobs in ${city.name}</h1>
      <p class="jobs-lede">Open security, GRC, privacy and audit roles at local employers, each linked to the employer's own posting.${named ? ` Where a hiring manager or recruiter posted about the role, we show who, so you know who to reach out to.` : ""}</p>
      ${total ? html`<form class="filters" method="get" action="/${city.slug}/jobs">
        <label>Seniority<select name="seniority"><option value="">All levels</option>${opt(SENIORITY, f.seniority)}</select></label>
        <label>Topic<select name="topic"><option value="">All topics</option>${opt(Object.fromEntries(Object.entries(TOPICS).filter(([k]) => k !== "social")), f.topic)}</select></label>
        <label>Work model<select name="remote"><option value="">Onsite, hybrid or remote</option>${opt(REMOTE, f.remote)}</select></label>
        <label>Contact<select name="contact"><option value="">All roles</option><option value="1" ${f.named ? raw("selected") : ""}>With a named person</option></select></label>
        <label>Posted by<select name="kind"><option value="">Anyone</option>${opt({ employer: "The employer", staffing: "A staffing firm" }, f.kind)}</select></label>
        <button class="btn btn-small btn-primary" type="submit">Apply</button>
        ${anyFilter ? html`<a class="clear" href="/${city.slug}/jobs">Clear</a>` : ""}
      </form>` : ""}
    </div>
  </section>
  <div class="wrap jobs-wrap">
    ${jobs.length
      ? html`<p class="jobs-count">${anyFilter ? `${jobs.length} of ${total} open roles match.` : `${total} open role${total === 1 ? "" : "s"}.`}</p><ul class="job-list">${jobs.map((j) => jobRow(j, today))}</ul>`
      : html`<p class="jobs-empty">${anyFilter ? html`No roles match these filters. <a href="/${city.slug}/jobs">See all roles</a>.` : `No roles are listed for ${city.name} yet. The first ones are on the way.`}</p>`}
    <p class="jobs-fine">Listings come down after ${JOB_DAYS} days or as soon as the employer's posting closes. Direct employers and named staffing firms with a real opening only, no aggregator links.</p>
  </div>
  <section class="band band-navy band-tight"><div class="wrap split-center">
    <div><h2>Hiring in ${city.name}?</h2><p>Post a security role free. It reaches the people already planning their week on The Watch, and the best roles go in the Sunday email. Want yours at the top of the board and first in Sunday's email? <a href="/${city.slug}/jobs/feature">Feature a role</a>.</p></div>
    <p><a class="btn btn-electric" href="/${city.slug}/jobs/post">Post a role</a></p>
  </div></section>`;
  return page(shell({ title: `Security jobs in ${city.name}`, description: `Open cybersecurity, GRC, privacy and audit roles in ${city.region}, linked to each employer's own posting.`, body, city: city.slug, path: `/${city.slug}/jobs`, wide: true }), 200, { "Cache-Control": "public, max-age=300" });
}
