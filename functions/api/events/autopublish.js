import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { runAutoPublish } from "../../_lib/autopublish.js";
import { runReminders } from "../../_lib/reminders.js";
import { runJobMaintenance } from "../../_lib/jobs.js";
import { runReferralThanks } from "../../_lib/referrals.js";
import { runAllJobSources } from "../../_lib/job-sources.js";

// POST /api/events/autopublish: publish every pending row whose hold has passed.
// Auth: Cloudflare Access session (from the admin) or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  const r = await runAutoPublish(context.env.DB);
  const reminders = await runReminders(context.env).catch((e) => ({ error: e && e.message }));
  const jobs = await runJobMaintenance(context.env.DB).catch((e) => ({ error: e && e.message }));
  const referrals = await runReferralThanks(context.env).catch((e) => ({ error: e && e.message }));
  const boards = await runAllJobSources(context.env.DB, { max: 1 }).catch((e) => [{ error: e && e.message }]); // one employer board an hour, each about weekly
  return json({ success: true, ...r, reminders, jobs, referrals, boards });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
