import { html, page, raw } from "../_lib/html.js";
import { adminShell, flash, clashNotice } from "../_lib/admin.js";
import { findClashes } from "../_lib/clashes.js";
import { fmtDateShort, fmtTimeRange, fmtUtcLocal } from "../_lib/dates.js";

export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results } = await env.DB.prepare(`SELECT e.*, o.name org_name, o.trusted FROM events e LEFT JOIN organizations o ON o.id=e.organization_id WHERE e.status='pending_review' ORDER BY e.hold DESC, COALESCE(e.auto_publish_at, '9999') ASC, e.created_at DESC`).all();
  const clashes = await findClashes(env.DB, results);
  const jobsWaiting = await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE status='pending_review' AND (hold=1 OR auto_publish_at IS NULL)").first().catch(() => ({ n: 0 }));
  const held = results.filter((e) => e.hold || !e.auto_publish_at).length;
  // Drafts are rows Jerome parked on purpose (an event not yet announced); they are listed, not counted as decisions.
  const { results: drafts } = await env.DB.prepare("SELECT id, title, start_at FROM events WHERE status='draft' ORDER BY start_at").all();
  const body = html`${flash(msg)}${jobsWaiting.n ? html`<p class="a-warn">${jobsWaiting.n} job post${jobsWaiting.n === 1 ? " is" : "s are"} waiting in <a href="/admin/jobs">Jobs</a>.</p>` : ""}
  <p class="a-muted">Rows publish themselves when their timer runs out unless you hold or reject them. ${held ? html`<strong>${held}</strong> need a decision from you; the rest are a courtesy preview.` : "Nothing is waiting on you."} </p>
  ${results.length ? html`<ul class="a-queue">${results.map((e) => html`
    <li class="a-queue-item ${clashes.has(e.id) ? "has-clash " : ""}${e.reviewer_notes && /duplicate/i.test(e.reviewer_notes) ? "is-dup" : ""}">
      <div class="a-queue-main">
        <div class="a-queue-title"><a href="/admin/events/${e.id}">${e.title}</a> <span class="a-pill">${e.status.replace("_", " ")}</span> <span class="a-pill a-pill-src">${e.source}</span>${e.trusted ? html` <span class="a-pill a-pill-good">trusted organizer</span>` : ""}${e.hold ? html` <span class="a-pill a-pill-warn">held, needs you</span>` : e.auto_publish_at ? html` <span class="a-pill">auto publishes ${fmtUtcLocal(e.auto_publish_at)}</span>` : html` <span class="a-pill a-pill-warn">waiting for you</span>`}</div>
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
    </li>`)}</ul>` : html`<p class="a-muted">The queue is empty.</p>`}
  ${drafts.length ? html`<h2>Parked drafts</h2><p class="a-muted">Events you are holding back on purpose. They never publish on their own and are not counted above.</p>
  <ul class="a-list">${drafts.map((d) => html`<li><a href="/admin/events/${d.id}">${d.title}</a> <span class="a-muted">${fmtDateShort(d.start_at)}</span></li>`)}</ul>` : ""}`;
  return page(adminShell({ title: `Review queue (${results.length})`, body, path: "/admin/review", user: data.user }));
}
