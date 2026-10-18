import { html, page } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";

export async function onRequestGet({ request, env, data }) {
  const { results } = await env.DB.prepare(`SELECT o.*, (SELECT COUNT(*) FROM events e WHERE e.organization_id=o.id AND e.status='published') n_pub, (SELECT MAX(start_at) FROM events e WHERE e.organization_id=o.id AND e.status='published') last_ev FROM organizations o ORDER BY o.name`).all();
  const body = html`${flash(new URL(request.url).searchParams.get("msg"))}
  <p><a class="a-btn a-btn-primary" href="/admin/organizations/new">Add organizer</a></p>
  <table class="a-table"><thead><tr><th>Name</th><th>Type</th><th>Cadence</th><th>Published</th><th>Latest</th><th>Trusted</th></tr></thead><tbody>
  ${results.map((o) => html`<tr><td><a href="/admin/organizations/${o.id}">${o.name}</a><br><small>${o.slug}</small></td><td>${o.type}</td><td>${o.usual_cadence_text || ""}</td><td>${o.n_pub}</td><td class="a-nowrap">${(o.last_ev || "").slice(0, 10)}</td><td>${o.trusted ? "yes" : ""}</td></tr>`)}
  </tbody></table>`;
  return page(adminShell({ title: `Organizers (${results.length})`, body, path: "/admin/organizations", user: data.user }));
}
