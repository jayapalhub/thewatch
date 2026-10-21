import { html, page, redirect, readForm, notFound } from "../../_lib/html.js";
import { adminShell, eventForm, flash, clashNotice } from "../../_lib/admin.js";
import { findClashes } from "../../_lib/clashes.js";
import { parseEventForm, updateEvent, setStatus, notifySubmitter } from "../../_lib/admin-events.js";
import { eventById } from "../../_lib/events.js";

async function lookups(db) {
  const [{ results: orgs }, { results: venues }] = await Promise.all([db.prepare("SELECT id, name FROM organizations ORDER BY name").all(), db.prepare("SELECT id, name FROM venues ORDER BY name").all()]);
  return { orgs, venues };
}
export async function onRequestGet({ params, request, env, data }) {
  const e = await eventById(env.DB, params.id);
  if (!e) return notFound();
  const { orgs, venues } = await lookups(env.DB);
  const clashes = await findClashes(env.DB, [e]);
  const rem = await env.DB.prepare("SELECT status, COUNT(*) n FROM reminders WHERE event_id=? GROUP BY status").bind(e.id).all().catch(() => ({ results: [] }));
  const clicks = await env.DB.prepare("SELECT target, COUNT(*) n FROM link_clicks WHERE event_id=? GROUP BY target").bind(e.id).all();
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
    <p class="a-muted">#${e.id} &middot; ${e.status.replace("_", " ")} &middot; created ${e.created_at}${e.published_at ? ` &middot; published ${e.published_at}` : ""} &middot; clicks: ${clicks.results.map((c) => `${c.target} ${c.n}`).join(", ") || "none yet"} &middot; reminders: ${rem.results.map((x) => `${x.n} ${x.status}`).join(", ") || "none"}</p>
    ${clashNotice(clashes.get(e.id))}
    ${eventForm(e, orgs, venues, { action: `/admin/events/${e.id}` })}`;
  return page(adminShell({ title: e.title, body, path: "/admin/events", user: data.user }));
}
export async function onRequestPost({ params, request, env, data, waitUntil }) {
  const id = parseInt(params.id, 10);
  const before = await eventById(env.DB, id);
  if (!before) return notFound();
  const p = await readForm(request);
  const action = String(p.action || "save");
  if (action === "delete") { await env.DB.prepare("DELETE FROM events WHERE id=?").bind(id).run(); return redirect("/admin/events?msg=Deleted"); }
  if (p.quick === "1") { // from the review queue: status only
    if (action === "hold") { await env.DB.prepare("UPDATE events SET hold=1 WHERE id=?").bind(id).run(); return redirect(`/admin/review?msg=${encodeURIComponent("Held: " + before.title)}`); }
    if (action === "release") { await env.DB.prepare("UPDATE events SET hold=0, auto_publish_at=datetime('now', '+24 hours') WHERE id=?").bind(id).run(); return redirect(`/admin/review?msg=${encodeURIComponent("Publishes in 24 hours: " + before.title)}`); }
    const status = action === "publish" ? "published" : action === "reject" ? "rejected" : null;
    if (!status) return redirect("/admin/review");
    await setStatus(env.DB, id, status);
    const n = notifySubmitter(env, { ...before, status }, status); if (waitUntil) waitUntil(n); else await n;
    return redirect(`/admin/review?msg=${encodeURIComponent((status === "published" ? "Published: " : "Rejected: ") + before.title)}`);
  }
  const { row, error } = parseEventForm(p);
  if (error) { const { orgs, venues } = await lookups(env.DB); return page(adminShell({ title: before.title, body: html`${flash(error, "err")}${eventForm({ ...before, ...p }, orgs, venues, { action: `/admin/events/${id}` })}`, path: "/admin/events", user: data.user }), 400); }
  if (action === "publish") row.status = "published";
  if (action === "reject") row.status = "rejected";
  if (row.slug !== before.slug) { const clash = await env.DB.prepare("SELECT id FROM events WHERE slug=? AND id!=?").bind(row.slug, id).first(); if (clash) row.slug += "-" + Math.random().toString(36).slice(2, 6); }
  await updateEvent(env.DB, id, row);
  if (row.status === "published" && before.status !== "published") { await setStatus(env.DB, id, "published"); const n = notifySubmitter(env, { ...before, ...row }, "published"); if (waitUntil) waitUntil(n); else await n; }
  if (row.status === "rejected" && before.status !== "rejected") { const n = notifySubmitter(env, { ...before, ...row }, "rejected"); if (waitUntil) waitUntil(n); else await n; }
  return redirect(`/admin/events/${id}?msg=${encodeURIComponent(action === "publish" ? "Saved and published" : "Saved")}`);
}
