import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAllJobSources } from "../../_lib/job-sources.js";

// POST /api/jobs/sweep[?id=N]: read the employer boards now. Auth as the other admin endpoints.
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const id = parseInt(new URL(context.request.url).searchParams.get("id") || "", 10) || null;
  const runs = await runAllJobSources(context.env.DB, { onlyId: id });
  return json({ success: true, added: runs.reduce((a, r) => a + (r.added || 0), 0), runs });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
