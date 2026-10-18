import { eventById } from "../_lib/events.js";
import { sha256 } from "../_lib/html.js";

// Click tracked redirect used by the newsletter and the site.
// /go/123?t=register  -> organizer registration page
// /go/123?t=page      -> our event page
// &i=<issue id> attributes the click to a newsletter issue.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const url = new URL(request.url);
  const t = url.searchParams.get("t") === "page" ? "page" : "register";
  const issue = parseInt(url.searchParams.get("i") || "", 10) || null;
  const e = Number.isFinite(id) ? await eventById(env.DB, id) : null;
  if (!e) return Response.redirect(`${env.SITE_URL || ""}/sandiego`, 302);
  const target = t === "register" && e.registration_url ? e.registration_url : `${env.SITE_URL || ""}/sandiego/events/${e.slug}`;
  const ua = request.headers.get("user-agent") || "";
  const ref = request.headers.get("referer") || "";
  const log = (async () => {
    try {
      const uaHash = (await sha256(ua)).slice(0, 16);
      await env.DB.prepare("INSERT INTO link_clicks (event_id, issue_id, target, target_url, referrer, ua_hash) VALUES (?,?,?,?,?,?)")
        .bind(e.id, issue, t, target, ref.slice(0, 300), uaHash).run();
    } catch (err) { console.error("click log failed", err && err.message); }
  })();
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(target, 302);
}
