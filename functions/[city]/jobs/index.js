import { html, page, raw, notFound } from "../../_lib/html.js";
import { shell, subscribeBand, filterBox, signupForm } from "../../_lib/layout.js";
import { TOPICS, SENIORITY, jobBoardOf } from "../../_lib/constants.js";
import { todayKey } from "../../_lib/dates.js";
import { liveJobs, postedJobs, jobRow, lazyJobs, postedHighlight, REMOTE, POSTER_KINDS, JOB_DAYS, POSTED_DAYS } from "../../_lib/jobs.js";

export async function onRequestGet({ params, request, env, waitUntil }) {
  const city = jobBoardOf(params.city);
  if (!city) return notFound("Calendar not found");
  lazyJobs(env.DB, waitUntil, env);
  const q = new URL(request.url).searchParams;
  const f = {
    seniority: SENIORITY[q.get("seniority")] ? q.get("seniority") : "",
    topic: TOPICS[q.get("topic")] ? q.get("topic") : "",
    remote: REMOTE[q.get("remote")] ? q.get("remote") : "",
    kind: POSTER_KINDS[q.get("kind")] ? q.get("kind") : "",
    named: q.get("contact") === "1" ? "1" : "",
    posted: q.get("posted") === "1" ? "1" : "",
  };
  const anyFilter = Object.values(f).some(Boolean);
  // Every city board also shows the remote roles someone at the employer posted about (the remote board is /remote/jobs).
  const [jobs, all, remoteRoles] = await Promise.all([liveJobs(env.DB, city.slug, f), anyFilter ? liveJobs(env.DB, city.slug) : null, city.remote ? [] : postedJobs(env.DB, "remote", { limit: 60 })]);
  const total = (all || jobs).length;
  const today = todayKey(city.timezone);
  const named = (all || jobs).filter((j) => j.posted_by_name).length;
  const postedCount = (all || jobs).filter((j) => postedHighlight(j, today)).length;
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => html`<option value="${k}" ${cur === k ? raw("selected") : ""}>${v}</option>`);

  const body = html`
  <section class="cal-head">
    <div class="wrap">
      <p class="kicker">${city.region}</p>
      <h1>${city.remote ? "Remote security jobs across the US" : `Security jobs in ${city.name}`}</h1>
      <p class="jobs-lede">${city.remote ? "Security, GRC, privacy and audit roles open anywhere in the United States, each linked to the employer's own posting." : "Open security, GRC, privacy and audit roles at local employers, each linked to the employer's own posting."}${postedCount ? html` <a href="/${city.slug}/jobs/posted">${postedCount} of them ${postedCount === 1 ? "was" : "were"} posted about by the people hiring</a>, with their name and a link to their post, so you know who to reach out to.` : named ? ` Where a hiring manager or recruiter posted about the role, we show who, so you know who to reach out to.` : ""}</p>
      ${total ? filterBox(html`<form class="filters" method="get" action="/${city.slug}/jobs">
        <label>Seniority<select name="seniority"><option value="">All levels</option>${opt(SENIORITY, f.seniority)}</select></label>
        <label>Topic<select name="topic"><option value="">All topics</option>${opt(Object.fromEntries(Object.entries(TOPICS).filter(([k]) => k !== "social")), f.topic)}</select></label>
        <label>Work model<select name="remote"><option value="">Onsite, hybrid or remote</option>${opt(REMOTE, f.remote)}</select></label>
        <label>Contact<select name="contact"><option value="">All roles</option><option value="1" ${f.named ? raw("selected") : ""}>With a named person</option></select></label>
        <label>Posted about<select name="posted"><option value="">Any role</option><option value="1" ${f.posted ? raw("selected") : ""}>Posted by the people hiring</option></select></label>
        <label>Posted by<select name="kind"><option value="">Anyone</option>${opt({ employer: "The employer", staffing: "A staffing firm" }, f.kind)}</select></label>
        <button class="btn btn-small btn-primary" type="submit">Apply</button>
        ${anyFilter ? html`<a class="clear" href="/${city.slug}/jobs">Clear</a>` : ""}
      </form>`, [f.seniority, f.topic, f.remote, f.named, f.posted, f.kind].filter(Boolean).length) : ""}
    </div>
  </section>
  <div class="wrap jobs-wrap">
    ${remoteRoles.length ? html`<p class="jobs-remote-note"><a href="#remote-roles">Plus ${remoteRoles.length} remote role${remoteRoles.length === 1 ? "" : "s"} open anywhere in the US</a>, posted by people at the employer.</p>` : ""}
    ${jobs.length
      ? html`<p class="jobs-count">${anyFilter ? `${jobs.length} of ${total} open roles match.` : `${total} open role${total === 1 ? "" : "s"}.`}</p><ul class="job-list">${jobs.map((j) => jobRow(j, today))}</ul>`
      : html`<p class="jobs-empty">${anyFilter ? html`No roles match these filters. <a href="/${city.slug}/jobs">See all roles</a>.` : `No roles are listed ${city.remote ? "on the remote board" : `for ${city.name}`} yet. The first ones are on the way.`}</p>`}
    ${remoteRoles.length ? html`<section class="jobs-remote" id="remote-roles"><h2>Remote across the US</h2><p class="jobs-fine">Open anywhere in the United States, posted by someone at the employer. <a href="/remote/jobs">The remote board</a> has them all.</p><ul class="job-list">${remoteRoles.slice(0, 6).map((j) => jobRow(j, today))}</ul>${remoteRoles.length > 6 ? html`<p><a class="btn btn-outline" href="/remote/jobs">See all ${remoteRoles.length} remote roles</a></p>` : ""}</section>` : ""}
    <p class="jobs-fine">Listings come down after ${JOB_DAYS} days or as soon as the employer's posting closes. Direct employers and named staffing firms with a current opening only, no aggregator links. A role someone posted about carries their name for ${POSTED_DAYS} days from the post; anyone named can <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Please remove my name")}">ask to be removed</a>.</p>
  </div>
  ${city.remote ? html`<section class="band band-navy band-tight" id="subscribe"><div class="wrap split-center"><div><h2>Security roles and events, every Sunday.</h2><p>Pick your city: the Sunday email carries its events and the best new roles, remote ones included.</p></div>${signupForm({ source: "jobs:remote", chooseCity: true })}</div></section>` : city.newsletter === "sunday"
    ? subscribeBand({ city, source: `jobs:${city.slug}`, heading: `New ${city.name} security roles, in your inbox Sunday morning.`, text: `The Sunday email carries a few of the best new roles from this board, alongside every security event in ${city.name} that week.` })
    : subscribeBand({ city, source: `jobs:${city.slug}` })}
${city.remote ? "" : html`<section class="band band-paper band-tight"><div class="wrap split-center">
    <div><h2>Hiring in ${city.name}?</h2><p>Post a security role free. It reaches the people already planning their week on The Watch, and the best roles go in the Sunday email. Want yours at the top of the board and first in Sunday's email? <a href="/${city.slug}/jobs/feature">Feature a role</a>.</p></div>
    <p><a class="btn btn-electric" href="/${city.slug}/jobs/post">Post a role</a></p>
  </div></section>`}`;
  return page(shell({ title: city.remote ? "Remote cybersecurity jobs in the US" : `Cybersecurity jobs in ${city.name}`, description: `Open cybersecurity, GRC, privacy and audit roles ${city.remote ? "open anywhere in the United States" : `in ${city.region}`}, linked to each employer's own posting.`, body, city: city.remote ? null : city.slug, path: `/${city.slug}/jobs`, canonical: `/${city.slug}/jobs`, wide: true }), 200, { "Cache-Control": "public, max-age=300" });
}
