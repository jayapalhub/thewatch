import { json } from "../_lib/html.js";
import { getJson } from "../_lib/job-sources.js";

// Workday host finder. POST JSON { boards: [{ tenant, site }] } (up to 6). Tenants move between Workday data centers
// (wd1 to wd108 and beyond) and a search sent to the old host answers HTTP 422, so each board is tried on every known
// host and the ones that answer with postings are returned. Reads only; nothing is written.
const HOSTS = ["wd1", "wd3", "wd5", "wd10", "wd12", "wd101", "wd102", "wd103", "wd105", "wd108", "wd115", "wd501", "wd503", "wd504"];
const MAX = 6;

export async function onRequestPost({ request }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const boards = (Array.isArray(body.boards) ? body.boards : []).filter((b) => b && /^[a-z0-9_-]+$/i.test(b.tenant || "") && /^[a-z0-9_-]+$/i.test(b.site || "")).slice(0, MAX);
  const results = await Promise.all(boards.map(async (b) => {
    const tries = await Promise.all(HOSTS.map(async (host) => {
      const base = `https://${b.tenant}.${host}.myworkdayjobs.com`;
      try {
        const j = await getJson(`${base}/wday/cxs/${b.tenant}/${b.site}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": "en-US,en;q=0.9", Origin: base, Referer: `${base}/${b.site}` }, body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }), signal: AbortSignal.timeout(8000) });
        return { host, total: j && j.total };
      } catch (e) { return { host, error: String(e && e.message || e).slice(0, 40) }; }
    }));
    return { tenant: b.tenant, site: b.site, found: tries.filter((t) => t.total != null).map((t) => `${t.host}:${t.total}`), other: tries.filter((t) => t.total == null && !/HTTP 422|HTTP 404|fetch failed|ENOTFOUND|DNS|530/.test(t.error || "")).map((t) => `${t.host}:${t.error}`) };
  }));
  return json({ ok: true, results });
}
