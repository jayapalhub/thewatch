import { html, page, raw, readForm, redirect, str } from "../_lib/html.js";
import { adminShell, flash } from "../_lib/admin.js";

const STATUSES = ["new", "replied", "call_booked", "proposal_sent", "won", "lost"];
export async function onRequestGet({ request, env, data }) {
  const { results } = await env.DB.prepare("SELECT * FROM sponsor_inquiries ORDER BY created_at DESC LIMIT 300").all();
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  ${results.length ? results.map((s) => html`
  <div class="a-inquiry">
    <div><strong>${s.company}</strong> &middot; ${s.contact_name || ""} ${s.role_title ? html`(${s.role_title})` : ""} &middot; <a href="mailto:${s.email}">${s.email}</a><br><small>${s.created_at} &middot; interest: ${s.interest || "n/a"} &middot; budget: ${s.budget_range || "n/a"}</small>
      <p>${s.message || ""}</p></div>
    <form method="post" class="a-inline"><input type="hidden" name="id" value="${s.id}"><select name="status">${STATUSES.map((x) => html`<option value="${x}" ${x === s.status ? raw("selected") : ""}>${x.replace("_", " ")}</option>`)}</select><button class="a-btn">Update</button></form>
  </div>`) : html`<p class="a-muted">No sponsor inquiries yet.</p>`}`;
  return page(adminShell({ title: "Sponsor inquiries", body, path: "/admin/sponsors", user: data.user }));
}
export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const id = parseInt(str(p.id), 10); const status = STATUSES.includes(str(p.status)) ? str(p.status) : "new";
  if (id) await env.DB.prepare("UPDATE sponsor_inquiries SET status=? WHERE id=?").bind(status, id).run();
  return redirect("/admin/sponsors?msg=Updated");
}
