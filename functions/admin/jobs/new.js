import { page, readForm, redirect } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { html } from "../../_lib/html.js";
import { jobForm, parseJobForm, resolveEmployer } from "../../_lib/admin-jobs.js";
import { defaultExpiry } from "../../_lib/jobs.js";

async function orgs(db) { return (await db.prepare("SELECT name FROM organizations ORDER BY name").all()).results; }

export async function onRequestGet({ env, data }) {
  return page(adminShell({ title: "Add a role", body: jobForm({ status: "published" }, await orgs(env.DB), { action: "/admin/jobs/new", isNew: true }), path: "/admin/jobs", user: data.user }));
}

export async function onRequestPost({ request, env, data }) {
  const p = await readForm(request);
  const { row, error } = parseJobForm(p);
  if (error) return page(adminShell({ title: "Add a role", body: html`${flash(error, "err")}${jobForm(p, await orgs(env.DB), { action: "/admin/jobs/new", isNew: true })}`, path: "/admin/jobs", user: data.user }), 400);
  const dup = await env.DB.prepare("SELECT id FROM jobs WHERE url=? AND status IN ('pending_review','published','draft')").bind(row.url).first();
  if (dup) return redirect(`/admin/jobs/${dup.id}?msg=${encodeURIComponent("That posting URL is already listed")}`);
  const emp = await resolveEmployer(env.DB, row.employer, { note: "Created from Admin > Jobs" });
  const published = row.status === "published";
  const r = await env.DB.prepare(`INSERT INTO jobs (city, organization_id, employer_name, title, url, location, remote, seniority, topics, salary_text, posted_at, expires_at, featured_until, status, hold,
      posted_by_name, posted_by_title, posted_by_url, posted_by_kind, posted_by_date, reviewer_notes, source, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,'manual',?)`)
    .bind(row.city, emp.id, row.employer, row.title, row.url, row.location, row.remote, row.seniority, row.topics, row.salary_text, row.posted_at,
      row.expires_at || (published ? defaultExpiry() : null), row.featured_until, row.status,
      row.posted_by_name, row.posted_by_title, row.posted_by_url, row.posted_by_kind, row.posted_by_date, row.reviewer_notes, published ? new Date().toISOString() : null).run();
  return redirect(`/admin/jobs/${r.meta.last_row_id}?msg=${encodeURIComponent(published ? "Added and live" : "Added")}`);
}
