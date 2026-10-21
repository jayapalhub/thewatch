import { upcomingEvents } from "../_lib/events.js";
import { json } from "../_lib/html.js";
import { CITIES, eventPath } from "../_lib/constants.js";

// Partner feed: a plain JSON list of published upcoming events.
export async function onRequestGet({ env, params }) {
  const city = CITIES[params.city];
  if (!city) return json({ error: "Calendar not found" }, 404);
  const events = await upcomingEvents(env.DB, { city: city.slug, limit: 300 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const items = events.map((e) => ({
    id: e.id, title: e.title, url: `${siteUrl}${eventPath(e)}`,
    organizer: e.org_name || null, start_at: e.start_at, end_at: e.end_at, timezone: e.timezone,
    format: e.format, venue: e.venue_display || null, address: e.venue_address_display || null,
    registration_url: e.registration_url || null, cost_type: e.cost_type, cost_min: e.cost_min, cost_max: e.cost_max,
    cpe_eligible: !!e.cpe_eligible, cpe_hours: e.cpe_hours, topics: e.topics, summary: e.description_short || null,
    discount_code: e.discount_code || null, discount_terms: e.discount_code ? e.discount_text || null : null,
  }));
  return json({ source: `${city.title} by Better Security`, generated_at: new Date().toISOString(), events: items }, 200, { "Cache-Control": "public, max-age=900", "Access-Control-Allow-Origin": "*" });
}
