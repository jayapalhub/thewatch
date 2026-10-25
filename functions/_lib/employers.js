// Employer pages: /employers lists every employer with a live role, /employers/<slug> lists one employer's live roles
// across every board, named roles first. Both read with one query on indexed columns (idx_jobs_org_status for one
// employer, idx_jobs_status_expires for the index). Roles with no organization row are only on the city boards.
import { html, page } from "./html.js";
import { shell } from "./layout.js";
import { CITIES, jobBoardOf } from "./constants.js";
import { todayKey } from "./dates.js";
import { hydrateJob, sortJobs, isNamed, jobRow, POSTED_DAYS } from "./jobs.js";

export const employerPath = (slug) => `/employers/${slug}`;
const LIVE = "j.status = 'published' AND (j.expires_at IS NULL OR j.expires_at >= date('now'))";
const SELECT = "SELECT j.*, o.name AS org_name, o.slug AS org_slug, o.trusted AS org_trusted FROM jobs j JOIN organizations o ON o.id = j.organization_id";

export async function employerBySlug(db, slug) {
  if (!/^[a-z0-9-]{1,100}$/.test(String(slug || ""))) return null;
  return db.prepare("SELECT id, slug, name, website, description FROM organizations WHERE slug=?").bind(slug).first();
}
// One employer's live roles, in board order (named first, then featured, then the recent posts, then newest).
export async function employerJobs(db, orgId) {
  const { results } = await db.prepare(`${SELECT} WHERE j.organization_id = ? AND ${LIVE} ORDER BY j.posted_at DESC, j.id DESC LIMIT 200`).bind(orgId).all();
  return sortJobs((results || []).map(hydrateJob));
}
// Employers with at least one live role, most roles first. q filters by name, case blind, for the index page.
export async function employerIndex(db, q = "") {
  const term = String(q || "").trim().toLowerCase().slice(0, 60);
  const where = [LIVE]; const args = [];
  if (term) { where.push("lower(o.name) LIKE ?"); args.push(`%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`); }
  const { results } = await db.prepare(`SELECT o.slug, o.name, COUNT(*) n, SUM(CASE WHEN j.posted_by_name IS NOT NULL AND j.posted_by_name != '' THEN 1 ELSE 0 END) named
    FROM jobs j JOIN organizations o ON o.id = j.organization_id WHERE ${where.join(" AND ")}${term ? " ESCAPE '\\'" : ""} GROUP BY o.id ORDER BY n DESC, o.name LIMIT 500`).bind(...args).all();
  return { term, employers: results || [] };
}

const boardName = (slug) => (slug === "remote" ? "Remote, anywhere in the US" : (jobBoardOf(slug) || {}).name || slug);
const boardOrder = (slug) => (slug === "remote" ? 999 : (CITIES[slug] || {}).sort || 500);
const fine = html`<p class="jobs-fine">Every role links to the employer's own posting, never an aggregator. A role someone at the employer posted about carries their name and a link to their post for ${POSTED_DAYS} days; anyone named can <a href="mailto:watch@bettersecurity.ai?subject=${encodeURIComponent("Please remove my name")}">ask to be removed</a>.</p>`;

