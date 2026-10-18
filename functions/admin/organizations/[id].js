import { html, page, redirect, readForm, notFound } from "../../_lib/html.js";
import { adminShell, orgForm, flash } from "../../_lib/admin.js";
import { parseOrgForm, updateOrg } from "../../_lib/admin-orgs.js";
import { fmtDateShort } from "../../_lib/dates.js";

export async function onRequestGet({ params, request, env, data }) {
  const o = await env.DB.prepare("SELECT * FROM organizations WHERE id=?").bind(params.id).first();
  if (!o) return notFound();
  const { results: evs } = await env.DB.prepare("SELECT id, title, start_at, status FROM events WHERE organization_id=? ORDER BY start_at DESC LIMIT 30").bind(o.id).all();
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}${orgForm(o, { action: `/admin/organizations/${o.id}` })}
  <h2>Events</h2>
  <table class="a-table"><tbody>${evs.map((e) => html`<tr><td class="a-nowrap">${fmtDateShort(e.start_at)}</td><td><a href="/admin/events/${e.id}">${e.title}</a></td><td><span class="a-pill a-pill-${e.status}">${e.status.replace("_", " ")}</span></td></tr>`)}</tbody></table>
  <p><a class="a-btn" href="/admin/events/new">Add an event for this organizer</a></p>`;
  return page(adminShell({ title: o.name, body, path: "/admin/organizations", user: data.user }));
}
export async function onRequestPost({ params, request, env }) {
  const id = parseInt(params.id, 10);
  const p = await readForm(request);
  if (p.action === "delete") { await env.DB.prepare("UPDATE events SET organization_id=NULL WHERE organization_id=?").bind(id).run(); await env.DB.prepare("DELETE FROM organizations WHERE id=?").bind(id).run(); return redirect("/admin/organizations?msg=Deleted"); }
  const row = parseOrgForm(p);
  const clash = await env.DB.prepare("SELECT id FROM organizations WHERE slug=? AND id!=?").bind(row.slug, id).first();
  if (clash) row.slug += "-" + Math.random().toString(36).slice(2, 5);
  await updateOrg(env.DB, id, row);
  return redirect(`/admin/organizations/${id}?msg=Saved`);
}
