import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAllSources } from "../../_lib/feeds.js";
import { runAllJobSources } from "../../_lib/job-sources.js";

// POST /api/feeds/pull        pulls every active source
// POST /api/feeds/pull?id=3   pulls one source
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const id = parseInt(new URL(context.request.url).searchParams.get("id") || "", 10) || null;
  const results = await runAllSources(context.env.DB, { onlyId: id });
  const added = results.reduce((a, r) => a + r.added, 0);
  // The jobs sweep rides the same Thursday run (skipped when one event feed was asked for by id).
  const jobs = id ? [] : await runAllJobSources(context.env.DB).catch((e) => [{ error: e && e.message }]);
  return json({ success: true, added, results, jobs });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
