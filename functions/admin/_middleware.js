import { requireAdmin } from "../_lib/auth.js";

export async function onRequest(context) {
  const user = await requireAdmin(context);
  if (!user) return new Response("Sign in through Cloudflare Access to use the admin.", { status: 401, headers: { "Content-Type": "text/plain" } });
  context.data.user = user;
  // Every admin change is a POST. Refuse one that a browser says came from another site, so a page elsewhere
  // cannot submit admin forms with Jerome's Access session.
  const m = context.request.method;
  if (m !== "GET" && m !== "HEAD") {
    const site = context.request.headers.get("sec-fetch-site");
    const origin = context.request.headers.get("origin");
    const host = new URL(context.request.url).host;
    let crossOrigin = site === "cross-site";
    if (!crossOrigin && origin && origin !== "null") { try { crossOrigin = new URL(origin).host !== host; } catch { crossOrigin = true; } }
    if (crossOrigin) return new Response("Cross-site form submission refused.", { status: 403, headers: { "Content-Type": "text/plain" } });
  }
  const resp = await context.next();
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}
