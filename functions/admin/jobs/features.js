import { html, page, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { CITIES } from "../../_lib/constants.js";
import { todayKey, addDays, fmtUtcLocal } from "../../_lib/dates.js";
import { defaultExpiry } from "../../_lib/jobs.js";
import { inferTopics } from "../../_lib/job-sources.js";
import { findEmployer } from "../../_lib/admin-jobs.js";
import { getSetting, setSetting, FEATURED_PRICE_KEY, FEATURED_PRICE_DEFAULT } from "../../_lib/settings.js";

// Admin > Jobs > Featured: requests from /<city>/jobs/feature. Approve pins the listing (creating it if the role is
// not on the board yet), Invoiced and Declined are bookkeeping. The price line on the public page is edited here.
export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results } = await env.DB.prepare("SELECT f.*, j.status job_status, j.featured_until job_featured_until FROM feature_requests f LEFT JOIN jobs j ON j.id=f.job_id ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'invoiced' THEN 1 WHEN 'live' THEN 2 ELSE 3 END, f.id DESC LIMIT 200").all().catch(() => ({ results: [] }));
  const price = await getSetting(env.DB, FEATURED_PRICE_KEY, FEATURED_PRICE_DEFAULT);
  const today = todayKey();
  const body = html`${flash(msg)}
  <p class="a-muted">Employers ask for the featured slot at /&lt;city&gt;/jobs/feature. Approve pins the role at the top of that city's board and first in the Sunday email until the date shown; the invoice is yours to send. Nothing here takes a card. <a href="/admin/jobs">Back to jobs</a>.</p>
  <form method="post" class="a-form a-card"><input type="hidden" name="action" value="price">
    <label>Price line shown on the public page <small>(for example "$150 for two weeks, $250 for four"; leave empty and the page says pricing comes by reply)</small><input name="price" value="${price}" maxlength="160"></label>
    <button class="a-btn">Save price line</button>
  </form>
  ${results.length ? html`<table class="a-table"><thead><tr><th>Requested</th><th>Role</th><th>City</th><th>Weeks</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>
  ${results.map((f) => html`<tr>
    <td class="a-nowrap"><small>${fmtUtcLocal(f.created_at)}</small></td>
    <td><strong>${f.title || ""}</strong><br>${f.employer}<br><small><a href="${f.url}" target="_blank" rel="noopener">${String(f.url || "").replace(/^https?:\/\//, "").slice(0, 60)}</a></small>${f.job_id ? html`<br><small>Listing <a href="/admin/jobs/${f.job_id}">${f.job_id}</a> (${f.job_status || "?"}${f.job_featured_until ? `, featured until ${f.job_featured_until}` : ""})</small>` : html`<br><small class="a-muted">Not on the board yet; Approve adds it.</small>`}${f.notes ? html`<br><small>${f.notes}</small>` : ""}</td>
    <td>${(CITIES[f.city] || {}).name || f.city}</td>
    <td>${f.weeks}</td>
    <td>${f.contact_name}${f.contact_title ? html`<br><small>${f.contact_title}</small>` : ""}<br><small><a href="mailto:${f.contact_email}">${f.contact_email}</a></small></td>
    <td><span class="a-pill ${f.status === "live" ? "a-pill-good" : f.status === "declined" ? "" : "a-pill-warn"}">${f.status}</span>${f.featured_until ? html`<br><small>${f.featured_from} to ${f.featured_until}</small>` : ""}${f.admin_notes ? html`<br><small>${f.admin_notes}</small>` : ""}</td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${f.id}">
      ${f.status !== "live" && f.status !== "declined" ? html`<label><small>from</small> <input type="date" name="from" value="${today}" style="width:11em"></label>
        <button class="a-btn a-btn-small a-btn-primary" name="action" value="approve" data-confirm="Pin this role at the top of the board for ${f.weeks} week${f.weeks === 1 ? "" : "s"}?">Approve and pin</button>` : ""}
      ${f.status === "new" ? html`<button class="a-btn a-btn-small" name="action" value="invoiced">Mark invoiced</button>` : ""}
      ${f.status !== "declined" ? html`<button class="a-btn a-btn-small a-btn-danger" name="action" value="decline">Decline</button>` : ""}
    </form></td>
  </tr>`)}</tbody></table>` : html`<p class="a-muted">No featured role requests yet. The form is at each city's /jobs/feature page, linked from the jobs board.</p>`}`;
  return page(adminShell({ title: `Featured role requests (${results.length})`, body, path: "/admin/jobs", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const p = await readForm(request);
  const action = str(p.action), id = parseInt(p.id, 10) || 0;
  const back = (m) => redirect("/admin/jobs/features?msg=" + encodeURIComponent(m), 303);
  if (action === "price") { await setSetting(db, FEATURED_PRICE_KEY, str(p.price, 160)); return back("Price line saved."); }
  const f = id ? await db.prepare("SELECT * FROM feature_requests WHERE id=?").bind(id).first() : null;
  if (!f) return back("Request not found.");
  if (action === "invoiced") { await db.prepare("UPDATE feature_requests SET status='invoiced', updated_at=datetime('now') WHERE id=?").bind(id).run(); return back("Marked invoiced."); }
  if (action === "decline") { await db.prepare("UPDATE feature_requests SET status='declined', updated_at=datetime('now') WHERE id=?").bind(id).run(); return back("Declined. Nothing changed on the board."); }
  if (action === "approve") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(str(p.from)) ? str(p.from) : todayKey();
    const until = addDays(from, 7 * (f.weeks || 2) - 1);
    let jobId = f.job_id;
    if (!jobId) {
      const byUrl = await db.prepare("SELECT id FROM jobs WHERE url=? AND status IN ('pending_review','published','draft') LIMIT 1").bind(f.url).first();
      jobId = byUrl ? byUrl.id : null;
    }
    const expiry = defaultExpiry(from) > until ? defaultExpiry(from) : until; // the listing outlives the pin by the usual 30 days
    if (jobId) {
      // A pending role that Jerome is pinning is a role he has approved: publish it with the pin.
      await db.prepare("UPDATE jobs SET featured_until=?, status=CASE WHEN status IN ('pending_review','draft','closed','expired') THEN 'published' ELSE status END, published_at=COALESCE(published_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), expires_at=CASE WHEN expires_at IS NULL OR expires_at < ? THEN ? ELSE expires_at END, hold=0, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
        .bind(until, expiry, expiry, jobId).run();
    } else {
      const emp = await findEmployer(db, f.employer);
      const r = await db.prepare(`INSERT INTO jobs (city, organization_id, employer_name, title, url, remote, topics, posted_at, expires_at, featured_until, status, hold, source, published_at, submitted_by_name, submitted_by_email, reviewer_notes)
        VALUES (?,?,?,?,?,'onsite',?,?,?,?,'published',0,'employer_form',strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?,?)`)
        .bind(f.city, emp ? emp.id : null, f.employer, f.title || "Security role", f.url, JSON.stringify(inferTopics(f.title || "")), from, expiry, until, f.contact_name, f.contact_email, `Featured placement approved from request ${f.id}; set location and level in the editor.`).run();
      jobId = r.meta.last_row_id;
    }
    await db.prepare("UPDATE feature_requests SET status='live', job_id=?, featured_from=?, featured_until=?, updated_at=datetime('now') WHERE id=?").bind(jobId, from, until, id).run();
    return back(`Pinned through ${until}. Check the listing at /admin/jobs/${jobId} for location and level.`);
  }
  return back("Unknown action.");
}
