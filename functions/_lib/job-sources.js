// Weekly jobs sweep: reads employer job boards (Workday, Greenhouse, Lever, Ashby) and files security, GRC, privacy
// and audit roles for the right city as pending_review with a 24 hour auto publish, the same publish by default rule
// as events. Jerome can hold or reject a role in that window; if he does nothing it goes live. Roles that drop off a
// board are closed on the next run. Every row links to the employer's own posting. See project doc 135.
import { autoPublishAt } from "./autopublish.js";
import { cleanJobUrl, JOB_DAYS } from "./jobs.js";
import { slugify } from "./html.js";

// What counts as one of our roles. Title must match SECURITY_RE and must not match NOT_OURS_RE.
const SECURITY_RE = /\b(security|cyber|cybersecurity|cyber-security|infosec|information assurance|GRC|governance,? risk|privacy|IT audit|technology audit|IS audit|third[- ]party risk|vendor risk|TPRM|compliance (?:analyst|manager|engineer|program)|ISSO|ISSM|ISSE|SOC analyst|threat|incident response|intrusion detection|detection engineering|identity and access|IAM|penetration|red team|application security|appsec|DevSecOps|vulnerability|CISO|risk (?:analyst|manager) \(?(?:IT|technology|cyber)|cryptograph)\b/i;
const NOT_OURS_RE = /\b(guard|officer, security|(?<!information )(?<!systems )security officer|physical security|corporate security|regional security|global security|event security|workplace security|workplace (?:&|and) security|real estate|safety (?:&|and) security|personal security|K9|employee relations|political law|hackathon|solution consultant|success architect|customer engineering|escalations? engineer|set watch|security guard|patrol|hris|payroll|security trailers?|perimeter (?:&|and) intrusion|access control products?|crisis|executive protection|protective|loss prevention|sales|account executive|account manager|account director|customer success|customer advocacy|business development|marketing|communications|public relations|public affairs|go[- ]to[- ]market|GTM|partnerships?|partner manager|evangelist|developer advocate|community manager|technical writer|content (?:writer|strategist|lead|marketer)|copywriter|demand generation|revenue|field CTO|recruiter|intern(?:ship)?|co-op|facilities|janitor|custod|driver|nurse|clinical|social security|food|cashier|securities|security clearance only)\b/i;

export const SOURCE_KINDS = { workday: "Workday", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", eightfold: "Eightfold", smartrecruiters: "SmartRecruiters", radancy: "Radancy", phenom: "Phenom", icims: "iCIMS", successfactors: "SuccessFactors" };

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
  if (/director|head of/.test(t)) return "director";
  if (/manager|lead\b|supervisor|biso/.test(t)) return "manager"; // principal, staff and senior are IC grades: practitioner
  if (/\b(i|1|associate|junior|entry|analyst i)\b$|\bi\b$|intern|new grad|graduate engineer|early career/.test(t)) return "early_career";
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
  const { text, ...rest } = init;
  const r = await fetch(url, { ...rest, headers: { "User-Agent": "TheWatchJobsBot/1.0 (+https://bettersecurity.ai/about)", Accept: text ? "text/html,application/json" : "application/json", ...(init.headers || {}) }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return text ? r.text() : r.json(); // init.text: the caller wants the body as a string (HTML career pages)
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c" };
function decodeEntities(t) { return String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m)); }

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
  if (!j || !Array.isArray(j.jobs)) throw new Error("unexpected response from Greenhouse");
  return (j.jobs || []).filter((x) => isOurRole(x.title)).map((x) => {
    const loc = (x.location && x.location.name) || (x.offices || []).map((o) => o.name).join("; ");
    return { key: String(x.id), title: x.title, url: x.absolute_url, location: loc, posted_at: (x.updated_at || "").slice(0, 10) || null, salary_text: payText(x.content), remote: inferRemote(loc) };
  });
}
export async function pullLever(cfg, _search, fetcher = getJson) {
  const j = await fetcher(`https://api.lever.co/v0/postings/${cfg.company}?mode=json`);
  if (!Array.isArray(j)) throw new Error("unexpected response from Lever");
  return j.filter((x) => isOurRole(x.text)).map((x) => {
    const c = x.categories || {}; const loc = Array.from(new Set([c.location, ...(c.allLocations || [])].filter(Boolean))).join("; ");
    const wp = (x.workplaceType || "").toLowerCase();
    const title = String(x.text || "").replace(/\s*\((?:R|REQ|JR)?[-\s]?\d{3,}\)\s*$/i, "").trim(); // "(R5824)" requisition codes
    return { key: x.id, title, url: x.hostedUrl, location: loc, posted_at: x.createdAt ? new Date(x.createdAt).toISOString().slice(0, 10) : null, salary_text: payText(x.descriptionPlain || x.description), remote: wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : inferRemote(loc) };
  });
}
export async function pullAshby(cfg, _search, fetcher = getJson) {
  const j = await fetcher(`https://api.ashbyhq.com/posting-api/job-board/${cfg.board}?includeCompensation=true`);
  if (!j || !Array.isArray(j.jobs)) throw new Error("unexpected response from Ashby");
  return (j.jobs || []).filter((x) => isOurRole(x.title)).map((x) => {
    const loc = [x.location, ...(x.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join("; ");
    const comp = x.compensation && x.compensation.compensationTierSummary;
    return { key: x.id, title: x.title, url: x.jobUrl, location: loc, posted_at: (x.publishedAt || "").slice(0, 10) || null, salary_text: comp && /\$/.test(comp) ? comp : payText(x.descriptionHtml), remote: x.isRemote ? (loc && !/remote/i.test(loc) ? "hybrid" : "remote") : inferRemote(loc) };
  });
}
// Eightfold career sites (careers.qualcomm.com and many others): config { host, company } where company is the
// "domain" the site passes to its own API. Paged ten at a time; the site's location filter does the geography.
export async function pullEightfold(cfg, searchText, fetcher = getJson, terms = []) {
  const out = []; const loc = terms[0] || "";
  for (let start = 0; start < 60; start += 10) {
    const q = new URLSearchParams({ domain: cfg.company, query: searchText || "security", location: loc, start: String(start), num: "10", sort_by: "relevance", filter_distance: "50" });
    const j = await fetcher(`https://${cfg.host}/api/pcsx/search?${q}`, { headers: { Referer: `https://${cfg.host}/careers` } });
    if (!j || !j.data || !Array.isArray(j.data.positions)) throw new Error("unexpected response from Eightfold");
    const ps = j.data.positions;
    out.push(...ps);
    if (!ps.length || out.length >= ((j.data && j.data.count) || 0)) break;
  }
  return out.filter((p) => isOurRole(p.name)).map((p) => {
    const locs = Array.isArray(p.locations) ? p.locations.join("; ") : String(p.location || "");
    return { key: String(p.id), title: p.name, url: `https://${cfg.host}${p.positionUrl || "/careers/job/" + p.id}`, location: locs, posted_at: p.postedTs ? new Date(p.postedTs * 1000).toISOString().slice(0, 10) : null, salary_text: null, remote: p.workLocationOption === "remote" ? "remote" : p.workLocationOption === "hybrid" ? "hybrid" : inferRemote(locs) };
  });
}
// SmartRecruiters public postings API: config { company } (the identifier in careers.smartrecruiters.com/<company>).
export async function pullSmartRecruiters(cfg, searchText, fetcher = getJson) {
  const q = new URLSearchParams({ q: searchText || "security", limit: "100" });
  const j = await fetcher(`https://api.smartrecruiters.com/v1/companies/${cfg.company}/postings?${q}`);
  if (!j || !Array.isArray(j.content)) throw new Error("unexpected response from SmartRecruiters");
  return j.content.filter((x) => isOurRole(x.name)).map((x) => {
    const l = x.location || {}; const loc = [l.city, l.region, l.country].filter(Boolean).join(", ");
    return { key: String(x.id), title: x.name, url: `https://jobs.smartrecruiters.com/${cfg.company}/${x.id}`, location: loc, posted_at: (x.releasedDate || "").slice(0, 10) || null, salary_text: null, remote: l.remote ? "remote" : inferRemote(loc) };
  });
}
// Radancy career sites (jobs.intuit.com, jobs.paloaltonetworks.com and many others): config { host }. The site's own
// search endpoint answers JSON whose "results" field is the HTML list; titles, locations and links are read from it.
// Its location filter is loose, so every result comes back and location_terms do the geography.
export async function pullRadancy(cfg, searchText, fetcher = getJson) {
  const out = []; const seen = new Set();
  const clean = (h) => decodeEntities(String(h || "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  for (let page = 1; page <= 5; page++) {
    const q = new URLSearchParams({ ActiveFacetID: "0", CurrentPage: String(page), RecordsPerPage: "100", Distance: "50", RadiusUnitType: "0", Keywords: searchText || "security", Location: "", ShowRadius: "False", IsPagination: page > 1 ? "True" : "False", SearchResultsModuleName: "Search Results", SearchFiltersModuleName: "Search Filters", SortCriteria: "0", SortDirection: "0", SearchType: "5", ResultsType: "0" });
    const j = await fetcher(`https://${cfg.host}/search-jobs/results?${q}`, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: `https://${cfg.host}/search-jobs` } });
    if (!j || typeof j.results !== "string") throw new Error("unexpected response from Radancy");
    const html = j.results;
    let added = 0;
    const re = /<a\b([^>]*?)href="([^"]*\/job\/[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(html))) {
      const attrs = m[1] + m[3], inner = m[4];
      const id = (/data-job-id="([^"]+)"/.exec(attrs) || [])[1] || m[2].split("?")[0].split("/").pop();
      if (seen.has(id)) continue; seen.add(id); added++;
      const title = clean((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(inner) || [])[1]);
      const loc = clean((/class="job-location"[^>]*>([\s\S]*?)<\/span>/i.exec(inner) || [])[1]);
      if (!title || !isOurRole(title)) continue;
      out.push({ key: String(id), title, url: `https://${cfg.host}${m[2].split("?")[0]}`, location: loc, posted_at: null, salary_text: null, remote: inferRemote(loc) });
    }
    if (!added) break; // no new rows on this page: the list is exhausted
  }
  return out;
}
// Phenom career sites (careers.pacificlife.com, careers.firstam.com, jobs.danaher.com and many others): config { host, path, state }
// where path is the locale prefix in the site's URLs ("us/en", "global/en") and state, optional, narrows the search with
// the site's own facet ("California"), which matters on boards with thousands of roles. Keyword search is fuzzy, so
// titles are filtered here and location_terms do the geography.
export async function pullPhenom(cfg, searchText, fetcher = getJson) {
  const path = String(cfg.path || "us/en").replace(/^\/|\/$/g, "");
  const [country = "us", lang = "en"] = path.split("/");
  const out = []; const seen = new Set();
  for (let from = 0; from < 300; from += 50) {
    const body = { lang: `${lang}_${country}`, deviceType: "desktop", country, pageName: "search-results", ddoKey: "refineSearch", sortBy: "", subsearch: "", from, jobs: true, counts: true, all_fields: ["category", "country", "state", "city", "type"], size: 50, clearAll: false, jdsource: "facets", isSliderEnable: false, pageId: "page12", siteType: "external", keywords: searchText || "security", global: true, selected_fields: cfg.state ? { state: [cfg.state] } : {}, locationData: {} };
    const j = await fetcher(`https://${cfg.host}/widgets`, { method: "POST", headers: { "Content-Type": "application/json", Referer: `https://${cfg.host}/${path}/search-results` }, body: JSON.stringify(body) });
    if (!j || !j.refineSearch) throw new Error("unexpected response from Phenom");
    const rs = j.refineSearch; const jobs = (rs.data && rs.data.jobs) || [];
    for (const x of jobs) {
      const id = String(x.jobId || x.reqId || ""); if (!id || seen.has(id)) continue; seen.add(id);
      if (!isOurRole(x.title)) continue;
      const loc = Array.isArray(x.multi_location) && x.multi_location.length > 1 ? x.multi_location.join("; ") : (x.location || x.cityStateCountry || x.cityState || "");
      out.push({ key: id, title: x.title, url: `https://${cfg.host}/${path}/job/${id}`, location: loc, posted_at: /^\d{4}-\d{2}-\d{2}/.test(x.postedDate || "") ? x.postedDate.slice(0, 10) : null, salary_text: payText(x.descriptionTeaser), remote: String(x.checkRemote) === "true" ? (loc ? "hybrid" : "remote") : inferRemote(loc) });
    }
    if (jobs.length < 50 || from + 50 >= (rs.totalHits || 0)) break;
  }
  return out;
}
// iCIMS career portals of the newer kind (careers.rivian.com/careers-home, jobs.uci.edu/careers-home): config { host }.
// The portal's /api/jobs answers JSON, 100 a page, relevance sorted; the older careers-<name>.icims.com pages are HTML
// and are not read here.
export async function pullIcims(cfg, searchText, fetcher = getJson) {
  const out = []; const seen = new Set();
  for (let page = 1; page <= 2; page++) {
    const q = new URLSearchParams({ keywords: searchText || "security", page: String(page), limit: "100", sortBy: "relevance", descending: "false", internal: "false" });
    const j = await fetcher(`https://${cfg.host}/api/jobs?${q}`, { headers: { Referer: `https://${cfg.host}/careers-home/jobs` } });
    if (!j || !Array.isArray(j.jobs)) throw new Error("unexpected response from iCIMS");
    const jobs = j.jobs;
    for (const row of jobs) {
      const x = row.data || row; const id = String(x.req_id || x.slug || ""); if (!id || seen.has(id)) continue; seen.add(id);
      if (!isOurRole(x.title)) continue;
      const loc = x.full_location || x.short_location || [x.city, x.state].filter(Boolean).join(", ");
      const canonical = x.meta_data && x.meta_data.canonical_url ? String(x.meta_data.canonical_url).split("?")[0] : `https://${cfg.host}/jobs/${id}`;
      out.push({ key: id, title: x.title, url: canonical, location: loc, posted_at: /^\d{4}-\d{2}-\d{2}/.test(x.posted_date || "") ? x.posted_date.slice(0, 10) : null, salary_text: payText(x.description), remote: inferRemote(loc) });
    }
    if (jobs.length < 100) break;
  }
  return out;
}
// SAP SuccessFactors career sites, both kinds: the newer ones (careers.skyworksinc.com) answer a JSON POST at
// /services/recruiting/v1/jobs; the classic Career Site Builder ones (careers-americas.kia.com/kus) are HTML tables.
// Config { host, base } where base is the path prefix some sites carry ("kus"), usually empty. Dates come as
// MM/DD/YY on the new kind and "Sep 25, 2026" on the classic one.
const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function sfDate(s) {
  const t = String(s || "").trim(); let m;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t))) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if ((m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(t)) && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  return null;
}
export async function pullSuccessFactors(cfg, searchText, fetcher = getJson) {
  const base = `https://${cfg.host}${cfg.base ? "/" + String(cfg.base).replace(/^\/|\/$/g, "") : ""}`;
  const out = []; const seen = new Set();
  const push = (id, title, url, loc, posted) => { if (!id || seen.has(id)) return; seen.add(id); if (!isOurRole(title)) return; out.push({ key: String(id), title, url, location: loc, posted_at: posted, salary_text: null, remote: inferRemote(loc) }); };
  const body = (pageNumber) => JSON.stringify({ locale: "en_US", pageNumber, sortBy: "", keywords: searchText || "security", location: "", facetFilters: {}, brand: "", skills: [], categoryId: 0, alertId: "", rcmCandidateId: "" });
  // Newer sites: JSON. A classic site answers this with an HTML page (or 404), which is the cue to fall back.
  let json = null;
  try { json = await fetcher(`${base}/services/recruiting/v1/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(0) }); }
  catch (e) { if (!/HTTP 40[45]|JSON|Unexpected token/i.test(String(e && e.message))) throw e; json = null; } // a classic site answers 404 or HTML; anything else is a real error
  if (json && Array.isArray(json.jobSearchResult)) {
    let page = 0, got = json;
    while (got && Array.isArray(got.jobSearchResult) && got.jobSearchResult.length) {
      for (const row of got.jobSearchResult) {
        const x = row.response || row; const loc = (Array.isArray(x.jobLocationShort) ? x.jobLocationShort : [x.jobLocationShort]).filter(Boolean).map((l) => String(l).trim()).join("; ");
        push(x.id, x.unifiedStandardTitle || x.title, `${base}/job/${x.unifiedUrlTitle || x.urlTitle || "job"}/${x.id}-en_US`, loc, sfDate(x.unifiedStandardStart));
      }
      if (++page >= 10 || page * 10 >= (got.totalJobs || 0)) break;
      got = await fetcher(`${base}/services/recruiting/v1/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(page) });
    }
    return out;
  }
  // Classic Career Site Builder: HTML rows, 25 a page by startrow.
  for (let start = 0; start < 250; start += 25) {
    const html = await fetcher(`${base}/search/?q=${encodeURIComponent(searchText || "security")}&sortColumn=referencedate&sortDirection=desc&startrow=${start}`, { text: true });
    if (start === 0 && !/class="data-row"|jobTitle-link|searchResultsShell|No jobs found|no results/i.test(String(html))) throw new Error("unexpected page from SuccessFactors (no job table)");
    const rows = String(html).split(/<tr[^>]*class="data-row"/i).slice(1);
    for (const row of rows) {
      const a = /<a[^>]*href="([^"]+)"[^>]*class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/i.exec(row) || /<a[^>]*class="jobTitle-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
      if (!a) continue;
      const href = a[1]; const id = (href.match(/\/(\d+)\/?$/) || [])[1] || href;
      const title = decodeEntities(a[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      const loc = decodeEntities(((/<span class="jobLocation">\s*([\s\S]*?)<\/span>/i.exec(row) || [])[1] || "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      const date = ((/<span class="jobDate[^"]*">\s*([^<]+)<\/span>/i.exec(row) || [])[1] || "").trim();
      push(id, title, href.startsWith("http") ? href : `https://${cfg.host}${href}`, loc, sfDate(date));
    }
    if (rows.length < 25) break;
  }
  return out;
}
const ADAPTERS = { successfactors: pullSuccessFactors, workday: pullWorkday, greenhouse: pullGreenhouse, lever: pullLever, ashby: pullAshby, eightfold: pullEightfold, smartrecruiters: pullSmartRecruiters, radancy: pullRadancy, phenom: pullPhenom, icims: pullIcims };

