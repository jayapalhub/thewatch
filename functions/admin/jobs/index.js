import { html, page, raw, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { CITIES } from "../../_lib/constants.js";
import { todayKey, fmtUtcLocal } from "../../_lib/dates.js";
import { JOB_STATUSES, hydrateJob, isFeatured, defaultExpiry } from "../../_lib/jobs.js";

export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const status = JOB_STATUSES.includes(u.searchParams.get("status")) ? u.searchParams.get("status") : "";
  const city = CITIES[u.searchParams.get("city")] ? u.searchParams.get("city") : "";
  const where = [status ? "j.status = ?" : "j.status IN ('pending_review','draft','published')"], args = status ? [status] : [];
  if (city) { where.push("j.city = ?"); args.push(city); }
  const { results } = await env.DB.prepare(`SELECT j.*, o.name org_name, o.trusted FROM jobs j LEFT JOIN organizations o ON o.id=j.organization_id WHERE ${where.join(" AND ")}
    ORDER BY CASE j.status WHEN 'pending_review' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, j.hold DESC, COALESCE(j.posted_at, substr(j.created_at,1,10)) DESC LIMIT 300`).bind(...args).all();
  const jobs = results.map(hydrateJob);
  const today = todayKey();
  const waiting = jobs.filter((j) => j.status === "pending_review" && (j.hold || !j.auto_publish_at)).length;
  const body = html`${flash(u.searchParams.get("msg"))}
  <p class="a-muted">Roles on the public jobs pages. Roles from the <a href="/admin/jobs/sources">employer boards</a> (read one board an hour, each about weekly) and roles added here go live 24 hours after they appear unless you press Hold or Reject; posts from the public employer form wait for you. Live roles expire after 30 days and their posting URLs are rechecked about once a week. ${waiting ? html`<strong>${waiting}</strong> need a decision.` : ""}</p>
  <form class="a-toolbar" method="get">
    <select name="status"><option value="">Waiting and live</option>${JOB_STATUSES.map((s) => html`<option value="${s}" ${s === status ? raw("selected") : ""}>${s.replace("_", " ")}</option>`)}</select>
    <select name="city"><option value="">All cities</option>${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${c.slug === city ? raw("selected") : ""}>${c.name}</option>`)}</select>
    <button class="a-btn">Filter</button>
    <a class="a-btn a-btn-primary" href="/admin/jobs/posted">Add a posted role</a> <a class="a-btn" href="/admin/jobs/new">Add role</a> <a class="a-btn" href="/admin/jobs/sources">Employer boards</a> <a class="a-btn" href="/admin/jobs/features">Featured requests</a>
  </form>
  <table class="a-table"><thead><tr><th>Role</th><th>Who to talk to</th><th>Status</th><th>Clicks</th><th></th></tr></thead><tbody>
  ${jobs.map((j) => html`<tr>
    <td><a href="/admin/jobs/${j.id}"><strong>${j.title}</strong></a>${isFeatured(j, today) ? html` <span class="a-pill a-pill-good">featured</span>` : ""}<br><small class="a-muted">${j.employer} &middot; ${(CITIES[j.city] || {}).name || j.city}${j.location ? ` · ${j.location}` : ""} &middot; ${j.source}</small>${j.reviewer_notes ? html`<br><small class="a-warn">${j.reviewer_notes}</small>` : ""}</td>
    <td><small>${j.posted_by_name ? html`${j.posted_by_name}${j.posted_by_title ? `, ${j.posted_by_title}` : ""}<br><span class="a-muted">${j.posted_by_role ? j.posted_by_role.replace("_", " ") : j.posted_by_kind || ""}${j.announced ? " · announced, no employer posting yet" : ""}</span>` : html`<span class="a-muted">none</span>`}</small></td>
    <td><span class="a-pill ${j.status === "published" ? "a-pill-good" : j.hold || (j.status === "pending_review" && !j.auto_publish_at) ? "a-pill-warn" : ""}">${j.status === "pending_review" ? (j.hold || !j.auto_publish_at ? "held, needs you" : `auto publishes ${fmtUtcLocal(j.auto_publish_at)}`) : j.status === "published" ? `live until ${j.expires_at || "?"}` : j.status}</span></td>
    <td>${j.apply_clicks}</td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${j.id}">
      ${j.status !== "published" ? html`<button class="a-btn a-btn-good" name="action" value="publish">Publish now</button>` : html`<button class="a-btn" name="action" value="close">Close</button>`}
      ${j.status === "pending_review" ? (j.hold || !j.auto_publish_at ? html`<button class="a-btn" name="action" value="release">Release (24h)</button>` : html`<button class="a-btn" name="action" value="hold">Hold</button>`) : ""}
      ${j.status !== "rejected" && j.status !== "published" ? html`<button class="a-btn a-btn-danger" name="action" value="reject">Reject</button>` : ""}
    </form></td>
  </tr>`)}
  ${!jobs.length ? html`<tr><td colspan="5" class="a-muted">No roles yet. Add the first few by hand with Add role.</td></tr>` : ""}
  </tbody></table>`;
  return page(adminShell({ title: `Jobs (${jobs.length})`, body, path: "/admin/jobs", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const id = parseInt(str(p.id), 10), action = str(p.action);
  const db = env.DB;
  const back = (m) => redirect("/admin/jobs?msg=" + encodeURIComponent(m));
  const j = id ? await db.prepare("SELECT id, title FROM jobs WHERE id=?").bind(id).first() : null;
  if (!j) return back("Role not found");
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  if (action === "publish") await db.prepare(`UPDATE jobs SET status='published', hold=0, published_at=COALESCE(published_at, ${now}), expires_at=CASE WHEN expires_at IS NULL OR expires_at < date('now') THEN ? ELSE expires_at END, closed_reason=NULL, updated_at=${now} WHERE id=?`).bind(defaultExpiry(), id).run();
  else if (action === "hold") await db.prepare(`UPDATE jobs SET hold=1, updated_at=${now} WHERE id=?`).bind(id).run();
  else if (action === "release") await db.prepare(`UPDATE jobs SET hold=0, auto_publish_at=datetime('now', '+24 hours'), updated_at=${now} WHERE id=?`).bind(id).run();
  else if (action === "reject") await db.prepare(`UPDATE jobs SET status='rejected', updated_at=${now} WHERE id=?`).bind(id).run();
  else if (action === "close") await db.prepare(`UPDATE jobs SET status='closed', closed_reason='Closed by Jerome', updated_at=${now} WHERE id=?`).bind(id).run();
  else return back("Unknown action");
  const done = { publish: "Published", hold: "Held", release: "Publishes in 24 hours", reject: "Rejected", close: "Closed" }[action];
  return back(`${done}: ${j.title}`);
}
