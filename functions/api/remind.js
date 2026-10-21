import { json, readForm, str, EMAIL_RE } from "../_lib/html.js";
import { rateLimited, upsertSubscriber } from "../_lib/subscribers.js";
import { requestReminder } from "../_lib/reminders.js";
import { eventById } from "../_lib/events.js";
import { CITIES, preferredCity } from "../_lib/constants.js";

// POST /api/remind: queue a one off reminder email for an event, optionally join the Sunday email too.
export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  if (str(p.website)) return json({ success: true, message: "Done." }); // honeypot
  const email = str(p.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ success: false, error: "Please enter a valid email address." }, 400);
  const id = parseInt(str(p.event, 12), 10);
  if (!id) return json({ success: false, error: "Something is off with this page. Reload and try again." }, 400);
  if (await rateLimited(env.DB, request, "remind", 20, 60)) return json({ success: false, error: "Too many requests from here. Try again in a bit." }, 429);
  try {
    const event = await eventById(env.DB, id);
    const r = await requestReminder(env.DB, { event, email, request });
    if (!r.ok) return json({ success: false, error: r.error }, r.status || 400);
    let joined = false, pending = false;
    // A virtual event belongs to no city: file the new subscriber under the city they were browsing.
    const city = CITIES[event.city] ? event.city : preferredCity(request);
    const live = (CITIES[city] || {}).newsletter === "sunday";
    if (p.join === "1" && !r.subscribed) {
      const row = await upsertSubscriber(env.DB, env, { email, source: `calendar:${city}`, tags: ["remind"], request, city });
      if (row.resubscribePending) pending = true;
      else {
        await env.DB.prepare("UPDATE reminders SET subscriber_id=(SELECT id FROM subscribers WHERE email=? AND status='active') WHERE event_id=? AND email=?").bind(email, event.id, email).run();
        joined = true;
      }
    }
    const base = r.sent ? "We already sent you a reminder for this one." : r.already ? "You already have a reminder set for this one." : "Done. We'll email you the morning before.";
    const extra = pending ? " That address unsubscribed from the Sunday email earlier, so we sent it a link to confirm before adding it back."
      : joined ? (live ? " You're also on the Sunday email now; check your inbox for a welcome note." : ` You're also on the list for The Watch ${(CITIES[city] || {}).name || ""}, which starts its Sunday email soon.`)
      : r.subscribed && p.join === "1" ? " You're already on the Sunday email." : "";
    return json({ success: true, message: `${base}${extra} Remember, a reminder is not registration, so register with the organizer to hold your spot.` });
  } catch (e) {
    console.error("remind failed", e && e.message);
    return json({ success: false, error: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
