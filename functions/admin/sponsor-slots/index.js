import { html, page, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { CITIES, DEFAULT_CITY } from "../../_lib/constants.js";
import { todayKey } from "../../_lib/dates.js";
import { PLACEMENTS, sponsorStatus } from "../../_lib/sponsors.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sponsorForm(s = {}, { isNew = true } = {}) {
  return html`<form method="post" class="a-form">
    <input type="hidden" name="action" value="${isNew ? "add" : "save"}">${isNew ? "" : html`<input type="hidden" name="id" value="${s.id}">`}
    <div class="a-grid-3">
      <label>Sponsor name<input name="name" required maxlength="120" value="${s.name || ""}" placeholder="Acme Security"></label>
      <label>Link <small>(their landing page)</small><input type="url" name="url" required maxlength="500" value="${s.url || ""}" placeholder="https://acme.com/sandiego"></label>
      <label>Logo URL <small>(https, or /assets/sponsors/acme.png)</small><input name="logo_url" maxlength="500" value="${s.logo_url || ""}"></label>
    </div>
    <label>Tagline <small>(optional, one short line shown beside the logo and in the email)</small><input name="tagline" maxlength="120" value="${s.tagline || ""}" placeholder="Cloud security for regulated teams"></label>
    <div class="a-grid-3">
      <label>Calendar<select name="city"><option value="">Every city</option>${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${s.city === c.slug ? "selected" : ""}>${c.name}</option>`)}</select></label>
      <label>Placement<select name="placement">${Object.entries(PLACEMENTS).map(([k, v]) => html`<option value="${k}" ${(s.placement || "both") === k ? "selected" : ""}>${v}</option>`)}</select></label>
      <label>Starts <small>(blank for now)</small><input type="date" name="starts_at" value="${s.starts_at || ""}"></label>
    </div>
    <div class="a-grid-3">
      <label>Ends <small>(inclusive; blank for open ended)</small><input type="date" name="ends_at" value="${s.ends_at || ""}"></label>
      <label style="grid-column: span 2">Private notes <small>(deal terms, contact; never shown)</small><input name="notes" maxlength="500" value="${s.notes || ""}"></label>
    </div>
    <div class="a-actions"><button class="a-btn a-btn-primary">${isNew ? "Add sponsor" : "Save changes"}</button>${isNew ? "" : html` <a class="a-btn" href="/admin/sponsor-slots">Cancel</a>`}</div>
  </form>`;
}

export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const msg = url.searchParams.get("msg");
  const editId = parseInt(url.searchParams.get("edit") || "", 10);
  const today = todayKey();
  const { results: sponsors } = await env.DB.prepare("SELECT * FROM sponsors ORDER BY active DESC, COALESCE(ends_at, '9999') DESC, id DESC").all();
  const { results: clicks } = await env.DB.prepare("SELECT sponsor_id, placement, COUNT(*) n FROM sponsor_clicks GROUP BY sponsor_id, placement").all();
  const clickMap = {}; for (const c of clicks) (clickMap[c.sponsor_id] = clickMap[c.sponsor_id] || {})[c.placement] = c.n;
  const editing = editId ? sponsors.find((s) => s.id === editId) : null;
  const live = sponsors.filter((s) => sponsorStatus(s, today) === "Live");

  const body = html`${flash(msg)}
  <p>A standing sponsor gets one logo on the city calendar page, just above the subscribe band, and one "Supported by" line above the Sunday email footer. If several are live for the same calendar they take turns: by day on the page and by issue in the email. A sponsor set on an individual issue (in Newsletter) replaces this line in that issue's email. Clicks are counted through a tracked link so you can report them to the sponsor.</p>
  <p class="a-muted">${live.length ? `${live.length} live now.` : "Nothing is live, so the page and email show no sponsor."}</p>
  ${editing ? html`<h2>Edit ${editing.name}</h2>${sponsorForm(editing, { isNew: false })}` : ""}
  <h2>Sponsors</h2>
  <table class="a-table"><thead><tr><th>Sponsor</th><th>Where</th><th>Dates</th><th>Status</th><th>Clicks</th><th></th></tr></thead><tbody>
  ${sponsors.map((s) => { const st = sponsorStatus(s, today); const c = clickMap[s.id] || {}; return html`<tr class="${st === "Live" ? "" : "a-dim"}">
    <td>${s.logo_url ? html`<img src="${s.logo_url}" alt="" style="height:22px;width:auto;vertical-align:middle;margin-right:8px;">` : ""}<strong>${s.name}</strong>${s.tagline ? html`<br><small class="a-muted">${s.tagline}</small>` : ""}${s.notes ? html`<br><small class="a-muted">Notes: ${s.notes}</small>` : ""}</td>
    <td>${s.city ? (CITIES[s.city] || {}).name || s.city : "Every city"}<br><small class="a-muted">${PLACEMENTS[s.placement] || s.placement}</small></td>
    <td><small>${s.starts_at || "now"} to ${s.ends_at || "open"}</small></td>
    <td><span class="a-pill ${st === "Live" ? "a-pill-good" : st === "Scheduled" ? "" : "a-pill-warn"}">${st}</span></td>
    <td><small>page ${c.page || 0}<br>email ${c.email || 0}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${s.id}">
      <a class="a-btn" href="/admin/sponsor-slots?edit=${s.id}">Edit</a>
      <button class="a-btn" name="action" value="toggle">${s.active ? "Pause" : "Resume"}</button>
      <button class="a-btn a-btn-danger" name="action" value="delete" onclick="return confirm('Remove this sponsor and its click history?')">Remove</button></form></td>
  </tr>`; })}
  ${!sponsors.length ? html`<tr><td colspan="6" class="a-muted">No sponsors yet.</td></tr>` : ""}
  </tbody></table>
  ${editing ? "" : html`<h2>Add a sponsor</h2>${sponsorForm()}`}`;
  return page(adminShell({ title: "Sponsors", body, path: "/admin/sponsor-slots", user: data.user }));
}

function readSponsor(p) {
  const name = str(p.name, 120), url = str(p.url, 500), logo = str(p.logo_url, 500);
  if (!name) return { error: "Sponsor name is required" };
  if (!/^https?:\/\//.test(url)) return { error: "The link must start with https://" };
  if (logo && !/^https:\/\//.test(logo) && !(logo.startsWith("/") && !logo.startsWith("//"))) return { error: "The logo must be an https URL or a site path starting with /" };
  const starts = str(p.starts_at, 10), ends = str(p.ends_at, 10);
  if ((starts && !DATE_RE.test(starts)) || (ends && !DATE_RE.test(ends))) return { error: "Dates must be YYYY-MM-DD" };
  if (starts && ends && ends < starts) return { error: "The end date is before the start date" };
  const city = CITIES[str(p.city, 30)] ? str(p.city, 30) : null;
  return { row: [name, logo || null, url, str(p.tagline, 120) || null, city, PLACEMENTS[str(p.placement)] ? str(p.placement) : "both", starts || null, ends || null, str(p.notes, 500) || null] };
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const action = str(p.action);
  const db = env.DB;
  const back = (m) => redirect("/admin/sponsor-slots?msg=" + encodeURIComponent(m));
  const id = parseInt(str(p.id), 10);
  if (action === "add" || action === "save") {
    const { row, error } = readSponsor(p);
    if (error) return redirect(`/admin/sponsor-slots?${action === "save" ? `edit=${id}&` : ""}msg=${encodeURIComponent(error)}`);
    if (action === "add") {
      await db.prepare("INSERT INTO sponsors (name, logo_url, url, tagline, city, placement, starts_at, ends_at, notes) VALUES (?,?,?,?,?,?,?,?,?)").bind(...row).run();
      return back(`Added ${row[0]}`);
    }
    await db.prepare("UPDATE sponsors SET name=?, logo_url=?, url=?, tagline=?, city=?, placement=?, starts_at=?, ends_at=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(...row, id).run();
    return back(`Saved ${row[0]}`);
  }
  if (action === "toggle" && id) { await db.prepare("UPDATE sponsors SET active = CASE active WHEN 1 THEN 0 ELSE 1 END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(id).run(); return back("Updated"); }
  if (action === "delete" && id) { await db.batch([db.prepare("DELETE FROM sponsor_clicks WHERE sponsor_id=?").bind(id), db.prepare("DELETE FROM sponsors WHERE id=?").bind(id)]); return back("Removed"); }
  return redirect("/admin/sponsor-slots");
}
