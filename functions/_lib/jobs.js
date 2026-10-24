// Jobs: curated local roles at /<city>/jobs and a Hiring this week block in the Sunday email. See project doc 125.
// Rows move pending_review -> published (publish by default, same rules as events) -> expired (30 days) or closed (URL gone).
import { initialsOf, hueOf } from "./logos.js";
import { html, raw, slugify } from "./html.js";
import { TOPICS, SENIORITY, cityOf } from "./constants.js";
import { todayKey, addDays } from "./dates.js";
import { isPreview } from "./env.js";

export const JOB_DAYS = 30;

// Job boards and shorteners we never link to: the point of the page is the employer's own posting.
const BOARD_HOSTS = ["linkedin.com", "lnkd.in", "indeed.com", "ziprecruiter.com", "glassdoor.com", "dice.com", "simplyhired.com", "monster.com",
  "builtin.com", "builtinsf.com", "builtinla.com", "builtinnyc.com", "builtinaustin.com", "builtinchicago.com", "builtinboston.com", "builtinseattle.com", "builtincolorado.com", "wellfound.com", "angel.co", "careerbuilder.com", "jooble.org", "talent.com", "snagajob.com", "clearancejobs.com", "bit.ly", "tinyurl.com"];

// Parses a posting URL. Returns the normalized https?:// URL string, or null when it is not a usable web address.
export function cleanJobUrl(raw) {
  let u; try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.username || u.password) return null;
  u.hostname = u.hostname.toLowerCase().replace(/\.+$/, "");
  return u.toString();
}
export function isJobBoard(url) {
  let host; try { host = new URL(url).hostname.toLowerCase().replace(/\.+$/, ""); } catch { return false; }
  return BOARD_HOSTS.some((b) => host === b || host.endsWith("." + b));
}
export const REMOTE = { onsite: "Onsite", hybrid: "Hybrid", remote: "Remote" };
export const POSTER_KINDS = { employer: "Employer's own recruiter or hiring manager", staffing: "Staffing firm recruiter" };

// Roles people post about. Who the person is decides the label; a staffing agency recruiter is never one of them.
export const POSTED_ROLES = { hiring_manager: "Hiring manager", leader: "Security leader", recruiter: "Recruiter" }; // recruiter means in house
export const POSTED_DAYS = 21; // the person highlight lasts this long from the post; an announced role expires then too
const dayDiff = (from, to) => Math.round((Date.parse(String(to).slice(0, 10) + "T00:00:00Z") - Date.parse(String(from).slice(0, 10) + "T00:00:00Z")) / 86400000);
// True while the role should carry the person highlight: a named person with a known role, posted in the last 21 days.
export function postedHighlight(j, today = todayKey()) {
  if (!j || !j.posted_by_name || !POSTED_ROLES[j.posted_by_role] || j.posted_by_kind === "staffing" || !j.posted_by_date) return false;
  const n = dayDiff(j.posted_by_date, today);
  return n <= POSTED_DAYS;
}
export function postedLabel(j) { return POSTED_ROLES[j.posted_by_role] ? `${POSTED_ROLES[j.posted_by_role]} posted` : j.posted_by_kind === "staffing" ? "Staffing firm posted" : "Posted by the employer"; }
// An announced role (no employer posting yet) comes down 21 days after the post unless it gains the employer's URL.
export function announcedExpiry(postedByDate, today = todayKey()) { return addDays(postedByDate || today, POSTED_DAYS); }
export function removalLink(j) { return `mailto:watch@bettersecurity.ai?subject=${encodeURIComponent(`Please remove my name: ${j.title} at ${j.employer || j.employer_name || ""}`)}`; }
const HIGHLIGHT_SQL = "j.posted_by_name IS NOT NULL AND j.posted_by_name != '' AND j.posted_by_role IN ('hiring_manager','leader','recruiter') AND COALESCE(j.posted_by_kind,'') != 'staffing' AND j.posted_by_date >= ?";

