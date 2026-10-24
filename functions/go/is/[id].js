import { recordClick } from "../../_lib/clicks.js";

// Click tracked link for the sponsor block set on an individual issue. /go/is/<issue id>
// Redirects only to that issue's saved sponsor URL and logs the click as target 'sponsor'.
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const issue = Number.isFinite(id) ? await env.DB.prepare("SELECT id, sponsor_url, city FROM issues WHERE id=?").bind(id).first() : null;
  if (!issue || !/^https?:\/\//.test(issue.sponsor_url || "")) return Response.redirect(`${site}/sponsor`, 302);
  const log = recordClick(env.DB, env, request, { listing: `issue:${issue.id}`, target: "sponsor", targetUrl: issue.sponsor_url, issueId: issue.id, city: issue.city || null }).catch((err) => console.error("issue sponsor click log failed", err && err.message));
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(issue.sponsor_url, 302);
}
export const onRequestHead = onRequestGet;
