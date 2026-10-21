import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAutoPublish } from "../../_lib/autopublish.js";

// POST /api/events/autopublish: publish every pending row whose hold has passed.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const r = await runAutoPublish(context.env.DB);
  return json({ success: true, ...r });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
