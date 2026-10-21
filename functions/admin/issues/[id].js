import { shareLineHtml } from "../../_lib/referrals.js";
import { html, page, raw, redirect, readForm, str, notFound, list } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { loadIssueData, renderIssueHtml, suggestSubjects, profileNudgeHtml, jobsBlock, picksBlock } from "../../_lib/newsletter.js";
import { fmtDateShort, fmtTimeRange } from "../../_lib/dates.js";
import { CITIES, DEFAULT_CITY } from "../../_lib/constants.js";
import { sendPreview, dispatchIssue, SEND_HOUR, interestSample } from "../../_lib/dispatch.js";

export async function onRequestGet({ params, request, env, data }) {
  const issue = await env.DB.prepare("SELECT * FROM issues WHERE id=?").bind(params.id).first();
  if (!issue) return notFound();
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const city = CITIES[issue.city] || CITIES[DEFAULT_CITY];
  const d = await loadIssueData(env.DB, issue);
  const sample = await interestSample(env.DB, city.slug);
  const htmlOut = renderIssueHtml(issue, d, siteUrl, city).replace(/\{\{PICKS\}\}/g, () => picksBlock(siteUrl, d.events, sample.top, issue.id)).replace(/\{\{SHARE\}\}/g, () => shareLineHtml(siteUrl, "preview")).replace(/\{\{UNSUB\}\}/g, () => siteUrl + "/unsubscribe?t=preview").replace(/\{\{PROFILE_NUDGE\}\}/g, () => profileNudgeHtml(siteUrl, "preview")).replace(/\{\{JOBS\}\}/g, () => jobsBlock(siteUrl, city, d.jobs, null, issue.id)); // nudge: only people without a profile; jobs: matched per subscriber
  const { n: subCount } = await env.DB.prepare("SELECT COUNT(*) n FROM subscribers WHERE status='active' AND city=?").bind(city.slug).first();
  const subjects = suggestSubjects(d, issue);
  const sc = issue.sponsor_name ? await env.DB.prepare("SELECT COUNT(*) n FROM link_clicks WHERE issue_id=? AND target='sponsor'").bind(issue.id).first() : null;
  let featuredIds = []; try { featuredIds = JSON.parse(issue.featured_event_ids || "[]"); } catch {}
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  <div class="a-issue">
    <form class="a-form" method="post" action="/admin/issues/${issue.id}">
      <p class="a-muted">${city.name} issue #${issue.issue_number} &middot; week ${issue.week_start} to ${issue.week_end} &middot; ${d.events.length} published events &middot; ${subCount} active subscribers &middot; status: <strong>${issue.status.replace(/_/g, " ")}</strong></p>
      <p class="a-muted">${issue.status === "sent" ? html`Sent to ${issue.sent_count} on ${issue.completed_at} UTC.` : issue.status === "cancelled" ? html`Cancelled. Nothing will go out this week unless you press Send now.` : issue.status === "sending" ? html`Sending now, ${issue.sent_count} so far.` : html`Sends automatically Sunday at ${SEND_HOUR}:00 AM ${city.name} time${issue.preview_sent_at ? html`; preview emailed ${issue.preview_sent_at} UTC` : html`; preview goes to you Saturday 8 AM`}.`}${issue.send_error ? html` <span class="a-warn">Last error: ${issue.send_error}</span>` : ""}</p>
      <label>Subject<input name="subject" value="${issue.subject || ""}" maxlength="120" list="subj"><datalist id="subj">${subjects.map((s) => html`<option value="${s}">`)}</datalist><small>Suggestions: ${subjects.map((s, i) => html`${i ? " / " : ""}<a href="#" data-fill="subject" data-value="${s}">${s}</a>`)}</small></label>
      <label>Preheader <small>(the preview line under the subject)</small><input name="preheader" value="${issue.preheader || ""}" maxlength="150"></label>
      <label>Your note <small>(three to six sentences; paragraphs separated by a blank line)</small><textarea name="personal_note" rows="7">${issue.personal_note || ""}</textarea></label>
      <fieldset class="a-chips"><legend>Worth your evening (pick one or two)</legend>
        ${d.events.length ? d.events.map((e) => html`<label class="a-chip"><input type="checkbox" name="featured" value="${e.id}" ${featuredIds.includes(e.id) ? raw("checked") : ""}> ${fmtDateShort(e.start_at)} ${fmtTimeRange(e.start_at, e.end_at)}: ${e.title}</label>`) : html`<p class="a-muted">No published events this week yet.</p>`}
      </fieldset>
      <div class="a-grid-2">
        <label>Sponsor name <small>(blank to use the standing sponsor's Supported by line, if one is live${d.sponsor ? `: ${d.sponsor.name}` : ""})</small><input name="sponsor_name" value="${issue.sponsor_name || ""}"></label>
        <label>Sponsor link<input type="url" name="sponsor_url" value="${issue.sponsor_url || ""}"></label>
      </div>
      <label>Sponsor logo URL<input type="url" name="sponsor_logo_url" value="${issue.sponsor_logo_url || ""}"></label>
      <label>Sponsor copy<textarea name="sponsor_copy" rows="3">${issue.sponsor_copy || ""}</textarea></label>
      ${sc ? html`<p class="a-muted">Sponsor link clicks from this issue: <strong>${sc.n}</strong></p>` : ""}
      <div class="a-actions">
        <button class="a-btn a-btn-primary" name="action" value="save">Save and re-render</button>
        <button class="a-btn" name="action" value="preview">Email me a preview now</button>
        ${["draft", "cancelled"].includes(issue.status) ? html`<button class="a-btn a-btn-good" name="action" value="send_now" data-confirm="Send this issue to ${subCount} subscribers right now?">Send now</button>` : ""}
        ${["draft", "sending"].includes(issue.status) ? html`<button class="a-btn a-btn-danger" name="action" value="cancel" data-confirm="Cancel this week's send?">Cancel this send</button>` : ""}
        ${issue.status === "cancelled" ? html`<button class="a-btn" name="action" value="uncancel">Put it back on the schedule</button>` : ""}
        <button class="a-btn a-btn-danger" name="action" value="delete" data-confirm="Delete this issue draft?">Delete</button>
      </div>
    </form>
    <div class="a-preview">
      <div class="a-preview-bar"><strong>Rendered issue</strong> <button class="a-btn" type="button" data-copy-text="issue-html-src">Copy raw HTML</button></div>
      <p class="a-muted">This is what subscribers receive, sent by the site through Resend. Edits above re-render it; nothing else to do.</p>
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
  // Every action saves the form first, so a preview or send uses what is on screen.
  await env.DB.prepare(`UPDATE issues SET subject=?, preheader=?, personal_note=?, featured_event_ids=?, sponsor_name=?, sponsor_logo_url=?, sponsor_copy=?, sponsor_url=?, updated_at=datetime('now') WHERE id=?`)
    .bind(str(p.subject, 120) || null, str(p.preheader, 150) || null, str(p.personal_note, 6000) || null, JSON.stringify(featured), str(p.sponsor_name, 120) || null, str(p.sponsor_logo_url, 300) || null, str(p.sponsor_copy, 1000) || null, str(p.sponsor_url, 300) || null, id).run();
  if (featured.length) await env.DB.prepare(`UPDATE events SET is_featured = CASE WHEN id IN (${featured.map(() => "?").join(",")}) THEN 1 ELSE is_featured END`).bind(...featured).run();
  const issue = await env.DB.prepare("SELECT * FROM issues WHERE id=?").bind(id).first();
  const city = CITIES[issue.city] || CITIES[DEFAULT_CITY];
  let msg = "Saved";
  try {
    if (action === "preview") { const r = await sendPreview(env, { ...issue, force_preview: true }, city); msg = `Preview sent to ${r.to}`; }
    else if (action === "cancel") { await env.DB.prepare("UPDATE issues SET status='cancelled', updated_at=datetime('now') WHERE id=?").bind(id).run(); msg = "Cancelled; nothing goes out this week"; }
    else if (action === "uncancel") { await env.DB.prepare("UPDATE issues SET status='draft', updated_at=datetime('now') WHERE id=?").bind(id).run(); msg = "Back on the schedule"; }
    else if (action === "send_now") { const r = await dispatchIssue(env, { ...issue, status: "draft" }, city); /* Send now also works from cancelled */ msg = r.error ? `Send stopped: ${r.error}` : `Sent to ${r.sent} subscriber${r.sent === 1 ? "" : "s"}${r.done ? "" : " so far; the rest follow within minutes"}`; }
  } catch (e) { msg = `Error: ${String(e.message).slice(0, 200)}`; }
  return redirect(`/admin/issues/${id}?msg=${encodeURIComponent(msg)}`);
}
