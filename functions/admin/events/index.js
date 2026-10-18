import { html, page, raw } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { fmtDateShort, fmtTimeRange, todayKey } from "../../_lib/dates.js";
import { EVENT_STATUSES } from "../../_lib/constants.js";

export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const status = EVENT_STATUSES.includes(u.searchParams.get("status")) ? u.searchParams.get("status") : "";
  const past = u.searchParams.get("past") === "1";
  const q = (u.searchParams.get("q") || "").slice(0, 80);
  const where = []; const args = [];
  if (status) { where.push("e.status=?"); args.push(status); }
  if (!past) { where.push("e.start_at >= ?"); args.push(todayKey()); }
  if (q) { where.push("(e.title LIKE ? OR o.name LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  const { results } = await env.DB.prepare(`SELECT e.id, e.slug, e.title, e.start_at, e.end_at, e.status, e.source, e.is_featured, e.is_better_security_event, o.name org_name FROM events e LEFT JOIN organizations o ON o.id=e.organization_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.start_at ${past ? "DESC" : "ASC"} LIMIT 500`).bind(...args).all();
  const body = html`${flash(u.searchParams.get("msg"))}
  <form class="a-toolbar" method="get">
    <select name="status"><option value="">All statuses</option>${EVENT_STATUSES.map((s) => html`<option value="${s}" ${s === status ? raw("selected") : ""}>${s}</option>`)}</select>
    <input type="search" name="q" value="${q}" placeholder="Search title or organizer">
    <label class="a-check"><input type="checkbox" name="past" value="1" ${past ? raw("checked") : ""}> Include past</label>
    <button class="a-btn">Filter</button>
    <a class="a-btn a-btn-primary" href="/admin/events/new">Add event</a>
  </form>
  <table class="a-table"><thead><tr><th>When</th><th>Title</th><th>Organizer</th><th>Status</th><th>Source</th></tr></thead><tbody>
  ${results.map((e) => html`<tr><td class="a-nowrap">${fmtDateShort(e.start_at)}<br><small>${fmtTimeRange(e.start_at, e.end_at)}</small></td><td><a href="/admin/events/${e.id}">${e.title}</a>${e.is_featured ? html` <span class="a-pill a-pill-good">pick</span>` : ""}${e.is_better_security_event ? html` <span class="a-pill">BS</span>` : ""}</td><td>${e.org_name || ""}</td><td><span class="a-pill a-pill-${e.status}">${e.status.replace("_", " ")}</span></td><td class="a-muted">${e.source}</td></tr>`)}
  </tbody></table>
  ${!results.length ? html`<p class="a-muted">No events match.</p>` : ""}`;
  return page(adminShell({ title: "Events", body, path: "/admin/events", user: data.user }));
}
