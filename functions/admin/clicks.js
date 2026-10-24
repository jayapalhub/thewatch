import { html, page, raw } from "../_lib/html.js";
import { adminShell } from "../_lib/admin.js";
import { CITIES } from "../_lib/constants.js";
import { todayKey, addDays } from "../_lib/dates.js";

// Admin > Clicks: the outbound clicks that count, for the last 7 and 30 days. A click counts when it is not a bot
// (link scanners, preview fetchers, prefetches, HEAD requests, a hit within two seconds of the send, a client that
// also opened the trap link) and not a repeat on the same listing by the same person on the same day. The filtered
// requests are shown too, so the counts can be audited. Rows from before migration 0029 have no listing or city and
// appear under "before tracking".
const TYPE = { register: "event", page: "event", job: "job", sponsor: "sponsor", trap: "trap" };
const typeOf = (t) => TYPE[t] || t || "other";
const HUMAN = "is_bot=0 AND is_dup=0";

async function window(db, days) {
  const since = addDays(todayKey(), -days);
  const all = async (sql, ...args) => { try { return (await db.prepare(sql).bind(...args).all()).results || []; } catch { return []; } };
  const [byCityType, top, bots, dups, totals] = await Promise.all([
    all(`SELECT COALESCE(city, '') city, target, COUNT(*) n FROM link_clicks WHERE clicked_at >= ? AND ${HUMAN} GROUP BY COALESCE(city, ''), target`, since),
    all(`SELECT c.listing, c.city, c.target, c.target_url, COUNT(*) n,
          COALESCE((SELECT title FROM events WHERE id=c.event_id), (SELECT title || ' at ' || COALESCE(employer_name, '') FROM jobs WHERE id=c.job_id), (SELECT name FROM sponsors WHERE id=c.sponsor_id), (SELECT 'Issue sponsor ' || COALESCE(sponsor_name, '') FROM issues WHERE id=c.issue_id AND c.target='sponsor'), c.target_url) label
        FROM link_clicks c WHERE c.clicked_at >= ? AND ${HUMAN} AND c.listing IS NOT NULL GROUP BY c.listing ORDER BY n DESC, c.listing LIMIT 25`, since),
    all("SELECT COALESCE(bot_reason, 'other') reason, COUNT(*) n FROM link_clicks WHERE clicked_at >= ? AND is_bot=1 GROUP BY COALESCE(bot_reason, 'other') ORDER BY n DESC", since),
    all("SELECT COUNT(*) n FROM link_clicks WHERE clicked_at >= ? AND is_bot=0 AND is_dup=1", since),
    all(`SELECT COUNT(*) n FROM link_clicks WHERE clicked_at >= ? AND ${HUMAN}`, since),
  ]);
  // city -> type -> count, with the types that appear across the window
  const cities = new Map();
  for (const r of byCityType) {
    const c = r.city || "(before tracking)"; const t = typeOf(r.target);
    if (!cities.has(c)) cities.set(c, { event: 0, job: 0, sponsor: 0, other: 0, total: 0 });
    const row = cities.get(c); row[t in row ? t : "other"] += r.n; row.total += r.n;
  }
  return { days, since, cities: [...cities].sort((a, b) => b[1].total - a[1].total), top, bots, dups: (dups[0] || {}).n || 0, total: (totals[0] || {}).n || 0 };
}

function section(w) {
  const cityName = (slug) => (CITIES[slug] || {}).name || (slug === "remote" ? "Remote board" : slug === "virtual" ? "Virtual" : slug);
  const botTotal = w.bots.reduce((a, b) => a + b.n, 0);
  return html`<h2>Last ${w.days} days <small class="a-muted">since ${w.since}</small></h2>
  <div class="a-cards">
    <div class="a-card"><span class="a-num">${w.total}</span>clicks by people</div>
    <div class="a-card"><span class="a-num">${botTotal}</span>requests filtered as bots</div>
    <div class="a-card"><span class="a-num">${w.dups}</span>repeat clicks folded in</div>
  </div>
  <h3>By city and type</h3>
  ${w.cities.length ? html`<table class="a-table"><thead><tr><th>City</th><th>Events</th><th>Jobs</th><th>Sponsors</th><th>Other</th><th>Total</th></tr></thead><tbody>
    ${w.cities.map(([c, r]) => html`<tr><td>${cityName(c)}</td><td>${r.event}</td><td>${r.job}</td><td>${r.sponsor}</td><td>${r.other}</td><td><strong>${r.total}</strong></td></tr>`)}
  </tbody></table>` : html`<p class="a-muted">No clicks by people in this window.</p>`}
  <h3>Top 25 listings</h3>
  ${w.top.length ? html`<table class="a-table"><thead><tr><th>Listing</th><th>Type</th><th>City</th><th>Clicks</th></tr></thead><tbody>
    ${w.top.map((r) => html`<tr><td><strong>${r.label || r.listing}</strong><br><small class="a-muted">${r.listing}${r.target_url ? html` · <a href="${r.target_url}" target="_blank" rel="noopener">${String(r.target_url).replace(/^https?:\/\//, "").slice(0, 60)}</a>` : ""}</small></td><td>${typeOf(r.target)}</td><td>${cityName(r.city || "")}</td><td>${r.n}</td></tr>`)}
  </tbody></table>` : html`<p class="a-muted">Nothing yet. Listings appear here once clicks arrive after migration 0029.</p>`}
  <h3>Filtered as bots</h3>
  ${w.bots.length ? html`<table class="a-table"><thead><tr><th>Reason</th><th>Requests</th></tr></thead><tbody>
    ${w.bots.map((b) => html`<tr><td>${{ head: "HEAD request", prefetch: "Prefetch or preview header", agent: "Scanner or bot user agent", fresh: "Within two seconds of the send", trap: "Opened the hidden trap link" }[b.reason] || b.reason}</td><td>${b.n}</td></tr>`)}
  </tbody></table>` : html`<p class="a-muted">Nothing filtered in this window.</p>`}`;
}

export async function onRequestGet({ env, data }) {
  const [w7, w30] = await Promise.all([window(env.DB, 7), window(env.DB, 30)]);
  const body = html`<p class="a-muted">Outbound clicks through the site's own /go links: event registrations and pages, job applications and sponsor links. A click counts once per listing per person per day; link scanners, preview bots, prefetches and anything that opened the hidden trap link in the Sunday email are kept but not counted. Every request is still redirected normally. ${raw("&nbsp;")}</p>
  ${section(w7)}
  ${section(w30)}`;
  return page(adminShell({ title: "Clicks", body, path: "/admin/clicks", user: data.user }));
}
