import { json } from "../../_lib/html.js";
import { requireAdmin } from "../../_lib/auth.js";
import { newsletterTick, ensureIssue, sendPreview, upcomingWeekStart, localNow } from "../../_lib/dispatch.js";
import { CITIES } from "../../_lib/constants.js";

// POST /api/newsletter/tick: Saturday previews and Sunday sends, per city, idempotent.
// Auth: Cloudflare Access session or Authorization: Bearer ADMIN_TOKEN (cron worker).
export async function onRequestPost(context) {
  const user = await requireAdmin(context);
  if (!user) return json({ success: false, error: "unauthorized" }, 401);
  // ?preview=<city> forces the Saturday preview for the upcoming week right now (testing, or a second look).
  const force = new URL(context.request.url).searchParams.get("preview");
  if (force && CITIES[force]) {
    const city = CITIES[force];
    const issue = await ensureIssue(context.env.DB, city.slug, upcomingWeekStart(localNow(city.timezone).date));
    return json({ success: true, preview: await sendPreview(context.env, { ...issue, force_preview: true }, city), issue_id: issue.id });
  }
  return json({ success: true, results: await newsletterTick(context.env) });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
