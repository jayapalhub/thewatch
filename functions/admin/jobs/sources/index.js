import { fmtUtcLocal } from "../../../_lib/dates.js";
import { html, page, raw, readForm, redirect, str } from "../../../_lib/html.js";
import { adminShell, flash } from "../../../_lib/admin.js";
import { CITIES, DEFAULT_CITY } from "../../../_lib/constants.js";
import { SOURCE_KINDS, runAllJobSources, ensureEmployerOrg } from "../../../_lib/job-sources.js";

// The public address of a board, for a quick look at what the sweep reads.
function boardUrl(s) {
  let c = {}; try { c = JSON.parse(s.config || "{}"); } catch { return ""; }
  if (s.kind === "workday" && c.tenant && c.host && c.site) return `https://${c.tenant}.${c.host}.myworkdayjobs.com/${c.site}`;
  if (s.kind === "greenhouse" && c.board) return `https://boards.greenhouse.io/${c.board}`;
  if (s.kind === "lever" && c.company) return `https://jobs.lever.co/${c.company}`;
  if (s.kind === "ashby" && c.board) return `https://jobs.ashbyhq.com/${c.board}`;
  if (s.kind === "eightfold" && c.host) return `https://${c.host}/careers`;
  if (s.kind === "smartrecruiters" && c.company) return `https://careers.smartrecruiters.com/${c.company}`;
  return "";
}

// Admin > Jobs > Sources: the employer boards the Thursday sweep reads. Roles it finds publish in 24 hours unless held.
export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results: sources } = await env.DB.prepare("SELECT s.*, (SELECT COUNT(*) FROM jobs j WHERE j.source_id=s.id AND j.status='published') live, (SELECT COUNT(*) FROM jobs j WHERE j.source_id=s.id AND j.status='pending_review') pending FROM job_sources s ORDER BY s.active DESC, s.city, s.employer_name").all();
  const body = html`${flash(msg)}
  <p class="a-muted">The hourly job takes one board an hour, so each board is read about once a week. It keeps the security, GRC, privacy and audit roles whose location matches the city, and files them as pending review with a 24 hour clock. If you do nothing they go live; press Hold or Reject on <a href="/admin/jobs">Jobs</a> to stop one. Roles that leave a board are closed on the next run. <a href="/admin/jobs">Back to jobs</a>.</p>
  <form method="post" class="a-inline"><input type="hidden" name="action" value="run"><button class="a-btn a-btn-primary">Read the two boards that have waited longest</button></form>
  <table class="a-table"><thead><tr><th>Employer</th><th>City</th><th>Board</th><th>Location must include</th><th>Live / pending</th><th>Last run</th><th></th></tr></thead><tbody>
  ${sources.map((s) => html`<tr class="${s.active ? "" : "a-dim"}">
    <td><strong>${s.employer_name}</strong>${s.notes ? html`<br><small class="a-muted">${s.notes}</small>` : ""}</td>
    <td>${(CITIES[s.city] || {}).name || s.city}</td>
    <td>${SOURCE_KINDS[s.kind] || s.kind}<br><small>${boardUrl(s) ? html`<a href="${boardUrl(s)}" target="_blank" rel="noopener">${boardUrl(s).replace(/^https:\/\//, "")}</a>` : html`<span class="a-muted">${s.config}</span>`}</small></td>
    <td><small>${s.location_terms}</small></td>
    <td>${s.live} / ${s.pending}</td>
    <td><small>${s.last_run_at ? html`${fmtUtcLocal(s.last_run_at)}<br>${s.last_status || ""}` : html`<span class="a-muted">never</span>`}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${s.id}">
      <button class="a-btn a-btn-small" name="action" value="run_one">Run</button>
      <button class="a-btn a-btn-small" name="action" value="toggle">${s.active ? "Pause" : "Resume"}</button>
      <button class="a-btn a-btn-small a-btn-danger" name="action" value="delete" onclick="return confirm('Remove this board? Roles already listed stay.')">Remove</button></form></td>
  </tr>`)}</tbody></table>
  <h2>Add a board</h2>
  <form method="post" class="a-form"><input type="hidden" name="action" value="add">
    <div class="a-grid-3">
      <label>Employer<input name="employer_name" required maxlength="120" placeholder="Qualcomm"></label>
      <label>City<select name="city">${Object.values(CITIES).map((c) => html`<option value="${c.slug}">${c.name}</option>`)}</select></label>
      <label>Board<select name="kind">${Object.entries(SOURCE_KINDS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
    </div>
    <div class="a-grid-2">
      <label>Board details <small>(Workday: tenant, host, site from the URL tenant.host.myworkdayjobs.com/site. Greenhouse or Ashby: the board name. Lever or SmartRecruiters: the company name. Eightfold: the careers host and the company domain it passes to its API.)</small><input name="config" required maxlength="300" placeholder='icwgroup, wd5, ICW  or  sonyinteractiveentertainmentglobal  or  careers.qualcomm.com, qualcomm.com'></label>
      <label>Location must include <small>(comma separated; any one is enough)</small><input name="location_terms" required maxlength="200" placeholder="San Diego, Carlsbad, Poway"></label>
    </div>
    <div class="a-grid-2">
      <label>Search text <small>(Workday only; the city name keeps big boards focused)</small><input name="search_text" maxlength="60" placeholder="security San Jose"></label>
      <label>Notes<input name="notes" maxlength="300"></label>
    </div>
    <button class="a-btn a-btn-primary">Add board</button>
  </form>`;
  return page(adminShell({ title: `Job boards (${sources.length})`, body, path: "/admin/jobs", user: data.user }));
}

