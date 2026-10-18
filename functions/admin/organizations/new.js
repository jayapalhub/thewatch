import { page, redirect, readForm, str, slugify } from "../../_lib/html.js";
import { adminShell, orgForm } from "../../_lib/admin.js";
import { parseOrgForm, insertOrg } from "../../_lib/admin-orgs.js";

export async function onRequestGet({ data }) {
  return page(adminShell({ title: "Add organizer", body: orgForm({}, { action: "/admin/organizations/new", isNew: true }), path: "/admin/organizations", user: data.user }));
}
export async function onRequestPost({ request, env }) {
  const row = parseOrgForm(await readForm(request));
  if (!row.name) return redirect("/admin/organizations/new?msg=Name+required");
  const clash = await env.DB.prepare("SELECT id FROM organizations WHERE slug=?").bind(row.slug).first();
  if (clash) row.slug += "-" + Math.random().toString(36).slice(2, 5);
  const id = await insertOrg(env.DB, row);
  return redirect(`/admin/organizations/${id}?msg=Saved`);
}
