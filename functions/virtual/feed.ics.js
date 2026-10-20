import { queryEvents } from "../_lib/events.js";
import { icsDocument } from "../_lib/calendar.js";
import { nowLocalIso } from "../_lib/dates.js";

export async function onRequestGet({ env }) {
  const events = await queryEvents(env.DB, { city: "virtual", from: nowLocalIso(), limit: 500 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  return new Response(icsDocument(events, siteUrl, "The Watch Virtual"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
}
