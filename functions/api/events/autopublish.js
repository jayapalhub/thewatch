import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAutoPublish } from "../../_lib/autopublish.js";
import { runReminders } from "../../_lib/reminders.js";
import { runJobMaintenance } from "../../_lib/jobs.js";
import { runReferralThanks } from "../../_lib/referrals.js";
import { runAllJobSources } from "../../_lib/job-sources.js";
import { runLinkedInSchedule } from "../../_lib/linkedin.js";
import { runMondayDigest } from "../../_lib/digest.js";
import { refreshTargets } from "../../_lib/sweep-targets.js";
import { runAllSources } from "../../_lib/feeds.js";
import { recordRun, checkBudget, flushUsage } from "../../_lib/ops.js";

// POST /api/events/autopublish: publish every pending row whose hold has passed.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const r = await runAutoPublish(context.env.DB);
  const reminders = await runReminders(context.env).catch((e) => ({ error: e && e.message }));
  const jobs = await runJobMaintenance(context.env.DB).catch((e) => ({ error: e && e.message }));
  const referrals = await runReferralThanks(context.env).catch((e) => ({ error: e && e.message }));
  // Feeds and sweep target change detection run before the job boards and get fixed shares, so a slow or failing board
  // cannot starve them. Eight feeds an hour reads every feed source daily; twelve targets an hour rehashes every sweep
  // target about every two and a half days.
  const feeds = await runAllSources(context.env.DB, { dueOnly: true, max: 8 }).catch((e) => [{ error: e && e.message }]);
  const targets = await refreshTargets(context.env.DB, { max: 12 }).catch((e) => ({ error: e && e.message }));
  // Record the run before the boards, so the health check sees the publish, feed and target work even if the boards
  // run long. Two runs on 2026-10-23 were cut off about 110 seconds in, before the final record, so the boards now stop
  // starting new reads 40 seconds after they begin and the whole run stays well inside that.
  await recordRun(context.env.DB, "hourly", true, `published ${r.published || 0}, feeds ${feeds.length || 0}, boards running`);
  const boards = await runAllJobSources(context.env.DB, { max: 12, budget: 300, deadline: Date.now() + 40000 }).catch((e) => [{ error: e && e.message }]);
  const linkedin = await runLinkedInSchedule(context.env).catch((e) => ({ error: e && e.message })); // Monday and Thursday page posts
  const digest = await runMondayDigest(context.env).catch((e) => ({ error: e && e.message })); // Monday numbers to Jerome, once a week
  const usage = await checkBudget(context.env, context.env.DB);
  await recordRun(context.env.DB, "hourly", true, `published ${r.published || 0}, boards ${Array.isArray(boards) ? boards.length : 0}, feeds ${feeds.length || 0}`);
  await flushUsage(context.env.DB, { force: true });
  return json({ success: true, ...r, reminders, jobs, referrals, boards, feeds, targets, linkedin, digest, usage });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
