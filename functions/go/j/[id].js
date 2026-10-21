import { sha256 } from "../../_lib/html.js";

// Click tracked apply link: /go/j/<job id>?i=<issue id>. Redirects only to the role's saved posting URL.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const j = Number.isFinite(id) ? await env.DB.prepare("SELECT id, url, city FROM jobs WHERE id=?").bind(id).first().catch(() => null) : null;
  if (!j || !/^https?:\/\//.test(j.url || "")) return Response.redirect(`${site}/`, 302);
  const issue = parseInt(new URL(request.url).searchParams.get("i") || "", 10) || null;
  const log = (async () => {
    try {
      await env.DB.prepare("UPDATE jobs SET apply_clicks = apply_clicks + 1 WHERE id=?").bind(j.id).run();
      const uaHash = (await sha256(request.headers.get("user-agent") || "")).slice(0, 16);
      await env.DB.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash) VALUES (NULL,?,?,?,?,?)").bind(issue, "job", j.url, (request.headers.get("referer") || "").slice(0, 300), uaHash).run();
    } catch (err) { console.error("job click log failed", err && err.message); }
  })();
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(j.url, 302);
}
