// Jobs: curated local roles at /<city>/jobs and a Hiring this week block in the Sunday email. See project doc 125.
// Rows move pending_review -> published (publish by default, same rules as events) -> expired (30 days) or closed (URL gone).
import { html, raw } from "./html.js";
import { TOPICS, SENIORITY, cityOf } from "./constants.js";
import { todayKey, addDays } from "./dates.js";

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
export const JOB_STATUSES = ["draft", "pending_review", "published", "rejected", "expired", "closed"];

const SELECT = `SELECT j.*, o.name AS org_name, o.slug AS org_slug, o.trusted AS org_trusted FROM jobs j LEFT JOIN organizations o ON o.id = j.organization_id`;

export function hydrateJob(j) {
  if (!j) return null;
  try { j.topics = JSON.parse(j.topics || "[]"); } catch { j.topics = []; }
  j.employer = j.org_name || j.employer_name || "";
  return j;
}

// Live roles for a city: published and not past expiry. Featured roles first, then newest.
// Tiered board: featured first, then roles with a named person (the thing nobody else lists), then the rest, newest first.
export async function liveJobs(db, city, { seniority, topic, remote, kind, named, limit = 200 } = {}) {
  const today = todayKey(cityOf(city) && cityOf(city).timezone);
  const where = ["j.city = ?", "j.status = 'published'", "(j.expires_at IS NULL OR j.expires_at >= ?)"];
  const args = [city, today];
  if (seniority && SENIORITY[seniority]) { where.push("j.seniority = ?"); args.push(seniority); }
  if (topic && TOPICS[topic]) { where.push("j.topics LIKE ?"); args.push(`%"${topic}"%`); }
  if (remote && REMOTE[remote]) { where.push("j.remote = ?"); args.push(remote); }
  if (kind && POSTER_KINDS[kind]) { where.push("j.posted_by_kind = ?"); args.push(kind); }
  if (named) where.push("j.posted_by_name IS NOT NULL AND j.posted_by_name != ''");
  try {
    const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")}
      ORDER BY (CASE WHEN j.featured_until >= ? THEN 0 ELSE 1 END), (CASE WHEN j.posted_by_name IS NOT NULL AND j.posted_by_name != '' THEN 0 ELSE 1 END), COALESCE(j.posted_at, substr(j.created_at, 1, 10)) DESC, j.id DESC LIMIT ?`).bind(...args, today, limit).all();
    return results.map(hydrateJob);
  } catch { return []; } // table missing before the migration
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

// Public page row.
export function jobRow(j, today = todayKey()) {
  const where = [j.location, REMOTE[j.remote]].filter(Boolean).join(", ");
  return html`<li class="job-row ${isFeatured(j, today) ? "is-featured" : ""}" id="job-${j.id}">
    <div class="job-main">
      ${isFeatured(j, today) ? html`<span class="job-flag">Featured</span>` : ""}
      <h3 class="job-title"><a href="/go/j/${j.id}" rel="noopener" target="_blank">${j.title}</a></h3>
      <p class="job-meta">${[j.employer, where, SENIORITY[j.seniority], j.salary_text].filter(Boolean).join(" · ")}</p>
      ${j.posted_by_name ? html`<p class="job-by">${j.posted_by_url ? html`<a href="${j.posted_by_url}" rel="noopener nofollow" target="_blank">Posted by ${j.posted_by_name}</a>` : html`Posted by ${j.posted_by_name}`}${j.posted_by_title ? `, ${j.posted_by_title}` : ""}${j.posted_by_kind === "staffing" ? html` <span class="tag">Staffing firm</span>` : ""}${j.posted_by_date ? html` <span class="job-when">${agoLabel(j.posted_by_date, today)}</span>` : ""}</p>` : ""}
      <div class="tags">${j.topics.slice(0, 3).map((t) => (TOPICS[t] ? html`<span class="tag tag-topic">${TOPICS[t]}</span>` : ""))}${j.posted_at ? html`<span class="job-when">Posted ${agoLabel(j.posted_at, today)}</span>` : ""}</div>
    </div>
    <a class="btn btn-outline btn-small job-apply" href="/go/j/${j.id}" rel="noopener" target="_blank">Apply</a>
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
export function lazyJobs(db, waitUntil) {
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

// JobPosting structured data for a city's board: one object per live role, the employer's own posting as the
// apply link (directApply false, since the application happens on the employer's site).
export function jobsJsonLd(jobs, city, siteUrl, today = todayKey()) {
  if (!jobs || !jobs.length) return "";
  const region = city.region || city.name;
  const items = jobs.slice(0, 50).map((j) => {
    const loc = String(j.location || "").split(";")[0].trim();
    const salary = j.salary_text ? (String(j.salary_text).match(/\$?\s?([\d,]{4,})/g) || []).map((m) => parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => n >= 20000) : [];
    return {
      "@context": "https://schema.org", "@type": "JobPosting",
      title: j.title,
      description: `${j.title} at ${j.employer}${loc ? `, ${loc}` : ""}${SENIORITY[j.seniority] ? ` (${SENIORITY[j.seniority]})` : ""}. Listed on The Watch ${city.name}, the security events calendar and jobs board for ${region}; the full description and application are on ${j.employer}'s own careers page.`,
      datePosted: j.posted_at || String(j.created_at || "").slice(0, 10) || today,
      validThrough: j.expires_at ? `${j.expires_at}T23:59:59` : undefined,
      employmentType: "FULL_TIME",
      hiringOrganization: { "@type": "Organization", name: j.employer },
      jobLocation: j.remote === "remote" ? undefined : { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc.split(",")[0] || city.name, addressRegion: jobRegion(loc), addressCountry: "US" } },
      jobLocationType: j.remote === "remote" ? "TELECOMMUTE" : undefined,
      applicantLocationRequirements: j.remote === "remote" ? { "@type": "Country", name: "USA" } : undefined,
      baseSalary: salary.length ? { "@type": "MonetaryAmount", currency: "USD", value: salary.length > 1 ? { "@type": "QuantitativeValue", minValue: Math.min(...salary), maxValue: Math.max(...salary), unitText: "YEAR" } : { "@type": "QuantitativeValue", value: salary[0], unitText: "YEAR" } } : undefined,
      directApply: false,
      url: `${siteUrl}/${city.slug}/jobs#job-${j.id}`,
      identifier: { "@type": "PropertyValue", name: "The Watch", value: String(j.id) },
    };
  });
  return raw(`<script type="application/ld+json">${JSON.stringify(items).replace(/</g, "\\u003c")}</script>`);
}
