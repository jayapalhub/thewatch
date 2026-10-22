import { upcomingEvents } from "../_lib/events.js";
import { icsDocument } from "../_lib/calendar.js";
import { CITIES } from "../_lib/constants.js";

export async function onRequestGet({ env, params }) {
  const city = CITIES[params.city];
  if (!city) return new Response("Not found", { status: 404 });
  const events = await upcomingEvents(env.DB, { city: city.slug, limit: 300 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  return new Response(icsDocument(events, siteUrl, city.title, city.timezone), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
}
