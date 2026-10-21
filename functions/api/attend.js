import { json, readForm, str } from "../_lib/html.js";
import { eventById } from "../_lib/events.js";
import { tokenFromCookie, subscriberByToken, eventStarted, markAttended } from "../_lib/cpe.js";

// Mark attended from an event page. The subscriber comes from the HttpOnly watch_pt cookie that /profile sets;
// SameSite=Lax keeps other sites from posting here on someone's behalf.
const fmt = (h) => (h == null ? null : h);

export async function onRequestGet({ request, env }) {
  const sub = await subscriberByToken(env.DB, tokenFromCookie(request));
  const id = parseInt(new URL(request.url).searchParams.get("event") || "", 10);
  if (!sub || !id) return json({ signedIn: !!sub, attended: false }, 200, { "Cache-Control": "private, no-store" });
  const a = await env.DB.prepare("SELECT hours FROM event_attendance WHERE subscriber_id=? AND event_id=?").bind(sub.id, id).first();
  return json({ signedIn: true, attended: !!a, hours: a ? fmt(a.hours) : null }, 200, { "Cache-Control": "private, no-store" });
}

export async function onRequestPost({ request, env }) {
  const sub = await subscriberByToken(env.DB, tokenFromCookie(request));
  if (!sub) return json({ success: false, error: "Open your profile link from any Watch email first, then try again." }, 401);
  const p = await readForm(request);
  const e = await eventById(env.DB, parseInt(str(p.event, 12), 10));
  if (!e || e.status !== "published") return json({ success: false, error: "That event is not on the calendar." }, 404);
  if (!eventStarted(e)) return json({ success: false, error: "You can mark it attended once it has started." }, 400);
  const row = await markAttended(env.DB, sub.id, e, "event_page");
  return json({ success: true, hours: fmt(row.hours), message: row.hours != null ? `Added to your CPE log with ${row.hours} hour${row.hours === 1 ? "" : "s"}.` : "Added to your CPE log. The organizer didn't report hours, so set them in your log." });
}
