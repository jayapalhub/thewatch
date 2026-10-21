import { sha256 } from "../../_lib/html.js";

// Click tracked redirect for the sponsor slot. /go/s/<sponsor id>?p=page|email&c=<city>&i=<issue id>
// Only sends people to the sponsor's own saved URL, never to a URL taken from the query string.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const u = new URL(request.url);
  const placement = u.searchParams.get("p") === "email" ? "email" : "page";
  const city = (u.searchParams.get("c") || "").replace(/[^a-z]/g, "").slice(0, 30) || null;
  const issue = parseInt(u.searchParams.get("i") || "", 10) || null;
  const s = Number.isFinite(id) ? await env.DB.prepare("SELECT id, url FROM sponsors WHERE id=?").bind(id).first().catch(() => null) : null;
  const site = env.SITE_URL || "https://bettersecurity.ai";
  if (!s || !/^https?:\/\//.test(s.url || "")) return Response.redirect(`${site}/sponsor`, 302);
  const log = (async () => {
    try {
      const uaHash = (await sha256(request.headers.get("user-agent") || "")).slice(0, 16);
      await env.DB.prepare("INSERT INTO sponsor_clicks (sponsor_id, placement, city, issue_id, ua_hash) VALUES (?,?,?,?,?)").bind(s.id, placement, city, issue, uaHash).run();
    } catch (err) { console.error("sponsor click log failed", err && err.message); }
  })();
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(s.url, 302);
}
