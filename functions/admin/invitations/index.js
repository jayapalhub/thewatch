// Admin > Invitations: every invitation request, filterable by seniority, area, vendor flag and status, with a CSV
// export of the filtered list (the invite list for an experience) and a status per row.
import { html, page, raw, list, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { INVITE_SENIORITY, INVITE_AREAS, INVITE_STATUSES } from "../../_lib/constants.js";

function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const opt = (k, v, cur) => html`<option value="${k}" ${String(cur) === String(k) ? raw("selected") : ""}>${v}</option>`;

export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const f = {
    q: (u.searchParams.get("q") || "").slice(0, 80),
    seniority: INVITE_SENIORITY[u.searchParams.get("seniority")] ? u.searchParams.get("seniority") : "",
    area: INVITE_AREAS[u.searchParams.get("area")] ? u.searchParams.get("area") : "",
    vendor: ["0", "1"].includes(u.searchParams.get("vendor")) ? u.searchParams.get("vendor") : "",
    status: INVITE_STATUSES[u.searchParams.get("status")] ? u.searchParams.get("status") : "",
  };
  const where = []; const args = [];
  if (f.q) { where.push("(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR company LIKE ? OR job_title LIKE ?)"); for (let i = 0; i < 5; i++) args.push(`%${f.q}%`); }
  if (f.seniority) { where.push("seniority=?"); args.push(f.seniority); }
  if (f.area) { where.push("areas LIKE ?"); args.push(`%"${f.area}"%`); }
  if (f.vendor) { where.push("vendor=?"); args.push(Number(f.vendor)); }
  if (f.status) { where.push("status=?"); args.push(f.status); }
  const { results } = await env.DB.prepare(`SELECT * FROM invitation_requests ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 2000`).bind(...args).all();
  const areaNames = (r) => list(r.areas).map((k) => INVITE_AREAS[k] || k);

  if (u.searchParams.get("format") === "csv") {
    const cols = ["id", "created_at", "status", "first_name", "last_name", "email", "company", "job_title", "seniority", "areas", "vendor", "linkedin_url", "notes", "source", "confirmation_sent_at", "reviewer_notes"];
    const rows = [cols.join(",")].concat(results.map((r) => cols.map((c) => csvCell(c === "areas" ? areaNames(r).join("; ") : c === "seniority" ? INVITE_SENIORITY[r[c]] || r[c] : c === "vendor" ? (r.vendor ? "yes" : "no") : r[c])).join(",")));
    return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="watch-invitations-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const csvUrl = "/admin/invitations?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), format: "csv" }).toString();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) n FROM invitation_requests GROUP BY status").all();
  const by = Object.fromEntries((counts.results || []).map((r) => [r.status, r.n]));
  const body = html`${flash(u.searchParams.get("msg"))}
  <p class="a-muted">${Object.entries(INVITE_STATUSES).map(([k, v]) => `${by[k] || 0} ${v.toLowerCase()}`).join(", ")}. Requests come from <a href="/invite" target="_blank">/invite</a>; each one gets a confirmation email and you get a note. Filter down to the room you want and export the CSV for an invite list. Names and details are never shared with sponsors.</p>
  <form class="a-toolbar" method="get">
    <input type="search" name="q" value="${f.q}" placeholder="Name, email, company, title">
    <select name="seniority"><option value="">Any seniority</option>${Object.entries(INVITE_SENIORITY).map(([k, v]) => opt(k, v, f.seniority))}</select>
    <select name="area"><option value="">Any area</option>${Object.entries(INVITE_AREAS).map(([k, v]) => opt(k, v, f.area))}</select>
    <select name="vendor"><option value="">Practitioners and vendors</option>${opt("0", "Practitioners only", f.vendor)}${opt("1", "Vendors, resellers, services", f.vendor)}</select>
    <select name="status"><option value="">Any status</option>${Object.entries(INVITE_STATUSES).map(([k, v]) => opt(k, v, f.status))}</select>
    <button class="a-btn">Filter</button>
    <a class="a-btn a-btn-primary" href="${csvUrl}">Export CSV (${results.length})</a>
  </form>
  <table class="a-table"><thead><tr><th>Who</th><th>Company / title</th><th>Seniority</th><th>Areas</th><th>Notes</th><th>Asked</th><th>Status</th></tr></thead><tbody>
  ${results.map((r) => html`<tr class="${r.status === "declined" ? "a-dim" : ""}">
    <td>${r.first_name} ${r.last_name}${r.vendor ? html` <span class="a-pill a-pill-warn">Vendor</span>` : ""}<br><small><a href="mailto:${r.email}">${r.email}</a> · <a href="${r.linkedin_url}" target="_blank" rel="noopener">LinkedIn</a></small></td>
    <td>${r.company}<br><small>${r.job_title}</small></td>
    <td>${INVITE_SENIORITY[r.seniority] || r.seniority}</td>
    <td><small>${areaNames(r).join(", ")}</small></td>
    <td><small>${r.notes || ""}</small></td>
    <td class="a-nowrap"><small>${(r.created_at || "").slice(0, 10)}<br>${r.source || ""}${r.confirmation_sent_at ? "" : html`<br><span class="a-pill a-pill-warn">no confirmation</span>`}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${r.id}"><select name="status" onchange="this.form.submit()">${Object.entries(INVITE_STATUSES).map(([k, v]) => opt(k, v, r.status))}</select></form>${r.reviewer_notes ? html`<br><small>${r.reviewer_notes}</small>` : ""}</td>
  </tr>`)}
  </tbody></table>
  ${results.length ? "" : html`<p class="a-muted">No requests match.</p>`}`;
  return page(adminShell({ title: "Invitation requests", body, path: "/admin/invitations", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const id = parseInt(str(p.id), 10), status = str(p.status);
  if (Number.isFinite(id) && INVITE_STATUSES[status]) await env.DB.prepare("UPDATE invitation_requests SET status=?, updated_at=datetime('now') WHERE id=?").bind(status, id).run();
  return redirect("/admin/invitations?msg=" + encodeURIComponent("Status saved"), 303);
}
