import { html, page } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { todayKey, mondayOf, addDays } from "../../_lib/dates.js";

export async function onRequestGet({ request, env, data }) {
  const { results } = await env.DB.prepare("SELECT i.*, (SELECT COUNT(*) FROM link_clicks c WHERE c.issue_id=i.id) clicks FROM issues i ORDER BY week_start DESC LIMIT 100").all();
  const today = todayKey();
  const thisMon = mondayOf(today), nextMon = addDays(thisMon, 7);
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  <p><a class="a-btn a-btn-primary" href="/admin/issues/new?week=${nextMon}">Draft next week (${nextMon})</a> <a class="a-btn" href="/admin/issues/new?week=${thisMon}">Draft this week (${thisMon})</a></p>
  <table class="a-table"><thead><tr><th>#</th><th>Week</th><th>Subject</th><th>Status</th><th>Clicks</th></tr></thead><tbody>
  ${results.map((i) => html`<tr><td>${i.issue_number || ""}</td><td class="a-nowrap"><a href="/admin/issues/${i.id}">${i.week_start} to ${i.week_end}</a></td><td>${i.subject || html`<span class="a-muted">untitled</span>`}</td><td><span class="a-pill">${i.status.replace(/_/g, " ")}</span></td><td>${i.clicks}</td></tr>`)}
  </tbody></table>${!results.length ? html`<p class="a-muted">No issues yet. Draft one for next week.</p>` : ""}`;
  return page(adminShell({ title: "Newsletter issues", body, path: "/admin/issues", user: data.user }));
}