// Two titles for the same role, one from a post and one from the employer's board: "Sr. Security Engineer (Remote)"
// and "Senior Security Engineer". Tokens are compared after dropping punctuation, grades and work model words.
const TITLE_NOISE = new Set(["the", "a", "an", "of", "and", "or", "for", "to", "in", "at", "remote", "hybrid", "onsite", "us", "usa", "fulltime", "full", "time", "ft", "i", "ii", "iii", "iv", "1", "2", "3", "4", "new"]);
const TITLE_SYNONYMS = { sr: "senior", jr: "junior", mgr: "manager", eng: "engineer", engr: "engineer", infosec: "security", cybersecurity: "security", cyber: "security", appsec: "application" };
export function titleTokens(t) {
  return new Set(String(t || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => TITLE_SYNONYMS[w] || w).filter((w) => !TITLE_NOISE.has(w)));
}
export function titlesMatch(a, b) {
  const x = titleTokens(a), y = titleTokens(b);
  if (!x.size || !y.size) return false;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  const jaccard = both / (x.size + y.size - both);
  const contains = [...x].every((w) => y.has(w)) || [...y].every((w) => x.has(w));
  return jaccard >= 0.6 || (contains && both >= 2);
}
export const JOB_STATUSES = ["draft", "pending_review", "published", "rejected", "expired", "closed"];

const SELECT = `SELECT j.*, o.name AS org_name, o.slug AS org_slug, o.trusted AS org_trusted FROM jobs j LEFT JOIN organizations o ON o.id = j.organization_id`;

export function hydrateJob(j) {
  if (!j) return null;
  try { j.topics = JSON.parse(j.topics || "[]"); } catch { j.topics = []; }
  j.employer = j.org_name || j.employer_name || "";
  return j;
}

// Board order: featured first, then roles a hiring manager, leader or recruiter posted about in the last 21 days
// (newest post first), then other roles with a named person, then the rest, newest first.
export function sortJobs(jobs, today = todayKey()) {
  const rank = (j) => (isFeatured(j, today) ? 0 : postedHighlight(j, today) ? 1 : j.posted_by_name ? 2 : 3);
  const when = (j) => (postedHighlight(j, today) ? j.posted_by_date : j.posted_at || String(j.created_at || "").slice(0, 10)) || "";
  return jobs.map((j, i) => ({ j, i })).sort((a, b) => rank(a.j) - rank(b.j) || (when(b.j) > when(a.j) ? 1 : when(b.j) < when(a.j) ? -1 : 0) || a.i - b.i).map((x) => x.j);
}

// Live roles for a city: published and not past expiry, in board order (see sortJobs). posted: only roles with the
// person highlight.
export async function liveJobs(db, city, { seniority, topic, remote, kind, named, posted, limit = 200 } = {}) {
  const today = todayKey(cityOf(city) && cityOf(city).timezone);
  const where = ["j.city = ?", "j.status = 'published'", "(j.expires_at IS NULL OR j.expires_at >= ?)"];
  const args = [city, today];
  if (seniority && SENIORITY[seniority]) { where.push("j.seniority = ?"); args.push(seniority); }
  if (topic && TOPICS[topic]) { where.push("j.topics LIKE ?"); args.push(`%"${topic}"%`); }
  if (remote && REMOTE[remote]) { where.push("j.remote = ?"); args.push(remote); }
  if (kind && POSTER_KINDS[kind]) { where.push("j.posted_by_kind = ?"); args.push(kind); }
  if (named) where.push("j.posted_by_name IS NOT NULL AND j.posted_by_name != ''");
  if (posted) { where.push(HIGHLIGHT_SQL); args.push(addDays(today, -POSTED_DAYS)); }
  try {
    const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")}
      ORDER BY (CASE WHEN j.featured_until >= ? THEN 0 ELSE 1 END), (CASE WHEN ${HIGHLIGHT_SQL} THEN 0 ELSE 1 END), (CASE WHEN j.posted_by_name IS NOT NULL AND j.posted_by_name != '' THEN 0 ELSE 1 END), COALESCE(j.posted_by_date, j.posted_at, substr(j.created_at, 1, 10)) DESC, j.id DESC LIMIT ?`).bind(...args, today, addDays(today, -POSTED_DAYS), limit).all();
    return sortJobs(results.map(hydrateJob), today);
  } catch { return []; } // table missing before the migration
}

// Roles with the person highlight, newest post first, for one city or (city null) every city.
export async function postedJobs(db, city = null, { limit = 60 } = {}) {
  const today = todayKey(city && cityOf(city) ? cityOf(city).timezone : undefined);
  const where = ["j.status = 'published'", "(j.expires_at IS NULL OR j.expires_at >= ?)", HIGHLIGHT_SQL];
  const args = [today, addDays(today, -POSTED_DAYS)];
  if (city) { where.push("j.city = ?"); args.push(city); }
  try {
    const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY j.posted_by_date DESC, j.id DESC LIMIT ?`).bind(...args, limit).all();
    return results.map(hydrateJob).filter((j) => postedHighlight(j, today)).sort((a, b) => (b.posted_by_date > a.posted_by_date ? 1 : b.posted_by_date < a.posted_by_date ? -1 : b.id - a.id));
  } catch { return []; }
}