// Run one source. Files new roles, refreshes pay and posted dates on known ones, closes the ones that left the board.
export async function runJobSource(db, src, { fetcher = getJson, now = new Date() } = {}) {
  const run = { source: src.employer_name, fetched: 0, added: 0, closed: 0, skipped: 0 };
  // Seeded boards may have no organization yet; every role should link to its employer's organization row.
  if (!src.organization_id) {
    try { src.organization_id = await ensureEmployerOrg(db, src.employer_name, src.city); await db.prepare("UPDATE job_sources SET organization_id=? WHERE id=?").bind(src.organization_id, src.id).run(); } catch {}
  }
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
    if (!existing) {
      // Some boards post the same requisition once per office. One live row per title and employer is enough.
      const twin = await db.prepare("SELECT id FROM jobs WHERE source_id=? AND lower(title)=lower(?) AND status IN ('published','pending_review') LIMIT 1").bind(src.id, String(it.title)).first();
      if (twin) { seen.add(String(it.key)); run.skipped++; continue; }
    }
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
  // and may be partial, so each missing Workday role is checked one by one before it is closed. A board that read
  // cleanly but matched nothing still counts: an employer's last security role closing is the common case, not an error.
  if (!run.error) {
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
const REQUEST_COST = { successfactors: 10, workday: 40, greenhouse: 2, lever: 2, ashby: 2, smartrecruiters: 2, eightfold: 8, radancy: 6, phenom: 7, icims: 3 };
export async function runAllJobSources(db, { onlyId = null, fetcher = getJson, max = 1, dueOnly = true, budget = 40 } = {}) {
  const sql = onlyId ? "SELECT * FROM job_sources WHERE id=?"
    : dueOnly ? "SELECT * FROM job_sources WHERE active=1 AND (last_run_at IS NULL OR last_run_at < datetime('now', '-6 days')) ORDER BY last_run_at IS NOT NULL, last_run_at, id LIMIT ?"
    : "SELECT * FROM job_sources WHERE active=1 ORDER BY last_run_at IS NOT NULL, last_run_at, id LIMIT ?";
  const { results } = await db.prepare(sql).bind(...(onlyId ? [onlyId] : [max])).all();
  const out = [];
  // Subrequest budget per invocation: a Workday board can take forty fetches, the API boards a handful, so an hour
  // that lands on cheap boards reads several of them instead of leaving the slot half used.
  let spent = 0;
  for (const src of results) {
    const cost = REQUEST_COST[src.kind] || 8;
    if (out.length && spent + cost > budget) break;
    out.push(await runJobSource(db, src, { fetcher }));
    spent += cost;
  }
  out.spent = spent; // so the tick can give what is left to cheaper work
  return out;
}

// Create an employer organization if the source names one we do not have yet.
export async function ensureEmployerOrg(db, name, city = "sandiego") {
  const slug = slugify(name);
  const o = await db.prepare("SELECT id FROM organizations WHERE slug=? OR lower(name)=lower(?) LIMIT 1").bind(slug, name).first();
  if (o) return o.id;
  const r = await db.prepare("INSERT INTO organizations (slug, name, type, default_city, notes) VALUES (?,?,?,?,?)").bind(slug, name, "employer", city, "Created for a jobs board source").run();
  return r.meta.last_row_id;
}
