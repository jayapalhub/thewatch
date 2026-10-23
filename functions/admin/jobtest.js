import { json } from "../_lib/html.js";
import { ADAPTERS, getJson, inCity, parseTerms } from "../_lib/job-sources.js";

// Board diagnostic. POST JSON { ids: [job_sources.id, ...] } (up to 8). Each board is run through its adapter with a
// counting fetcher and nothing is written. For each it reports:
//   raw: postings the employer's site returned before our filters (largest list in each response, summed over pages),
//   total: the site's own total count when it reports one,
//   matched: postings whose titles pass the security filter, in_city: matched postings that also match location_terms.
// raw 0 means the board is broken or misconfigured; raw > 0 and matched 0 means no security roles open right now;
// matched > 0 and in_city 0 means the location terms are missing them.
function largestArray(v, depth = 0) {
  if (Array.isArray(v)) return v.length;
  if (!v || typeof v !== "object" || depth > 2) return 0;
  let best = 0; for (const k of Object.keys(v)) best = Math.max(best, largestArray(v[k], depth + 1)); return best;
}
function reportedTotal(v) {
  if (!v || typeof v !== "object") return null;
  for (const k of ["total", "totalCount", "totalHits", "count", "totalJobs", "jobCount"]) if (typeof v[k] === "number") return v[k];
  for (const k of ["data", "meta", "refineSearch", "eagerLoadRefineSearch"]) if (v[k] && typeof v[k] === "object") { const t = reportedTotal(v[k]); if (t != null) return t; }
  return null;
}

export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, 8);
  if (!ids.length) return json({ ok: false, error: "no ids" }, 400);
  const { results: rows } = await env.DB.prepare(`SELECT * FROM job_sources WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const out = await Promise.all(rows.map(async (src) => {
    const r = { id: src.id, employer: src.employer_name, kind: src.kind, city: src.city, raw: 0, total: null, calls: 0, html_bytes: 0 };
    const counting = async (url, init = {}) => {
      r.calls++;
      const res = await getJson(url, init);
      if (typeof res === "string") r.html_bytes += res.length;
      else { r.raw += largestArray(res); const t = reportedTotal(res); if (t != null && r.total == null) r.total = t; }
      return res;
    };
    let cfg; try { cfg = JSON.parse(src.config || "{}"); } catch { cfg = {}; }
    const adapter = ADAPTERS[src.kind];
    if (!adapter) return { ...r, error: "unknown kind" };
    try {
      const terms = parseTerms(src.location_terms);
      const items = await adapter(cfg, src.search_text || "security", counting, terms);
      r.matched = items.length;
      r.in_city = items.filter((it) => inCity(it.location, terms)).length;
      r.sample = items.slice(0, 2).map((it) => `${String(it.title).slice(0, 50)} @ ${String(it.location || "").slice(0, 40)}`);
    } catch (e) { r.error = String(e && e.message || e).slice(0, 120); }
    return r;
  }));
  return json({ ok: true, results: out });
}
