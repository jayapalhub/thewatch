import { html, page, raw, redirect, readForm, str, notFound, list } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { loadIssueData, renderIssueHtml, suggestSubjects } from "../../_lib/newsletter.js";
import { fmtDateShort, fmtTimeRange } from "../../_lib/dates.js";

export async function onRequestGet({ params, request, env, data }) {
  const issue = await env.DB.prepare("SELECT * FROM issues WHERE id=?").bind(params.id).first();
  if (!issue) return notFound();
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const d = await loadIssueData(env.DB, issue);
  const htmlOut = renderIssueHtml(issue, d, siteUrl);
  const subjects = suggestSubjects(d, issue);
  let featuredIds = []; try { featuredIds = JSON.parse(issue.featured_event_ids || "[]"); } catch {}
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  <div class="a-issue">
    <form class="a-form" method="post" action="/admin/issues/${issue.id}">
      <p class="a-muted">Issue #${issue.issue_number} &middot; week ${issue.week_start} to ${issue.week_end} &middot; ${d.events.length} published events &middot; status: <strong>${issue.status.replace(/_/g, " ")}</strong></p>
      <label>Subject<input name="subject" value="${issue.subject || ""}" maxlength="120" list="subj"><datalist id="subj">${subjects.map((s) => html`<option value="${s}">`)}</datalist><small>Suggestions: ${subjects.map((s, i) => html`${i ? " / " : ""}<a href="#" data-fill="subject" data-value="${s}">${s}</a>`)}</small></label>
      <label>Preheader <small>(the preview line under the subject)</small><input name="preheader" value="${issue.preheader || ""}" maxlength="150"></label>
      <label>Your note <small>(three to six sentences; paragraphs separated by a blank line)</small><textarea name="personal_note" rows="7">${issue.personal_note || ""}</textarea></label>
      <fieldset class="a-chips"><legend>Worth your evening (pick one or two)</legend>
        ${d.events.length ? d.events.map((e) => html`<label class="a-chip"><input type="checkbox" name="featured" value="${e.id}" ${featuredIds.includes(e.id) ? raw("checked") : ""}> ${fmtDateShort(e.start_at)} ${fmtTimeRange(e.start_at, e.end_at)}: ${e.title}</label>`) : html`<p class="a-muted">No published events this week yet.</p>`}
      </fieldset>
      <div class="a-grid-2">
        <label>Sponsor name <small>(blank for no sponsor slot)</small><input name="sponsor_name" value="${issue.sponsor_name || ""}"></label>
        <label>Sponsor link<input type="url" name="sponsor_url" value="${issue.sponsor_url || ""}"></label>
      </div>
      <label>Sponsor logo URL<input type="url" name="sponsor_logo_url" value="${issue.sponsor_logo_url || ""}"></label>
      <label>Sponsor copy<textarea name="sponsor_copy" rows="3">${issue.sponsor_copy || ""}</textarea></label>
      <div class="a-grid-2">
        <label>Send at <small>(local)</small><input type="datetime-local" name="send_at" value="${(issue.send_at || "").slice(0, 16)}"></label>
        <label>Beehiiv post URL <small>(after you paste)</small><input type="url" name="beehiiv_post_url" value="${issue.beehiiv_post_url || ""}"></label>
      </div>
      <div class="a-actions">
        <button class="a-btn a-btn-primary" name="action" value="save">Save and re-render</button>
        <button class="a-btn a-btn-good" name="action" value="pasted">Mark pasted to Beehiiv</button>
        <button class="a-btn" name="action" value="sent">Mark sent</button>
        <button class="a-btn a-btn-danger" name="action" value="delete" data-confirm="Delete this issue draft?">Delete</button>
      </div>
    </form>
    <div class="a-preview">
      <div class="a-preview-bar"><strong>Rendered issue</strong> <button class="a-btn a-btn-primary" type="button" data-copy-html="issue-html">Copy for Beehiiv</button> <button class="a-btn" type="button" data-copy-text="issue-html-src">Copy raw HTML</button></div>
      <p class="a-muted">In Beehiiv, open a new post, place the cursor in the body and paste (Cmd or Ctrl V). The formatting carries over. If Beehiiv strips it, use the raw HTML in an HTML block instead.</p>
      <div id="issue-html" class="a-email-frame">${raw(htmlOut)}</div>
      <textarea id="issue-html-src" class="a-src" readonly rows="6">${htmlOut}</textarea>
    </div>
  </div>`;
  return page(adminShell({ title: `Issue #${issue.issue_number}: ${issue.week_start}`, body, path: "/admin/issues", user: data.user }));
}

export async function onRequestPost({ params, request, env }) {
  const id = parseInt(params.id, 10);
  const p = await readForm(request);
  const action = str(p.action);
  if (action === "delete") { await env.DB.prepare("DELETE FROM issues WHERE id=?").bind(id).run(); return redirect("/admin/issues?msg=Deleted"); }
  const featured = list(p.featured).map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 3);
  const status = action === "pasted" ? "pasted_to_beehiiv" : action === "sent" ? "sent" : null;
  await env.DB.prepare(`UPDATE issues SET subject=?, preheader=?, personal_note=?, featured_event_ids=?, sponsor_name=?, sponsor_logo_url=?, sponsor_copy=?, sponsor_url=?, send_at=?, beehiiv_post_url=?, status=COALESCE(?, status), updated_at=datetime('now') WHERE id=?`)
    .bind(str(p.subject, 120) || null, str(p.preheader, 150) || null, str(p.personal_note, 6000) || null, JSON.stringify(featured), str(p.sponsor_name, 120) || null, str(p.sponsor_logo_url, 300) || null, str(p.sponsor_copy, 1000) || null, str(p.sponsor_url, 300) || null, str(p.send_at, 16) || null, str(p.beehiiv_post_url, 300) || null, status, id).run();
  // Mirror featured picks onto the events so the site shows "Jerome's pick" for the week
  if (featured.length) await env.DB.prepare(`UPDATE events SET is_featured = CASE WHEN id IN (${featured.map(() => "?").join(",")}) THEN 1 ELSE is_featured END`).bind(...featured).run();
  return redirect(`/admin/issues/${id}?msg=${encodeURIComponent(status ? "Status updated" : "Saved")}`);
}
