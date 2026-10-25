// Named role coverage: how close each board is to having enough roles named by someone at the employer to consider
// showing only those. The working threshold is 15 named roles live at the same time, held for several weeks. Everything
// here reads with a few grouped queries, never one per city, and the daily snapshot is written once a day.
import { html } from "./html.js";
import { CITIES, jobBoardOf } from "./constants.js";
import { addDays, todayKey } from "./dates.js";
import { jobPath, untilMigrated } from "./jobs.js";

export const READY_AT = 15, GROWING_AT = 5;
export const HISTORY_DAYS = 28;
export const SMALL_EMPLOYER = 10; // the queue skips employers with this many live roles or more
export const LIVE = "j.status = 'published' AND (j.expires_at IS NULL OR j.expires_at >= date('now'))";
const NAMED = "(j.posted_by_name IS NOT NULL AND j.posted_by_name != '')";

export function coverageStatus(named) { return named >= READY_AT ? "Ready to consider" : named >= GROWING_AT ? "Growing" : "Early"; }
export const boardName = (slug) => (jobBoardOf(slug) ? (slug === "remote" ? "Remote board" : jobBoardOf(slug).name) : slug);

// One grouped query: per board, live roles, named live roles and named roles that went live in the last seven days.
// recent: named roles whose person was attached in the last seven days (posted_by_attached_at, migration 0031), so a
// person put on an older role counts. Before the migration it falls back to named roles that went live in the week.
export const RECENT_SQL = `SUM(CASE WHEN ${NAMED} AND substr(j.posted_by_attached_at, 1, 10) >= ? THEN 1 ELSE 0 END) recent`;
const RECENT_FALLBACK_SQL = `SUM(CASE WHEN ${NAMED} AND COALESCE(substr(j.published_at, 1, 10), j.posted_at, substr(j.created_at, 1, 10)) >= ? THEN 1 ELSE 0 END) recent`;
export async function coverageRows(db) {
  const since = addDays(todayKey(), -7);
  const query = (recent) => db.prepare(`SELECT j.city, COUNT(*) total, SUM(CASE WHEN ${NAMED} THEN 1 ELSE 0 END) named, ${recent}
    FROM jobs j WHERE ${LIVE} GROUP BY j.city`).bind(since).all();
  const { results } = await untilMigrated(() => query(RECENT_SQL), () => query(RECENT_FALLBACK_SQL));
  const rows = (results || []).map((r) => ({ city: r.city, total: r.total || 0, named: r.named || 0, recent: r.recent || 0 }));
  // Boards with nothing live still appear, at zero, so a new city is visible from day one.
  for (const slug of [...Object.keys(CITIES), "remote"]) if (!rows.some((r) => r.city === slug)) rows.push({ city: slug, total: 0, named: 0, recent: 0 });
  for (const r of rows) { r.percent = r.total ? Math.round((100 * r.named) / r.total) : 0; r.status = coverageStatus(r.named); }
  rows.sort((a, b) => b.named - a.named || b.total - a.total || a.city.localeCompare(b.city));
  return rows;
}
export function coverageTotal(rows) {
  const t = rows.reduce((a, r) => ({ total: a.total + r.total, named: a.named + r.named, recent: a.recent + r.recent }), { total: 0, named: 0, recent: 0 });
  return { city: "total", ...t, percent: t.total ? Math.round((100 * t.named) / t.total) : 0 };
}

// The daily snapshot, from the hourly run. One existence check, then one insert per board (INSERT OR IGNORE, so two
// runs in the same minute cannot double write). Returns { skipped: true } when today is already recorded.
export async function snapshotCoverage(db, { today = todayKey("UTC") } = {}) {
  const done = await db.prepare("SELECT 1 x FROM job_coverage_daily WHERE day=? LIMIT 1").bind(today).first();
  if (done) return { skipped: true, day: today };
  const rows = await coverageRows(db);
  await db.batch(rows.map((r) => db.prepare("INSERT OR IGNORE INTO job_coverage_daily (day, city, total, named) VALUES (?,?,?,?)").bind(today, r.city, r.total, r.named)));
  return { day: today, written: rows.length };
}

// The last 28 days per board, oldest first, as { city: [{ day, total, named } ...] }. One query.
export async function coverageHistory(db, { days = HISTORY_DAYS, today = todayKey("UTC") } = {}) {
  const { results } = await db.prepare("SELECT day, city, total, named FROM job_coverage_daily WHERE day >= ? ORDER BY day, city").bind(addDays(today, -(days - 1))).all().catch(() => ({ results: [] }));
  const out = {};
  for (const r of results || []) (out[r.city] ||= []).push({ day: r.day, total: r.total, named: r.named });
  return out;
}

// Needs a person: the newest live roles with nobody named, from employers with fewer than ten live roles on the board.
// Two queries: live roles per employer, then the newest unnamed roles; the employer size filter is applied in code.
const employerKey = (j) => (j.organization_id ? `o:${j.organization_id}` : `n:${String(j.employer_name || "").trim().toLowerCase()}`);
export async function needsPerson(db, { limit = 50, scan = 300, today = todayKey() } = {}) {
  const [{ results: sizes }, { results: roles }] = await Promise.all([
    db.prepare(`SELECT j.organization_id, j.employer_name, COUNT(*) n FROM jobs j WHERE ${LIVE} GROUP BY j.organization_id, lower(j.employer_name)`).all(),
    db.prepare(`SELECT j.id, j.city, j.title, j.organization_id, j.employer_name, o.name org_name, j.url, j.published_at, j.posted_at, j.created_at
      FROM jobs j LEFT JOIN organizations o ON o.id = j.organization_id WHERE ${LIVE} AND NOT ${NAMED}
      ORDER BY COALESCE(j.published_at, j.created_at) DESC, j.id DESC LIMIT ?`).bind(scan).all(),
  ]);
  const count = new Map(); for (const s of sizes || []) count.set(employerKey(s), (count.get(employerKey(s)) || 0) + (s.n || 0));
  const out = [];
  for (const j of roles || []) {
    if ((count.get(employerKey(j)) || 0) >= SMALL_EMPLOYER) continue;
    const live = String(j.published_at || j.created_at || "").slice(0, 10);
    const days = live ? Math.max(0, Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(live + "T00:00:00Z")) / 86400000)) : null;
    const employer = j.org_name || j.employer_name || "";
    out.push({ id: j.id, city: j.city, city_name: boardName(j.city), employer, title: j.title, live_since: live || null, live_days: days, page: jobPath({ ...j, employer }), posting_url: j.url, employer_live_roles: count.get(employerKey(j)) || 0 });
    if (out.length >= limit) break;
  }
  return out;
}

// A row of the last 28 days as small inline bars, scaled to the board's highest named count. Plain markup, no library.
export function sparkline(points, key = "named") {
  if (!points || !points.length) return html`<span class="a-muted">no snapshots yet</span>`;
  const max = Math.max(1, ...points.map((p) => p[key] || 0));
  return html`<span class="a-spark" aria-label="${points.map((p) => `${p.day}: ${p[key]}`).join(", ")}">${points.map((p) => html`<i style="height:${Math.max(2, Math.round((18 * (p[key] || 0)) / max))}px" title="${p.day}: ${p[key]} named of ${p.total}"></i>`)}</span> <span class="a-muted">${points.map((p) => p[key]).join(" ")}</span>`;
}
