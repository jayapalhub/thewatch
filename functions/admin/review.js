import { html, page, raw } from "../_lib/html.js";
import { adminShell, flash } from "../_lib/admin.js";
import { fmtDateShort, fmtTimeRange } from "../_lib/dates.js";

export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results } = await env.DB.prepare(`SELECT e.*, o.name org_name, o.trusted FROM events e LEFT JOIN organizations o ON o.id=e.organization_id WHERE e.status IN ('pending_review','draft') ORDER BY e.created_at DESC`).all();
  const body = html`${flash(msg)}
  ${results.length ? html`<ul class="a-queue">${results.map((e) => html`
    <li class="a-queue-item ${e.reviewer_notes && /duplicate/i.test(e.reviewer_notes) ? "is-dup" : ""}">
      <div class="a-queue-main">
        <div class="a-queue-title"><a href="/admin/events/${e.id}">${e.title}</a> <span class="a-pill">${e.status.replace("_", " ")}</span> <span class="a-pill a-pill-src">${e.source}</span>${e.trusted ? html` <span class="a-pill a-pill-good">trusted organizer</span>` : ""}</div>
        <div class="a-muted">${fmtDateShort(e.start_at)}, ${fmtTimeRange(e.start_at, e.end_at)} &middot; ${e.org_name || "no organizer"} &middot; ${e.venue_name || "no venue"} &middot; ${e.format}</div>
        <p>${e.description_short || ""}</p>
        ${e.reviewer_notes ? html`<p class="a-warn">${e.reviewer_notes}</p>` : ""}
        ${e.submitted_by_name ? html`<p class="a-muted">From ${e.submitted_by_name} &lt;${e.submitted_by_email}&gt;</p>` : ""}
        ${e.registration_url ? html`<a href="${e.registration_url}" target="_blank" rel="noopener">${e.registration_url}</a>` : ""}
      </div>
      <form class="a-queue-actions" method="post" action="/admin/events/${e.id}">
        <input type="hidden" name="quick" value="1">
        <button class="a-btn a-btn-good" name="action" value="publish">Publish</button>
        <a class="a-btn" href="/admin/events/${e.id}">Edit</a>
        <button class="a-btn a-btn-danger" name="action" value="reject">Reject</button>
      </form>
    </li>`)}</ul>` : html`<p class="a-muted">The queue is empty.</p>`}`;
  return page(adminShell({ title: `Review queue (${results.length})`, body, path: "/admin/review", user: data.user }));
}
