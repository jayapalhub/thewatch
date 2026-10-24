// Admin > Jobs > Add a posted role: the quick way in for a role someone posted about publicly (see the standing rule in
// CLAUDE.md). The row publishes at once with no hold. If the employer's posting is already listed, the person is attached
// to that row instead of a duplicate; if the post itself is already listed, the admin is sent to that row.
import { html, page, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { postedForm, parsePostedForm, resolveEmployer } from "../../_lib/admin-jobs.js";
import { defaultExpiry } from "../../_lib/jobs.js";
import { todayKey } from "../../_lib/dates.js";

async function orgs(db) { return (await db.prepare("SELECT name FROM organizations ORDER BY name").all()).results; }
const view = (body, user, status = 200) => page(adminShell({ title: "Add a posted role", body, path: "/admin/jobs", user }), status);

export async function onRequestGet({ request, env, data }) {
  return view(html`${flash(new URL(request.url).searchParams.get("msg"))}${postedForm({}, await orgs(env.DB))}`, data.user);
}

export async function onRequestPost({ request, env, data }) {
  const p = await readForm(request);
  const db = env.DB;
  const { row, error } = parsePostedForm(p, todayKey());
  if (error) return view(html`${flash(error, "err")}${postedForm(p, await orgs(db))}`, data.user, 400);
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  const live = "status IN ('pending_review','published','draft')";
  // This post is already on this same role: nothing to add. One post often names several roles (a hiring manager
  // listing three openings), so the check is the post and the title together, not the post alone.
  const byPost = await db.prepare(`SELECT id FROM jobs WHERE posted_by_url=? AND lower(title)=lower(?) AND ${live} LIMIT 1`).bind(row.posted_by_url, row.title).first();
  if (byPost) return redirect(`/admin/jobs/${byPost.id}?msg=${encodeURIComponent("That post is already on this role")}`);
  // The employer's posting is already listed: attach the person to it, and publish it now if it was waiting.
  const existing = row.announced ? null : await db.prepare(`SELECT id, status FROM jobs WHERE url=? AND ${live} LIMIT 1`).bind(row.url).first();
  if (existing) {
    await db.prepare(`UPDATE jobs SET posted_by_name=?, posted_by_title=?, posted_by_role=?, posted_by_kind='employer', posted_by_url=?, posted_by_date=?, announced=0,
        status='published', hold=0, auto_publish_at=NULL, published_at=COALESCE(published_at, ${now}), expires_at=CASE WHEN expires_at IS NULL OR expires_at < date('now') THEN ? ELSE expires_at END,
        reviewer_notes=COALESCE(reviewer_notes,'') || ' ${str(row.posted_by_name).replace(/'/g, "''")} posted about this role; attached ' || date('now') || '.', updated_at=${now} WHERE id=?`)
      .bind(row.posted_by_name, row.posted_by_title, row.posted_by_role, row.posted_by_url, row.posted_by_date, defaultExpiry(), existing.id).run();
    return redirect(`/admin/jobs/${existing.id}?msg=${encodeURIComponent(`${row.posted_by_name} attached to the listed role${existing.status === "published" ? "" : ", which is now live"}`)}`);
  }
  const emp = await resolveEmployer(db, row.employer, { note: "Created from Admin > Jobs > Add a posted role" });
  const r = await db.prepare(`INSERT INTO jobs (city, organization_id, employer_name, title, url, location, remote, topics, expires_at, status, hold, auto_publish_at, published_at, source,
      posted_by_name, posted_by_title, posted_by_role, posted_by_kind, posted_by_url, posted_by_date, announced, reviewer_notes)
      VALUES (?,?,?,?,?,?,?,'[]',?,'published',0,NULL,?,'manual',?,?,?,'employer',?,?,?,?)`)
    .bind(row.city, emp.id, row.employer, row.title, row.url, row.location, row.remote || 'onsite', row.expires_at || defaultExpiry(), new Date().toISOString(),
      row.posted_by_name, row.posted_by_title, row.posted_by_role, row.posted_by_url, row.posted_by_date, row.announced,
      row.announced ? `Announced in a public post on ${row.posted_by_date}; no employer posting yet. Comes down ${row.expires_at} unless the posting appears.` : `From a public post on ${row.posted_by_date}.`).run();
  return redirect(`/admin/jobs/${r.meta.last_row_id}?msg=${encodeURIComponent(row.announced ? "Added and live as announced; add the employer's posting URL when it appears" : "Added and live")}`);
}
