import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { newsletterTick } from "../../_lib/dispatch.js";

// POST /api/newsletter/tick: Saturday previews and Sunday sends, per city, idempotent.
// Auth: Cloudflare Access session or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  return json({ success: true, results: await newsletterTick(context.env) });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
