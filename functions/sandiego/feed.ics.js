import { upcomingEvents } from "../_lib/events.js";
import { icsDocument } from "../_lib/calendar.js";

export async function onRequestGet({ env }) {
  const events = await upcomingEvents(env.DB, { limit: 300 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  return new Response(icsDocument(events, siteUrl), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
}
