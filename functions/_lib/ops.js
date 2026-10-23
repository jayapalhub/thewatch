// Operations helpers: usage metering, run records and rate limited alerts.
// Written after the 2026-10-23 outage, when the D1 free tier's daily read allowance ran out with no warning.
// 1. meterDB wraps the D1 binding so every statement's rows_read and rows_written are counted per request, and the
//    totals are flushed to usage_daily about once a minute per worker instance (one small write, not one per request).
// 2. recordRun keeps the last time each scheduled job ran, so /api/health can say whether the hourly tick is alive.
// 3. alertOnce emails Jerome at most once per key per window, using the edge cache as the rate limiter, so a bad hour
//    produces one email rather than hundreds.
import { notifyJerome, emailShell } from "./integrations.js";

const FLUSH_MS = 60000;
let acc = { reads: 0, writes: 0, requests: 0, errors: 0 };
let lastFlush = 0;

function count(res) {
  const m = res && res.meta;
  if (m) { acc.reads += Number(m.rows_read || 0); acc.writes += Number(m.rows_written || 0); }
  return res;
}
export function meterDB(db) {
  if (!db || db.__metered) return db;
  const wrapStmt = (st) => new Proxy(st, {
    get(t, k) {
      if (k === "__raw") return t;
      if (k === "bind") return (...a) => wrapStmt(t.bind(...a));
      if (k === "run" || k === "all") return async (...a) => count(await t[k](...a));
      if (k === "first") return async (...a) => { const r = await t.all(); count(r); const row = (r.results || [])[0]; return a.length && row ? row[a[0]] : (row === undefined ? null : row); };
      const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return new Proxy(db, {
    get(t, k) {
      if (k === "__metered") return true;
      if (k === "prepare") return (sql) => wrapStmt(t.prepare(sql));
      if (k === "batch") return async (stmts) => { const out = await t.batch(stmts.map((s) => s.__raw || s)); out.forEach(count); return out; };
      const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
    },
  });
}
// Per request accounting: call at the start and end of a request.
export function noteRequest(error = false) { acc.requests++; if (error) acc.errors++; }
export function snapshot() { return { ...acc }; }

export async function flushUsage(db, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastFlush < FLUSH_MS) return false;
  if (!acc.reads && !acc.writes && !acc.requests) return false;
  const a = acc; acc = { reads: 0, writes: 0, requests: 0, errors: 0 }; lastFlush = now;
  try {
    await db.prepare(`INSERT INTO usage_daily (day, reads, writes, requests, errors) VALUES (date('now'), ?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET reads=reads+excluded.reads, writes=writes+excluded.writes, requests=requests+excluded.requests, errors=errors+excluded.errors`).bind(a.reads, a.writes, a.requests, a.errors).run();
    return true;
  } catch { acc.reads += a.reads; acc.writes += a.writes; acc.requests += a.requests; acc.errors += a.errors; return false; }
}

export async function recordRun(db, name, ok, detail = "") {
  try { await db.prepare("INSERT INTO ops_runs (name, last_at, last_ok, detail) VALUES (?, datetime('now'), ?, ?) ON CONFLICT(name) DO UPDATE SET last_at=excluded.last_at, last_ok=excluded.last_ok, detail=excluded.detail").bind(name, ok ? 1 : 0, String(detail).slice(0, 500)).run(); } catch { /* best effort */ }
}

// One alert per key per window. The marker lives in the edge cache (per colo), which is enough to stop a storm.
export async function alertOnce(env, key, subject, inner, { windowSeconds = 3600 } = {}) {
  try {
    if (typeof caches === "undefined") return false;
    const marker = new Request(`https://alerts.internal/${encodeURIComponent(key)}`);
    if (await caches.default.match(marker)) return false;
    await caches.default.put(marker, new Response("1", { headers: { "Cache-Control": `public, max-age=${windowSeconds}` } }));
  } catch { /* fall through and send */ }
  const html = emailShell(subject, inner + `<p style="margin:14px 0 0;color:#5B6B82;font-size:13px;">Sent at most once an hour per condition. Health: <a href="${env.SITE_URL || "https://bettersecurity.ai"}/api/health">/api/health</a>.</p>`);
  await notifyJerome(env, `[The Watch] ${subject}`, html);
  return true;
}

// Daily read budget: well under the paid plan's included 25 billion a month, but ten times the old free limit, so a
// runaway crawler or a bulk load is noticed the same day instead of on the invoice.
export const DAILY_READ_BUDGET = 50_000_000;
export async function checkBudget(env, db) {
  try {
    const row = await db.prepare("SELECT reads, writes, requests, errors FROM usage_daily WHERE day=date('now')").first();
    if (!row) return { reads: 0 };
    if (row.reads > DAILY_READ_BUDGET) await alertOnce(env, "d1-budget-" + new Date().toISOString().slice(0, 10), "Database reads are past today's budget",
      `<p>The site has read ${Number(row.reads).toLocaleString()} rows today against a budget of ${DAILY_READ_BUDGET.toLocaleString()}. Writes ${Number(row.writes).toLocaleString()}, requests ${Number(row.requests).toLocaleString()}, errors ${Number(row.errors).toLocaleString()}.</p><p>Likely causes are a bulk seed, a crawler walking filtered pages, or a new unindexed query. See doc 169 for the runbook.</p>`, { windowSeconds: 86400 });
    return row;
  } catch { return { reads: null }; }
}
