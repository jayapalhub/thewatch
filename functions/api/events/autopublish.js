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

// POST /api/events/autopublish: publish every pending row whose hold has passed.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const r = await runAutoPublish(context.env.DB);
  const reminders = await runReminders(context.env).catch((e) => ({ error: e && e.message }));
  const jobs = await runJobMaintenance(context.env.DB).catch((e) => ({ error: e && e.message }));
  const referrals = await runReferralThanks(context.env).catch((e) => ({ error: e && e.message }));
  const boards = await runAllJobSources(context.env.DB, { max: 4 }).catch((e) => [{ error: e && e.message }]); // one Workday board an hour, or a few of the cheaper API boards; each board is read about weekly
  // Whatever the board run left of the request budget goes to daily feed pulls (a few requests each) and then to
  // sweep target change detection (one request each), so a cheap hour does more and a Workday hour does less.
  const left = Math.max(0, 44 - (typeof boards.spent === "number" ? boards.spent : 40));
  const feeds = left >= 6 ? await runAllSources(context.env.DB, { dueOnly: true, max: Math.min(3, Math.floor(left / 6)) }).catch((e) => [{ error: e && e.message }]) : [];
  const feedCost = (feeds.length || 0) * 6;
  const targets = await refreshTargets(context.env.DB, { max: Math.min(8, Math.max(0, left - feedCost)) }).catch((e) => ({ error: e && e.message }));
  const linkedin = await runLinkedInSchedule(context.env).catch((e) => ({ error: e && e.message })); // Monday and Thursday page posts
  const digest = await runMondayDigest(context.env).catch((e) => ({ error: e && e.message })); // Monday numbers to Jerome, once a week
  return json({ success: true, ...r, reminders, jobs, referrals, boards, feeds, targets, linkedin, digest });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
