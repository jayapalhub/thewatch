import { html, page, readForm, redirect, notFound } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { jobForm, parseJobForm, resolveEmployer } from "../../_lib/admin-jobs.js";
import { jobById, defaultExpiry } from "../../_lib/jobs.js";
import { todayKey } from "../../_lib/dates.js";

async function orgs(db) { return (await db.prepare("SELECT name FROM organizations ORDER BY name").all()).results; }

export async function onRequestGet({ params, request, env, data }) {
  const j = await jobById(env.DB, parseInt(params.id, 10));
  if (!j) return notFound();
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
    <p class="a-muted">#${j.id} &middot; ${j.status.replace("_", " ")} &middot; source ${j.source} &middot; created ${j.created_at}${j.published_at ? ` · published ${j.published_at}` : ""} &middot; apply clicks ${j.apply_clicks}${j.last_checked_at ? ` · URL last checked ${j.last_checked_at}` : ""}${j.closed_reason ? ` · ${j.closed_reason}` : ""}</p>
    ${j.submitted_by_email ? html`<p class="a-muted">Submitted by ${j.submitted_by_name || ""} &lt;${j.submitted_by_email}&gt;</p>` : ""}
    ${jobForm(j, await orgs(env.DB), { action: `/admin/jobs/${j.id}` })}`;
  return page(adminShell({ title: j.title, body, path: "/admin/jobs", user: data.user }));
}

export async function onRequestPost({ params, request, env, data }) {
  const id = parseInt(params.id, 10);
  const before = await jobById(env.DB, id);
  if (!before) return notFound();
  const p = await readForm(request);
  if (String(p.action) === "delete") { await env.DB.prepare("DELETE FROM jobs WHERE id=?").bind(id).run(); return redirect("/admin/jobs?msg=Deleted"); }
  const { row, error } = parseJobForm(p);
  if (error) return page(adminShell({ title: before.title, body: html`${flash(error, "err")}${jobForm({ ...before, ...p }, await orgs(env.DB), { action: `/admin/jobs/${id}` })}`, path: "/admin/jobs", user: data.user }), 400);
  const emp = await resolveEmployer(env.DB, row.employer, { note: "Created from Admin > Jobs" });
  const goingLive = row.status === "published" && before.status !== "published";
  await env.DB.prepare(`UPDATE jobs SET city=?, organization_id=?, employer_name=?, title=?, url=?, location=?, remote=?, seniority=?, topics=?, salary_text=?, posted_at=?, expires_at=?, featured_until=?, status=?,
      posted_by_name=?, posted_by_title=?, posted_by_url=?, posted_by_kind=?, posted_by_date=?, reviewer_notes=?,
      hold=CASE WHEN ?='published' THEN 0 ELSE hold END, published_at=CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE published_at END,
      closed_reason=CASE WHEN ?='published' THEN NULL ELSE closed_reason END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
    .bind(row.city, emp.id, row.employer, row.title, row.url, row.location, row.remote, row.seniority, row.topics, row.salary_text, row.posted_at,
      goingLive && (!row.expires_at || row.expires_at < todayKey()) ? defaultExpiry() : row.expires_at || before.expires_at, row.featured_until, row.status,
      row.posted_by_name, row.posted_by_title, row.posted_by_url, row.posted_by_kind, row.posted_by_date, row.reviewer_notes,
      row.status, goingLive ? 1 : 0, row.status, id).run();
  return redirect(`/admin/jobs/${id}?msg=${encodeURIComponent(goingLive ? "Saved and live" : "Saved")}`);
}
