// Weekly jobs sweep: reads employer job boards (Workday, Greenhouse, Lever, Ashby) and files security, GRC, privacy
// and audit roles for the right city as pending_review with a 24 hour auto publish, the same publish by default rule
// as events. Jerome can hold or reject a role in that window; if he does nothing it goes live. Roles that drop off a
// board are closed on the next run. Every row links to the employer's own posting. See project doc 135.
import { autoPublishAt } from "./autopublish.js";
import { cleanJobUrl, JOB_DAYS } from "./jobs.js";
import { slugify } from "./html.js";

// What counts as one of our roles. Title must match SECURITY_RE and must not match NOT_OURS_RE.
const SECURITY_RE = /\b(security|cyber|infosec|information assurance|GRC|governance,? risk|privacy|IT audit|technology audit|IS audit|third[- ]party risk|vendor risk|TPRM|compliance (?:analyst|manager|engineer|program)|ISSO|ISSM|ISSE|SOC analyst|threat|incident response|identity and access|IAM|penetration|red team|application security|appsec|DevSecOps|vulnerability|CISO|risk (?:analyst|manager) \(?(?:IT|technology|cyber)|cryptograph)\b/i;
const NOT_OURS_RE = /\b(guard|officer, security|security officer|physical security|corporate security|regional security|global security|event security|workplace security|crisis|executive protection|protective|loss prevention|sales|account executive|account manager|business development|marketing|recruiter|intern(?:ship)?|co-op|facilities|janitor|custod|driver|nurse|clinical|social security|food|cashier|securities|security clearance only)\b/i;

export const SOURCE_KINDS = { workday: "Workday", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

const PAY_RE = /\$\s?[\d,]{4,}(?:\.\d+)?(?:\s*(?:-|to|–|—)\s*\$\s?[\d,]{4,}(?:\.\d+)?)|[\d,]{5,}(?:\.\d+)?\s*USD\s*(?:-|to|–|—)\s*[\d,]{5,}(?:\.\d+)?\s*USD/;
const strip = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function isOurRole(title) {
  const t = String(title || "");
  return SECURITY_RE.test(t) && !NOT_OURS_RE.test(t);
}
export function inCity(locationText, terms) {
  const loc = String(locationText || "").toLowerCase();
  return terms.some((t) => t && loc.includes(t.toLowerCase()));
}
export function parseTerms(s) { return String(s || "").split(",").map((x) => x.trim()).filter(Boolean); }

export function inferTopics(title) {
  const t = String(title).toLowerCase(); const out = [];
  const add = (k) => { if (!out.includes(k)) out.push(k); };
  if (/grc|governance|risk|compliance|third.?party|vendor|tprm|issm|isso|rmf/.test(t)) add("grc");
  if (/privacy|data protection|cipp/.test(t)) add("privacy");
  if (/audit/.test(t)) add("audit");
  if (/cloud|aws|azure|gcp|kubernetes|devsecops|platform/.test(t)) add("cloud");
  if (/\bai\b|machine learning|ml\b|llm/.test(t)) add("ai");
  if (/appsec|application security|product security|software security|secure code|devsecops|penetration|red team|offensive/.test(t)) add("appsec");
  if (/identity|iam|access management|pam|zero trust/.test(t)) add("identity");
  if (/network|firewall|\bot\b|ics|scada|infrastructure/.test(t)) add("network");
  if (/threat|incident|soc\b|detection|forensic|hunt/.test(t)) add("threat_intel");
  if (/ciso|chief|vp|vice president|director|head of/.test(t)) add("leadership");
  if (!out.length) add("grc");
  return out.slice(0, 3);
}
export function inferSeniority(title) {
  const t = String(title).toLowerCase();
  if (/chief|ciso|\bvp\b|vice president|executive/.test(t)) return "executive";
  if (/director|head of|principal/.test(t)) return "director";
  if (/manager|lead\b|supervisor|biso/.test(t)) return "manager";
  if (/\b(i|1|associate|junior|entry|analyst i)\b$|\bi\b$|intern/.test(t)) return "early_career";
  return "practitioner";
}
export function inferRemote(locationText) {
  const l = String(locationText || "").toLowerCase();
  if (/remote/.test(l) && /,|\band\b|hybrid|\//.test(l)) return "hybrid";
  if (/hybrid/.test(l)) return "hybrid";
  if (/^remote/.test(l)) return "remote";
  return "onsite";
}
function payText(html) { const m = strip(html).match(PAY_RE); if (!m) return null; let s = m[0].replace(/\s+/g, " ").replace(/\$\s/g, "$"); if (!s.includes("$")) s = s.replace(/([\d,.]+)\s*USD/g, "$$$1"); return s; }

async function getJson(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { "User-Agent": "TheWatchJobsBot/1.0 (+https://bettersecurity.ai/about)", Accept: "application/json", ...(init.headers || {}) }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- adapters: each returns [{ key, title, url, location, posted_at (YYYY-MM-DD or null), salary_text, remote }] ----------
const WORKDAY_MAX_DETAILS = 25; // detail fetches per run; a Worker invocation has a small subrequest budget

export async function pullWorkday(cfg, searchText, fetcher = getJson, terms = []) {
  const base = `https://${cfg.tenant}.${cfg.host}.myworkdayjobs.com`;
  const out = [];
  let details = 0;
  for (let offset = 0; offset < 300 && details < WORKDAY_MAX_DETAILS; offset += 20) {
    const page = await fetcher(`${base}/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }) });
    const list = page.jobPostings || [];
    for (const p of list) {
      if (!isOurRole(p.title)) continue;
      // A single named location that is not in this city needs no detail fetch; "3 Locations" has to be opened to know.
      if (terms.length && p.locationsText && !/\d+ Locations/i.test(p.locationsText) && !inCity(p.locationsText, terms)) continue;
      if (details++ >= WORKDAY_MAX_DETAILS) { out.partial = true; break; }
      let info = {};
      try { info = (await fetcher(`${base}/wday/cxs/${cfg.tenant}/${cfg.site}${p.externalPath}`)).jobPostingInfo || {}; } catch { continue; }
      const locs = [info.location, ...(info.additionalLocations || [])].filter(Boolean).join("; ") || p.locationsText || "";
      out.push({ key: info.jobReqId || (p.bulletFields || [])[0] || p.externalPath, title: info.title || p.title, url: info.externalUrl || `${base}/${cfg.site}${p.externalPath}`,
        location: locs, posted_at: /^\d{4}-\d{2}-\d{2}$/.test(info.startDate || "") ? info.startDate : null, salary_text: payText(info.jobDescription), remote: inferRemote(locs) });
    }
    if (list.length < 20 || offset + 20 >= (page.total || 0)) break;
  }
  if (out.length >= WORKDAY_MAX_DETAILS) out.partial = true;
  return out;
}
// Workday search is fuzzy and paged, so a role missing from one run's list is not proof it closed. Ask for it directly.
async function workdayStillOpen(cfg, url, fetcher) {
  const m = String(url).match(/myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?[^/]+(\/job\/.+)$/);
  if (!m) return true;
  try { const j = await fetcher(`https://${cfg.tenant}.${cfg.host}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}${m[1].split("?")[0]}`); return !!(j && j.jobPostingInfo); }
  catch (e) { return !/HTTP 404/.test(String(e && e.message)); } // network trouble: keep it
}
export async function pullGreenhouse(cfg, _search, fetcher = getJson) {
  const j = await fetcher(`https://boards-api.greenhouse.io/v1/boards/${cfg.board}/jobs?content=true`);
  return (j.jobs || []).filter((x) => isOurRole(x.title)).map((x) => {
    const loc = (x.location && x.location.name) || (x.offices || []).map((o) => o.name).join("; ");
    return { key: String(x.id), title: x.title, url: x.absolute_url, location: loc, posted_at: (x.updated_at || "").slice(0, 10) || null, salary_text: payText(x.content), remote: inferRemote(loc) };
  });
}
export async function pullLever(cfg, _search, fetcher = getJson) {
  const j = await fetcher(`https://api.lever.co/v0/postings/${cfg.company}?mode=json`);
  return (Array.isArray(j) ? j : []).filter((x) => isOurRole(x.text)).map((x) => {
    const c = x.categories || {}; const loc = [c.location, c.allLocations && c.allLocations.join("; ")].filter(Boolean).join("; ");
    const wp = (x.workplaceType || "").toLowerCase();
    return { key: x.id, title: x.text, url: x.hostedUrl, location: loc, posted_at: x.createdAt ? new Date(x.createdAt).toISOString().slice(0, 10) : null, salary_text: payText(x.descriptionPlain || x.description), remote: wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : inferRemote(loc) };
  });
}
export async function pullAshby(cfg, _search, fetcher = getJson) {
  const j = await fetcher(`https://api.ashbyhq.com/posting-api/job-board/${cfg.board}?includeCompensation=true`);
  return (j.jobs || []).filter((x) => isOurRole(x.title)).map((x) => {
    const loc = [x.location, ...(x.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join("; ");
    const comp = x.compensation && x.compensation.compensationTierSummary;
    return { key: x.id, title: x.title, url: x.jobUrl, location: loc, posted_at: (x.publishedAt || "").slice(0, 10) || null, salary_text: comp && /\$/.test(comp) ? comp : payText(x.descriptionHtml), remote: x.isRemote ? (loc && !/remote/i.test(loc) ? "hybrid" : "remote") : inferRemote(loc) };
  });
}
const ADAPTERS = { workday: pullWorkday, greenhouse: pullGreenhouse, lever: pullLever, ashby: pullAshby };

// Run one source. Files new roles, refreshes pay and posted dates on known ones, closes the ones that left the board.
export async function runJobSource(db, src, { fetcher = getJson, now = new Date() } = {}) {
  const run = { source: src.employer_name, fetched: 0, added: 0, closed: 0, skipped: 0 };
  let cfg; try { cfg = JSON.parse(src.config || "{}"); } catch { cfg = {}; }
  const adapter = ADAPTERS[src.kind];
  if (!adapter) { run.error = `unknown kind ${src.kind}`; return finish(db, src, run); }
  let items;
  try { items = await adapter(cfg, src.search_text || "security", fetcher, parseTerms(src.location_terms)); } catch (e) { run.error = String(e && e.message || e).slice(0, 200); return finish(db, src, run); }
  const terms = parseTerms(src.location_terms);
  const seen = new Set();
  for (const it of items) {
    run.fetched++;
    const url = cleanJobUrl(it.url);
    if (!url || !inCity(it.location, terms)) { run.skipped++; continue; }
    seen.add(String(it.key));
    const existing = await db.prepare("SELECT id, status FROM jobs WHERE (source_id=? AND source_key=?) OR url=? LIMIT 1").bind(src.id, String(it.key), url).first();
    if (existing) {
      if (["published", "pending_review"].includes(existing.status)) await db.prepare("UPDATE jobs SET salary_text=COALESCE(?, salary_text), posted_at=COALESCE(posted_at, ?), last_checked_at=datetime('now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(it.salary_text, it.posted_at, existing.id).run();
      continue;
    }
    await db.prepare(`INSERT INTO jobs (city, organization_id, employer_name, title, url, location, remote, seniority, topics, salary_text, posted_at, status, hold, auto_publish_at, source, source_id, source_key, reviewer_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending_review',0,?,'sweep',?,?,?)`)
      .bind(src.city, src.organization_id, src.employer_name, String(it.title).slice(0, 140), url, String(it.location || "").slice(0, 120) || null, it.remote, inferSeniority(it.title), JSON.stringify(inferTopics(it.title)), it.salary_text, it.posted_at,
        autoPublishAt(24, now), src.id, String(it.key), `From the ${SOURCE_KINDS[src.kind]} board on ${now.toISOString().slice(0, 10)}. Publishes in 24 hours unless held.`).run();
    run.added++;
  }
  // Anything from this board that is live with us but no longer on the board has closed. Workday lists are fuzzy
  // and may be partial, so each missing Workday role is checked one by one before it is closed.
  if (!run.error && run.fetched) {
    const { results } = await db.prepare("SELECT id, source_key, url FROM jobs WHERE source_id=? AND status IN ('published','pending_review')").bind(src.id).all();
    for (const r of results) {
      if (seen.has(String(r.source_key))) continue;
      if (src.kind === "workday" && (await workdayStillOpen(cfg, r.url, fetcher))) { await db.prepare("UPDATE jobs SET last_checked_at=datetime('now') WHERE id=?").bind(r.id).run(); continue; }
      await db.prepare("UPDATE jobs SET status='closed', closed_reason='No longer on the employer board on ' || date('now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(r.id).run();
      run.closed++;
    }
  }
  return finish(db, src, run);
}
async function finish(db, src, run) {
  const status = run.error ? `error: ${run.error}` : `${run.fetched} matched, ${run.added} added, ${run.closed} closed`;
  await db.prepare("UPDATE job_sources SET last_run_at=datetime('now'), last_status=?, last_added=? WHERE id=?").bind(status.slice(0, 200), run.added, src.id).run();
  return run;
}

// One board per call by default: a Worker invocation can only make a few dozen outbound requests, so the hourly cron
// takes the board that has waited longest (never run first, then anything older than six days). Hundreds of boards
// across many cities spread themselves over the week this way.
export async function runAllJobSources(db, { onlyId = null, fetcher = getJson, max = 1, dueOnly = true } = {}) {
  const sql = onlyId ? "SELECT * FROM job_sources WHERE id=?"
    : dueOnly ? "SELECT * FROM job_sources WHERE active=1 AND (last_run_at IS NULL OR last_run_at < datetime('now', '-6 days')) ORDER BY last_run_at IS NOT NULL, last_run_at, id LIMIT ?"
    : "SELECT * FROM job_sources WHERE active=1 ORDER BY last_run_at IS NOT NULL, last_run_at, id LIMIT ?";
  const { results } = await db.prepare(sql).bind(...(onlyId ? [onlyId] : [max])).all();
  const out = [];
  for (const src of results) out.push(await runJobSource(db, src, { fetcher }));
  return out;
}

// Create an employer organization if the source names one we do not have yet.
export async function ensureEmployerOrg(db, name) {
  const slug = slugify(name);
  const o = await db.prepare("SELECT id FROM organizations WHERE slug=? OR lower(name)=lower(?) LIMIT 1").bind(slug, name).first();
  if (o) return o.id;
  const r = await db.prepare("INSERT INTO organizations (slug, name, type, notes) VALUES (?,?,?,?)").bind(slug, name, "employer", "Created for a jobs board source").run();
  return r.meta.last_row_id;
}
