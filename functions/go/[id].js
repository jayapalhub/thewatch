import { eventPath } from "../_lib/constants.js";
import { eventById } from "../_lib/events.js";
import { recordClick } from "../_lib/clicks.js";

// Click tracked redirect used by the newsletter and the site.
// /go/123?t=register  -> organizer registration page
// /go/123?t=page      -> our event page
// &i=<issue id> attributes the click to a newsletter issue; &s=<click token> to a subscriber who has personalization on.
// Every request is redirected; recordClick decides whether it counts (see clicks.js).
export async function onRequestGet({ params, request, env, waitUntil }) {
  const id = parseInt(params.id, 10);
  const url = new URL(request.url);
  const t = url.searchParams.get("t") === "page" ? "page" : "register";
  const issue = parseInt(url.searchParams.get("i") || "", 10) || null;
  const e = Number.isFinite(id) ? await eventById(env.DB, id) : null;
  if (!e) return Response.redirect(`${env.SITE_URL || ""}/sandiego`, 302);
  const target = t === "register" && e.registration_url ? e.registration_url : `${env.SITE_URL || ""}${eventPath(e)}`;
  const log = recordClick(env.DB, env, request, { listing: `event:${e.id}`, target: t, targetUrl: target, eventId: e.id, issueId: issue, city: e.city }).catch((err) => console.error("click log failed", err && err.message));
  if (typeof waitUntil === "function") waitUntil(log); else await log;
  return Response.redirect(target, 302);
}
export const onRequestHead = onRequestGet;