export async function jobById(db, id) {
  return hydrateJob(await db.prepare(`${SELECT} WHERE j.id = ?`).bind(id).first());
}

export function isFeatured(j, today = todayKey()) { return !!(j.featured_until && j.featured_until >= today); }

// "5 days ago", from a YYYY-MM-DD date.
export function agoLabel(day, today = todayKey()) {
  if (!day) return "";
  const n = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(day.slice(0, 10) + "T00:00:00Z")) / 86400000);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

// The email's three: featured roles first, then roles with a named person, then the reader's own level, then the rest.
export function pickJobsFor(jobs, seniority, n = 3, today = todayKey()) {
  const rank = (j) => (isFeatured(j, today) ? 0 : j.posted_by_name ? 1 : seniority && j.seniority === seniority ? 2 : 3);
  return jobs.map((j, i) => ({ j, i })).sort((a, b) => rank(a.j) - rank(b.j) || a.i - b.i).slice(0, n).map((x) => x.j);
}

// Email block for roles people posted about: up to three for the reader's city, before the ordinary picks. Nothing is
// quoted from the post; the reader is sent to read it where it was written.
export function postedEmailBlock(siteUrl, city, posted, issueId, styles, today = todayKey()) {
  const picks = (posted || []).filter((j) => postedHighlight(j, today)).slice(0, 3);
  if (!picks.length) return "";
  const { INK, MUTED, SHIELD, MIST, esc } = styles;
  const rows = picks.map((j) => {
    const where = [j.employer, j.location].filter(Boolean).join(" · ");
    return `<tr><td style="padding:8px 0 10px;border-bottom:1px solid ${MIST};">
      <div style="font-size:11px;font-weight:700;color:${SHIELD};text-transform:uppercase;letter-spacing:.04em;">${esc(postedLabel(j))}${j.announced ? ` · announced, not yet on ${esc(j.employer)}'s site` : ""}</div>
      <a href="${siteUrl}/go/j/${j.id}?i=${issueId || ""}" style="color:${INK};font-weight:700;text-decoration:none;font-size:15px;">${esc(j.title)}</a>
      <div style="color:${MUTED};font-size:13px;margin-top:2px;">${esc(where)}</div>
      <div style="font-size:13px;margin-top:2px;">${esc(j.posted_by_name)}${j.posted_by_title ? `, ${esc(j.posted_by_title)}` : ""} · ${esc(agoLabel(j.posted_by_date, today))}${j.posted_by_url ? ` · <a href="${esc(j.posted_by_url)}" style="color:${SHIELD};font-weight:700;">Read their post</a>` : ""}</div>
    </td></tr>`;
  }).join("");
  return `<div style="font-size:16px;font-weight:800;margin:24px 0 4px;">From the people hiring</div>
  <div style="font-size:13px;color:${MUTED};margin:0 0 6px;">Roles a hiring manager, a security leader or an in house recruiter posted about this week, so you know who is behind the opening.</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  <div style="margin-top:8px;font-size:13px;"><a href="${siteUrl}/${city.slug}/jobs/posted" style="color:${SHIELD};font-weight:700;">All roles from the people hiring in ${esc(city.name)}</a></div>`;
}

// Email block, filled per subscriber at send time (see personalize in dispatch.js).
export function jobsEmailBlock(siteUrl, city, picks, total, issueId, styles) {
  if (!picks.length) return "";
  const { INK, MUTED, SHIELD, MIST, esc } = styles;
  const rows = picks.map((j) => {
    const meta = [j.employer, j.location, REMOTE[j.remote] && j.remote !== "onsite" ? REMOTE[j.remote] : "", j.salary_text].filter(Boolean).join(" · ");
    const by = j.posted_by_name ? `<div style="font-size:13px;color:${MUTED};margin-top:2px;">Posted by ${esc(j.posted_by_name)}${j.posted_by_title ? `, ${esc(j.posted_by_title)}` : ""}</div>` : "";
    return `<tr><td style="padding:8px 0 10px;border-bottom:1px solid ${MIST};">
      <a href="${siteUrl}/go/j/${j.id}?i=${issueId || ""}" style="color:${INK};font-weight:700;text-decoration:none;font-size:15px;">${esc(j.title)}</a>
      <div style="color:${MUTED};font-size:13px;margin-top:2px;">${esc(meta)}</div>${by}
    </td></tr>`;
  }).join("");
  return `<div style="font-size:16px;font-weight:800;margin:24px 0 4px;">Hiring this week</div>
  <div style="font-size:13px;color:${MUTED};margin:0 0 6px;">Local security roles, each linked to the employer's own posting.</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  ${total > picks.length ? `<div style="margin-top:8px;font-size:13px;"><a href="${siteUrl}/${city.slug}/jobs" style="color:${SHIELD};font-weight:700;">See all ${total} open roles</a></div>` : ""}`;
}

// Public page row, laid out like a LinkedIn job card (decided 2026-10-23): the employer's logo, then short lines in a
// fixed order (title, employer, place and level, pay when stated), one insight line naming the person behind the role,
// and a small footer. The whole card opens the role's own page (the title link stretches over it), where the Apply
// button, the link to the person's post and the removal link live. The row keeps its job-<id> anchor.

// "Global CISO, KLDiscovery" reads as "Global CISO" next to the KLDiscovery role.
function shortTitle(title, employer) {
  const t = String(title || "").trim(), e = String(employer || "").trim();
  if (e && t.toLowerCase().endsWith(`, ${e.toLowerCase()}`)) return t.slice(0, -(e.length + 2)).trim();
  if (e && t.toLowerCase().endsWith(` at ${e.toLowerCase()}`)) return t.slice(0, -(e.length + 4)).trim();
  return t;
}
// The insight line: the person, their title, and what they did. Hiring managers and leaders are hiring; recruiters and
// older rows without a role posted the role.
export function insightLine(j, today = todayKey()) {
  const highlight = postedHighlight(j, today);
  if (!highlight && !(j.posted_by_name && !POSTED_ROLES[j.posted_by_role])) return "";
  const who = [j.posted_by_name, shortTitle(j.posted_by_title, j.employer)].filter(Boolean).join(", ");
  const verb = highlight && j.posted_by_role !== "recruiter" ? "is hiring" : "posted this role";
  return html`<p class="job-insight"><span class="person-badge" style="--hue:${hueOf(j.posted_by_name)}" aria-hidden="true">${initialsOf(j.posted_by_name)}</span><span>${who}, ${verb}${j.posted_by_kind === "staffing" ? " (staffing firm)" : ""}</span></p>`;
}
// Kept for callers that still want the long form (the person's line with the post and removal links), such as admin.
export function personLine(j, today = todayKey()) {
  const line = insightLine(j, today);
  if (!line) return "";
  return html`${line}<p class="job-by-links">${j.posted_by_url ? html`<a class="job-post-link" href="${j.posted_by_url}" rel="noopener nofollow" target="_blank">Read their post</a> · ` : ""}<a class="job-remove" href="${removalLink(j)}">Ask to be removed</a></p>`;
}
export function announcedLine(j) { return j.announced ? html`<p class="job-announced">Announced, not yet on ${j.employer}'s site.</p>` : ""; }

export function jobRow(j, today = todayKey()) {
  const highlight = postedHighlight(j, today);
  const where = [j.location, REMOTE[j.remote], SENIORITY[j.seniority]].filter(Boolean).join(" · ");
  const when = highlight && j.posted_by_date ? j.posted_by_date : j.posted_at;
  const foot = [
    isFeatured(j, today) ? html`<span class="job-accent">Featured</span>` : "",
    j.announced ? html`<span class="job-early">Announced early</span>` : "",
    when ? `Posted ${agoLabel(when, today)}` : "",
  ].filter(Boolean);
  const logo = j.org_slug
    ? html`<img class="emp-logo" src="/logo/${j.org_slug}" alt="" width="64" height="64" loading="lazy" decoding="async">`
    : html`<span class="emp-logo emp-initials" style="--hue:${hueOf(j.employer)}" aria-hidden="true">${initialsOf(j.employer)}</span>`;
  return html`<li class="job-row job-card ${isFeatured(j, today) ? "is-featured" : ""} ${highlight ? "is-posted" : ""} ${j.announced ? "is-announced" : ""}" id="job-${j.id}">
    ${logo}
    <div class="job-main">
      <h2 class="job-title"><a href="${jobPath(j)}">${j.title}</a></h2>
      <p class="job-company">${j.employer}</p>
      ${where ? html`<p class="job-where">${where}</p>` : ""}
      ${j.salary_text ? html`<p class="job-pay">${j.salary_text}</p>` : ""}
      ${insightLine(j, today)}
      ${foot.length ? html`<p class="job-foot">${foot.map((f, i) => html`${i ? " · " : ""}${f}`)}</p>` : ""}
    </div>
  </li>`;
}

// Hourly maintenance from the cron (and lazily from page views): publish due rows, expire old ones,
// and recheck a few posting URLs a run so every live role is checked about once a week.
export async function runJobMaintenance(db, { recheck = 8, fetcher = fetch } = {}) {
  const out = { published: 0, expired: 0, checked: 0, closed: 0 };
  try {
    // Up to 600 a run, written 100 to a batch, so a large release (a city launch, a reviewed backlog) goes live within
    // the hour instead of trickling out over a working day.
    const due = await db.prepare(`SELECT id FROM jobs WHERE status='pending_review' AND hold=0 AND auto_publish_at IS NOT NULL AND auto_publish_at <= datetime('now') LIMIT 600`).all();
    const pub = db.prepare(`UPDATE jobs SET status='published', published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), expires_at=COALESCE(expires_at, date('now', '+${JOB_DAYS} days')),
        reviewer_notes=COALESCE(reviewer_notes,'') || ' Auto published ' || date('now') || '.', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending_review'`);
    for (let i = 0; i < due.results.length; i += 100) {
      await db.batch(due.results.slice(i, i + 100).map((r) => pub.bind(r.id)));
      out.published += Math.min(100, due.results.length - i);
    }
    const exp = await db.prepare(`UPDATE jobs SET status='expired', closed_reason='Expired after ${JOB_DAYS} days', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='published' AND expires_at IS NOT NULL AND expires_at < date('now', '-1 day')`).run(); // a day of slack: the page already hides it once the local date passes
    out.expired = (exp.meta && exp.meta.changes) || 0;
    const { results } = await db.prepare(`SELECT id, url FROM jobs WHERE status='published' AND (last_checked_at IS NULL OR last_checked_at < datetime('now', '-7 days')) ORDER BY COALESCE(last_checked_at, '0') LIMIT ?`).bind(recheck).all();
    for (const j of results) {
      let gone = false;
      try {
        const r = await fetcher(j.url, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TheWatchBot/1.0; +https://bettersecurity.ai/about)" }, signal: AbortSignal.timeout(8000) });
        gone = r.status === 404 || r.status === 410;
      } catch { /* network error or timeout: try again next week rather than close a live role */ }
      if (gone) {
        await db.prepare(`UPDATE jobs SET status='closed', closed_reason='Posting URL returned not found on ' || date('now'), last_checked_at=datetime('now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(j.id).run();
        out.closed++;
      } else await db.prepare("UPDATE jobs SET last_checked_at=datetime('now') WHERE id=?").bind(j.id).run();
      out.checked++;
    }
  } catch (e) { out.error = e && e.message; }
  return out;
}

let lastLazy = 0;
// env is optional for older callers; pages pass it so a preview deployment never publishes or expires roles on a visit.
export function lazyJobs(db, waitUntil, env = null) {
  if (isPreview(env)) return;
  const now = Date.now();
  if (now - lastLazy < 600000) return;
  lastLazy = now;
  const p = runJobMaintenance(db, { recheck: 3 }).catch(() => {});
  if (waitUntil) waitUntil(p);
}

export function defaultExpiry(from = todayKey()) { return addDays(from, JOB_DAYS); }

const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
// The state in a posting's location ("Dallas, TX", "Austin, Texas, United States"), as a two letter code, or
// undefined when the location does not say. Never guessed from the city, so a role is not filed in the wrong state.
export function jobRegion(loc) {
  const part = String(loc || "").split(";")[0].split(",")[1];
  if (!part) return undefined;
  const p = part.trim().replace(/\s+\d{5}(-\d{4})?$/, "");
  if (/^[A-Z]{2}$/.test(p) && Object.values(STATES).includes(p)) return p;
  return STATES[p.toLowerCase()];
}

// Each role has its own page at /<city>/jobs/<id>-<slug>. The id is the stable part: the page looks the row up by it.
// The slug is there so the address reads well in search results and shared links. When a title or employer is edited
// the slug changes and the page redirects the old address to the new one, so each role has one canonical URL.
export function jobSlug(j) {
  return slugify([j.title, j.employer || j.org_name || j.employer_name].filter(Boolean).join(" at ")).replace(/^-+|-+$/g, "") || "role";
}
export function jobPath(j) { return `/${j.city}/jobs/${j.id}-${jobSlug(j)}`; }

// JobPosting structured data for one role, with the employer's own posting as the apply link (directApply false,
// since the application happens on the employer's site). Google wants one JobPosting per page, on the role's own page.
export function jobPosting(j, city, siteUrl, today = todayKey()) {
  const region = city.region || city.name;
  const loc = String(j.location || "").split(";")[0].trim();
  const salary = j.salary_text ? (String(j.salary_text).match(/\$?\s?([\d,]{4,})/g) || []).map((m) => parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => n >= 20000) : [];
  return {
    "@context": "https://schema.org", "@type": "JobPosting",
    title: j.title,
    // The employer's opening paragraph when the board gave us one, then where to read the rest and apply.
    description: `${j.excerpt ? `${j.excerpt} ` : ""}${j.title} at ${j.employer}${loc ? `, ${loc}` : ""}${SENIORITY[j.seniority] ? ` (${SENIORITY[j.seniority]})` : ""}. Listed on The Watch ${city.name}, the security events calendar and jobs board for ${region}; the ${j.excerpt ? "rest of the" : "full"} description and application are on ${j.employer}'s own careers page.`,
    datePosted: j.posted_at || String(j.created_at || "").slice(0, 10) || today,
    validThrough: j.expires_at ? `${j.expires_at}T23:59:59` : undefined,
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: j.employer },
    jobLocation: j.remote === "remote" ? undefined : { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc.split(",")[0] || city.name, addressRegion: jobRegion(loc), addressCountry: "US" } },
    jobLocationType: j.remote === "remote" ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: j.remote === "remote" ? { "@type": "Country", name: "USA" } : undefined,
    baseSalary: salary.length ? { "@type": "MonetaryAmount", currency: "USD", value: salary.length > 1 ? { "@type": "QuantitativeValue", minValue: Math.min(...salary), maxValue: Math.max(...salary), unitText: "YEAR" } : { "@type": "QuantitativeValue", value: salary[0], unitText: "YEAR" } } : undefined,
    directApply: false,
    url: `${siteUrl}${jobPath(j)}`,
    identifier: { "@type": "PropertyValue", name: "The Watch", value: String(j.id) },
  };
}
const ldScript = (data) => raw(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
// An announced role has no official posting yet, so it carries no JobPosting markup.
export function jobJsonLd(j, city, siteUrl, today = todayKey()) { return j.announced ? "" : ldScript(jobPosting(j, city, siteUrl, today)); }
