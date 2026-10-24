import { recordTrap } from "../_lib/clicks.js";

// The hidden trap link from the Sunday email (see trapLink in clicks.js). No person sees it, so a request here marks
// the client as a scanner for that issue. It answers with a redirect to the site like every other /go link.
export async function onRequestGet({ request, env, waitUntil }) {
  const issue = parseInt(new URL(request.url).searchParams.get("i") || "", 10) || null;
  const log = recordTrap(env.DB, env, request, issue).catch((err) => console.error("trap log failed", err && err.message));
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(`${env.SITE_URL || "https://bettersecurity.ai"}/`, 302);
}
export const onRequestHead = onRequestGet;
