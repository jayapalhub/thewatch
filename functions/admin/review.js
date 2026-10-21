import { html, page, raw } from "../_lib/html.js";
import { adminShell, flash, clashNotice } from "../_lib/admin.js";
import { findClashes } from "../_lib/clashes.js";
import { fmtDateShort, fmtTimeRange } from "../_lib/dates.js";

export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results } = await env.DB.prepare(`SELECT e.*, o.name org_name, o.trusted FROM events e LEFT JOIN organizations o ON o.id=e.organization_id WHERE e.status IN ('pending_review','draft') ORDER BY e.hold DESC, COALESCE(e.auto_publish_at, '9999') ASC, e.created_at DESC`).all();
  const clashes = await findClashes(env.DB, results);
  const held = results.filter((e) => e.hold || !e.auto_publish_at).length;
  const body = html`${flash(msg)}
  <p class="a-muted">Rows publish themselves when their timer runs out unless you hold or reject them. ${held ? html`<strong>${held}</strong> need a decision from you; the rest are a courtesy preview.` : "Nothing is waiting on you."} </p>
  ${results.length ? html`<ul class="a-queue">${results.map((e) => html`
    <li class="a-queue-item ${clashes.has(e.id) ? "has-clash " : ""}${e.reviewer_notes && /duplicate/i.test(e.reviewer_notes) ? "is-dup" : ""}">
      <div class="a-queue-main">
        <div class="a-queue-title"><a href="/admin/events/${e.id}">${e.title}</a> <span class="a-pill">${e.status.replace("_", " ")}</span> <span class="a-pill a-pill-src">${e.source}</span>${e.trusted ? html` <span class="a-pill a-pill-good">trusted organizer</span>` : ""}${e.hold ? html` <span class="a-pill a-pill-warn">held, needs you</span>` : e.auto_publish_at ? html` <span class="a-pill">auto publishes ${e.auto_publish_at.slice(0, 16)} UTC</span>` : html` <span class="a-pill a-pill-warn">waiting for you</span>`}</div>
        <div class="a-muted">${fmtDateShort(e.start_at)}, ${fmtTimeRange(e.start_at, e.end_at)} &middot; ${e.org_name || "no organizer"} &middot; ${e.venue_name || "no venue"} &middot; ${e.format}</div>
        <p>${e.description_short || ""}</p>
        ${clashNotice(clashes.get(e.id))}
        ${e.reviewer_notes ? html`<p class="a-warn">${e.reviewer_notes}</p>` : ""}
        ${e.submitted_by_name ? html`<p class="a-muted">From ${e.submitted_by_name} &lt;${e.submitted_by_email}&gt;</p>` : ""}
        ${e.registration_url ? html`<a href="${e.registration_url}" target="_blank" rel="noopener">${e.registration_url}</a>` : ""}
      </div>
      <form class="a-queue-actions" method="post" action="/admin/events/${e.id}">
        <input type="hidden" name="quick" value="1">
        <button class="a-btn a-btn-good" name="action" value="publish">Publish now</button>
        <a class="a-btn" href="/admin/events/${e.id}">Edit</a>
        ${e.hold || !e.auto_publish_at ? html`<button class="a-btn" name="action" value="release">Release (publish in 24h)</button>` : html`<button class="a-btn" name="action" value="hold">Hold</button>`}
        <button class="a-btn a-btn-danger" name="action" value="reject">Reject</button>
      </form>
    </li>`)}</ul>` : html`<p class="a-muted">The queue is empty.</p>`}`;
  return page(adminShell({ title: `Review queue (${results.length})`, body, path: "/admin/review", user: data.user }));
}
