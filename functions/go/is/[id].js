import { sha256 } from "../../_lib/html.js";
import { clickSubscriberId } from "../../_lib/clicks.js";

// Click tracked link for the sponsor block set on an individual issue. /go/is/<issue id>
// Redirects only to that issue's saved sponsor URL and logs the click as target 'sponsor'.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const issue = Number.isFinite(id) ? await env.DB.prepare("SELECT id, sponsor_url FROM issues WHERE id=?").bind(id).first() : null;
  if (!issue || !/^https?:\/\//.test(issue.sponsor_url || "")) return Response.redirect(`${site}/sponsor`, 302);
  const log = (async () => {
    try {
      const uaHash = (await sha256(request.headers.get("user-agent") || "")).slice(0, 16);
      const subscriberId = await clickSubscriberId(env.DB, request);
      await env.DB.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash, subscriber_id) VALUES (NULL,?,?,?,?,?,?)")
        .bind(issue.id, "sponsor", issue.sponsor_url, (request.headers.get("referer") || "").slice(0, 300), uaHash, subscriberId).run();
    } catch (err) { console.error("issue sponsor click log failed", err && err.message); }
  })();
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(issue.sponsor_url, 302);
}
