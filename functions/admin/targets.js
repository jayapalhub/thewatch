import { json, readForm, str } from "../_lib/html.js";
import { refreshTargets } from "../_lib/sweep-targets.js";

// POST /admin/targets action=refresh [max=40]: run change detection over the next batch of unchecked or stale
// sweep targets. The hourly job only does a handful per run (it shares the request budget with boards and feeds),
// so a backlog, such as the 500 targets added by the city launches, is cleared by calling this a few times.
export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  if (str(p.action) !== "refresh") return json({ ok: false, error: "unknown action" }, 400);
  const max = Math.min(45, Math.max(1, parseInt(str(p.max), 10) || 40));
  const r = await refreshTargets(env.DB, { max });
  const left = await env.DB.prepare("SELECT count(*) n FROM sweep_targets WHERE active=1 AND has_feed=0 AND url LIKE 'http%' AND content_checked_at IS NULL").first();
  return json({ ok: true, ...r, unchecked_left: left ? left.n : null });
}
