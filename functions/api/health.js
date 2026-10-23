import { json } from "../_lib/html.js";
import { DAILY_READ_BUDGET } from "../_lib/ops.js";

// GET /api/health: a cheap, public, uncached status page for uptime monitors and for Jerome.
// 200 when the database answers and the hourly job has run in the last three hours; 503 otherwise.
// It reads a handful of rows at most, so a monitor polling every five minutes costs nothing noticeable.
export async function onRequestGet({ env }) {
  const out = { ok: true, time: new Date().toISOString(), checks: {} };
  const t0 = Date.now();
  try {
    const row = await env.DB.prepare("SELECT count(*) AS n FROM cities WHERE active=1").first();
    out.checks.database = { ok: true, cities: row ? row.n : 0, ms: Date.now() - t0 };
  } catch (e) {
    out.ok = false; out.checks.database = { ok: false, error: String(e && e.message || e).slice(0, 200) };
    return json(out, 503, { "Cache-Control": "no-store" });
  }
  try {
    const u = await env.DB.prepare("SELECT reads, writes, requests, errors FROM usage_daily WHERE day=date('now')").first();
    out.checks.usage_today = { reads: u ? u.reads : 0, writes: u ? u.writes : 0, requests: u ? u.requests : 0, errors: u ? u.errors : 0, read_budget: DAILY_READ_BUDGET, ok: !u || u.reads <= DAILY_READ_BUDGET };
    if (u && u.reads > DAILY_READ_BUDGET) out.ok = false;
  } catch { out.checks.usage_today = { ok: null, note: "usage table missing" }; }
  try {
    const { results } = await env.DB.prepare("SELECT name, last_at, last_ok, detail FROM ops_runs").all();
    out.checks.jobs = {};
    for (const r of results) {
      const ageMin = Math.round((Date.now() - Date.parse(r.last_at.replace(" ", "T") + "Z")) / 60000);
      const stale = r.name === "hourly" ? ageMin > 180 : false;
      out.checks.jobs[r.name] = { last_at: r.last_at, age_minutes: ageMin, ok: !!r.last_ok && !stale, detail: r.detail || undefined };
      if (stale || !r.last_ok) out.ok = false;
    }
    if (!out.checks.jobs.hourly) out.checks.jobs.hourly = { ok: null, note: "no run recorded yet" };
  } catch { out.checks.jobs = { ok: null, note: "ops_runs table missing" }; }
  return json(out, out.ok ? 200 : 503, { "Cache-Control": "no-store" });
}
