import { html, page } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { todayKey, mondayOf, addDays } from "../../_lib/dates.js";
import { CITIES } from "../../_lib/constants.js";

export async function onRequestGet({ request, env, data }) {
  const { results } = await env.DB.prepare("SELECT i.*, (SELECT COUNT(*) FROM link_clicks c WHERE c.issue_id=i.id) clicks FROM issues i ORDER BY week_start DESC LIMIT 100").all();
  const today = todayKey();
  const thisMon = mondayOf(today), nextMon = addDays(thisMon, 7);
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  <p class="a-muted">Each city with a Sunday email gets its issue built automatically: a preview to you Saturday 8 AM local, the send Sunday 8 AM local. Open an issue to edit the note, cancel, or send early. Cities get a newsletter when their Newsletter field on the Cities page is set to Sunday email.</p>
  <p>${Object.values(CITIES).filter((c) => c.newsletter === "sunday").map((c) => html`<a class="a-btn a-btn-primary" href="/admin/issues/new?city=${c.slug}&week=${nextMon}">${c.name}: next week (${nextMon})</a> `)}
  ${Object.values(CITIES).filter((c) => c.newsletter !== "sunday").length ? html`<span class="a-muted">No Sunday email yet: ${Object.values(CITIES).filter((c) => c.newsletter !== "sunday").map((c) => c.name).join(", ")} (switch it on under <a href="/admin/cities">Cities</a>).</span>` : ""}</p>
  <table class="a-table"><thead><tr><th>#</th><th>City</th><th>Week</th><th>Subject</th><th>Status</th><th>Sent</th><th>Clicks</th></tr></thead><tbody>
  ${results.map((i) => html`<tr><td>${i.issue_number || ""}</td><td>${(CITIES[i.city] || {}).name || i.city}</td><td class="a-nowrap"><a href="/admin/issues/${i.id}">${i.week_start} to ${i.week_end}</a></td><td>${i.subject || html`<span class="a-muted">untitled</span>`}</td><td><span class="a-pill ${i.status === "sent" ? "a-pill-good" : i.status === "cancelled" ? "a-pill-warn" : ""}">${i.status.replace(/_/g, " ")}</span></td><td>${i.sent_count || ""}</td><td>${i.clicks}</td></tr>`)}
  </tbody></table>${!results.length ? html`<p class="a-muted">No issues yet. Draft one for next week.</p>` : ""}`;
  return page(adminShell({ title: "Newsletter issues", body, path: "/admin/issues", user: data.user }));
}
