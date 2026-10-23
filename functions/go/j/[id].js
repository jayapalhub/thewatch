import { sha256 } from "../../_lib/html.js";
import { cleanJobUrl } from "../../_lib/jobs.js";
import { CITIES } from "../../_lib/constants.js";
import { clickSubscriberId } from "../../_lib/clicks.js";

async function findJob(env, params) {
  const id = parseInt(params.id, 10);
  return Number.isFinite(id) ? await env.DB.prepare("SELECT id, url, city, status FROM jobs WHERE id=?").bind(id).first().catch(() => null) : null;
}

function logClick(env, request, j, issue) {
  return (async () => {
    try {
      await env.DB.prepare("UPDATE jobs SET apply_clicks = apply_clicks + 1 WHERE id=?").bind(j.id).run();
      const uaHash = (await sha256(request.headers.get("user-agent") || "")).slice(0, 16);
      const subscriberId = await clickSubscriberId(env.DB, request);
      await env.DB.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash, subscriber_id) VALUES (NULL,?,?,?,?,?,?)").bind(issue, "job", j.url, (request.headers.get("referer") || "").slice(0, 300), uaHash, subscriberId).run();
    } catch (err) { console.error("job click log failed", err && err.message); }
  })();
}

// Click tracked apply link: /go/j/<job id>?i=<issue id>. Redirects only to the role's saved posting URL.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const j = await findJob(env, params);
  // Only a published role redirects out. Anything held, rejected, expired or closed goes to the jobs page instead,
  // so the link can never be used to bounce people to an unreviewed URL.
  const target = j && j.status === "published" ? cleanJobUrl(j.url) : null;
  if (!target) return Response.redirect(`${site}/${j && CITIES[j.city] ? j.city + "/jobs" : ""}`, 302);
  const issue = parseInt(new URL(request.url).searchParams.get("i") || "", 10) || null;
  const log = logClick(env, request, j, issue);
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(target, 302);
}

// The apply button on a role's own page links straight to the employer's posting, so the page shows the real
// destination, and counts the click with the link's ping attribute, which browsers send here as a POST.
export async function onRequestPost({ params, request, env, waitUntil }) {
  const j = await findJob(env, params);
  if (j && j.status === "published") {
    const log = logClick(env, request, j, null);
    if (typeof waitUntil === "function") waitUntil(log); else await log;
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
