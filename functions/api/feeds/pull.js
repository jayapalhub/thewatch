import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAllSources } from "../../_lib/feeds.js";

// POST /api/feeds/pull        pulls every active source
// POST /api/feeds/pull?id=3   pulls one source
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const id = parseInt(new URL(context.request.url).searchParams.get("id") || "", 10) || null;
  const results = await runAllSources(context.env.DB, { onlyId: id });
  const added = results.reduce((a, r) => a + r.added, 0);
  return json({ success: true, added, results });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
