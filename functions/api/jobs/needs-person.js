import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { needsPerson } from "../../_lib/coverage.js";

// GET /api/jobs/needs-person: the roles that still need a person named, for the weekday LinkedIn search.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN, like the other admin endpoints.
export async function onRequestGet(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const roles = await needsPerson(context.env.DB);
  return json({ success: true, count: roles.length, roles }, 200, { "Cache-Control": "no-store" });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
