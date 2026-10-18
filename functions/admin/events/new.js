import { html, page, redirect, readForm } from "../../_lib/html.js";
import { adminShell, eventForm, flash } from "../../_lib/admin.js";
import { parseEventForm, insertEvent } from "../../_lib/admin-events.js";

async function lookups(db) {
  const [{ results: orgs }, { results: venues }] = await Promise.all([db.prepare("SELECT id, name FROM organizations ORDER BY name").all(), db.prepare("SELECT id, name FROM venues ORDER BY name").all()]);
  return { orgs, venues };
}
export async function onRequestGet({ env, data }) {
  const { orgs, venues } = await lookups(env.DB);
  return page(adminShell({ title: "Add event", body: eventForm({ status: "published", source: "manual" }, orgs, venues, { action: "/admin/events/new", isNew: true }), path: "/admin/events", user: data.user }));
}
export async function onRequestPost({ request, env, data }) {
  const p = await readForm(request);
  const { row, error } = parseEventForm(p);
  if (error) { const { orgs, venues } = await lookups(env.DB); return page(adminShell({ title: "Add event", body: html`${flash(error, "err")}${eventForm(row || p, orgs, venues, { action: "/admin/events/new", isNew: true })}`, path: "/admin/events", user: data.user }), 400); }
  if (p.action === "publish") { row.status = "published"; row.published_at = new Date().toISOString(); }
  const clash = await env.DB.prepare("SELECT id FROM events WHERE slug=?").bind(row.slug).first();
  if (clash) row.slug += "-" + Math.random().toString(36).slice(2, 6);
  const id = await insertEvent(env.DB, row);
  return redirect(`/admin/events/${id}?msg=Saved`);
}