function parseConfig(kind, text) {
  const parts = String(text || "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (kind === "workday") { if (parts.length < 3) return null; return { tenant: parts[0].toLowerCase(), host: parts[1].toLowerCase(), site: parts[2] }; }
  if (kind === "eightfold") { if (parts.length < 2) return null; return { host: parts[0].toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""), company: parts[1].toLowerCase() }; }
  if (!parts.length) return null;
  return kind === "lever" || kind === "smartrecruiters" ? { company: parts[0] } : { board: parts[0] };
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const action = str(p.action), id = parseInt(str(p.id), 10) || null;
  const db = env.DB;
  const back = (m) => redirect("/admin/jobs/sources?msg=" + encodeURIComponent(m), 303);
  if (action === "run" || action === "run_one") {
    const runs = await runAllJobSources(db, { onlyId: action === "run_one" ? id : null, max: 2, dueOnly: false });
    const added = runs.reduce((a, r) => a + (r.added || 0), 0), closed = runs.reduce((a, r) => a + (r.closed || 0), 0), errs = runs.filter((r) => r.error);
    return back(`Sweep done: ${added} added, ${closed} closed${errs.length ? `; ${errs.length} board${errs.length === 1 ? "" : "s"} failed (${errs.map((r) => r.source).join(", ")})` : ""}.`);
  }
  if (action === "toggle" && id) { await db.prepare("UPDATE job_sources SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").bind(id).run(); return back("Updated."); }
  if (action === "delete" && id) { await db.prepare("DELETE FROM job_sources WHERE id=?").bind(id).run(); return back("Removed."); }
  if (action === "add") {
    const kind = SOURCE_KINDS[str(p.kind)] ? str(p.kind) : null, name = str(p.employer_name, 120), terms = str(p.location_terms, 200), city = CITIES[str(p.city, 30)] ? str(p.city, 30) : null;
    const cfg = kind && parseConfig(kind, str(p.config, 300));
    if (!kind || !name || !terms || !city || !cfg) return back("Employer, city, board details and location words are all required.");
    const orgId = await ensureEmployerOrg(db, name, city || DEFAULT_CITY);
    await db.prepare("INSERT INTO job_sources (city, organization_id, employer_name, kind, config, location_terms, search_text, notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(city, orgId, name, kind, JSON.stringify(cfg), terms, str(p.search_text, 60) || `security ${terms.split(",")[0].trim()}`, str(p.notes, 300) || null).run();
    return back(`Added ${name}. Press Run on its row to read it now; otherwise the hourly job gets to it.`);
  }
  return back("Unknown action.");
}
