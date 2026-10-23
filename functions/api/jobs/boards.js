import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAllJobSources } from "../../_lib/job-sources.js";
import { recordRun, flushUsage } from "../../_lib/ops.js";

// POST /api/jobs/boards: read the employer job boards that are due, and nothing else.
// The hourly tick reads boards for its last 40 seconds, which on 2026-10-23 came to about four boards an hour; 788 active
// boards on a two day cycle need about sixteen. The cron Worker calls this at :20 and :40 so the boards get two more
// 45 second windows each hour without making the hourly run any longer.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const boards = await runAllJobSources(context.env.DB, { max: 12, budget: 300, deadline: Date.now() + 45000 }).catch((e) => [{ error: e && e.message }]);
  await recordRun(context.env.DB, "boards", true, `boards ${Array.isArray(boards) ? boards.length : 0}`);
  await flushUsage(context.env.DB, { force: true });
  return json({ success: true, boards });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