function header(o, count) {
  const site = o.website && /^https?:\/\//.test(o.website) ? o.website : null;
  return html`<section class="cal-head"><div class="wrap emp-head">
    <img class="emp-logo emp-logo-page" src="/logo/${o.slug}" alt="" width="72" height="72" decoding="async">
    <div>
      <p class="crumbs"><a href="/employers">Employers hiring in security</a></p>
      <h1>${o.name}</h1>
      <p class="jobs-lede">${count ? `${count} open security role${count === 1 ? "" : "s"}, each linked to ${o.name}'s own posting.` : `No open security roles on The Watch right now.`}${site ? html` <a href="${site}" rel="noopener" target="_blank">${site.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>` : ""}</p>
    </div>
  </div></section>`;
}

export function employerPage(o, jobs) {
  const today = todayKey();
  const named = jobs.filter(isNamed), rest = jobs.filter((j) => !isNamed(j));
  const byCity = new Map();
  for (const j of rest) { if (!byCity.has(j.city)) byCity.set(j.city, []); byCity.get(j.city).push(j); }
  const cities = [...byCity].sort((a, b) => boardOrder(a[0]) - boardOrder(b[0]));
  const list = (rows) => html`<ul class="job-list">${rows.map((j) => jobRow(j, today))}</ul>`;
  const body = html`${header(o, jobs.length)}
  <div class="wrap jobs-wrap">
    ${jobs.length ? html`
      ${named.length ? html`<section class="jobs-named" id="named-roles"><h2>From the people hiring</h2><p class="jobs-fine">Roles someone at ${o.name} posted about publicly, with a link to their post.</p>${list(named)}</section>` : ""}
      ${cities.map(([slug, rows]) => html`<section class="jobs-city" id="city-${slug}"><h2>${boardName(slug)}</h2>${list(rows)}</section>`)}
      ${fine}`
    : html`<p class="jobs-empty">${o.name} has no open security roles listed on The Watch at the moment. Roles come down thirty days after they go live or as soon as the employer's posting closes, so this page fills in again when ${o.name} posts the next one. The <a href="/employers">employers index</a> and the city boards have what is open now.</p>
      <p class="crumbs">${Object.values(CITIES).map((c, i) => html`${i ? " · " : ""}<a href="/${c.slug}/jobs">${c.name}</a>`)} · <a href="/remote/jobs">Remote</a></p>`}
  </div>`;
  const description = jobs.length
    ? `${jobs.length} open cybersecurity, GRC, privacy and audit role${jobs.length === 1 ? "" : "s"} at ${o.name}${named.length ? `, ${named.length} posted about by someone at the employer` : ""}, each linked to ${o.name}'s own posting.`
    : `${o.name} on The Watch: open security roles appear here when ${o.name} posts them.`;
  return page(shell({ title: `Security jobs at ${o.name}`, description, body, path: "/employers", canonical: employerPath(o.slug), wide: true, head: jobs.length ? "" : '<meta name="robots" content="noindex">' }), 200, { "Cache-Control": "public, max-age=300" });
}

export function employerIndexPage({ term, employers }) {
  const total = employers.reduce((a, e) => a + (e.n || 0), 0);
  const body = html`
  <section class="cal-head"><div class="wrap">
    <p class="kicker">Every board</p>
    <h1>Employers hiring in security</h1>
    <p class="jobs-lede">${employers.length ? `${employers.length} employer${employers.length === 1 ? "" : "s"} with ${total} open role${total === 1 ? "" : "s"} across The Watch boards, most roles first.` : term ? `No employer matches "${term}".` : "No employer has an open role listed right now."} Each employer page lists its live roles, with the roles someone there posted about first.</p>
    <form class="filters" method="get" action="/employers">
      <label>Employer name<input type="search" name="q" value="${term}" placeholder="Search employers" maxlength="60"></label>
      <button class="btn btn-small btn-primary" type="submit">Filter</button>
      ${term ? html`<a class="clear" href="/employers">Clear</a>` : ""}
    </form>
  </div></section>
  <div class="wrap jobs-wrap">
    ${employers.length ? html`<ul class="emp-list">${employers.map((e) => html`<li><a href="${employerPath(e.slug)}"><img class="emp-logo" src="/logo/${e.slug}" alt="" width="40" height="40" loading="lazy" decoding="async"><span class="emp-name">${e.name}</span><span class="emp-count">${e.n} role${e.n === 1 ? "" : "s"}${e.named ? html` <small>${e.named} posted about</small>` : ""}</span></a></li>`)}</ul>` : ""}
    ${fine}
  </div>`;
  return page(shell({ title: "Employers hiring in security", description: "Every employer with an open cybersecurity, GRC, privacy or audit role on The Watch, with a page per employer listing its live roles.", body, path: "/employers", canonical: term ? null : "/employers", wide: true, head: term ? '<meta name="robots" content="noindex">' : "" }), 200, { "Cache-Control": "public, max-age=300" });
}
