import { upcomingEvents } from "../_lib/events.js";
import { json } from "../_lib/html.js";

// Partner feed: a plain JSON list of published upcoming events.
export async function onRequestGet({ env }) {
  const events = await upcomingEvents(env.DB, { limit: 300 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const items = events.map((e) => ({
    id: e.id, title: e.title, url: `${siteUrl}/sandiego/events/${e.slug}`,
    organizer: e.org_name || null, start_at: e.start_at, end_at: e.end_at, timezone: e.timezone,
    format: e.format, venue: e.venue_display || null, address: e.venue_address_display || null,
    registration_url: e.registration_url || null, cost_type: e.cost_type, cost_min: e.cost_min, cost_max: e.cost_max,
    cpe_eligible: !!e.cpe_eligible, cpe_hours: e.cpe_hours, topics: e.topics, summary: e.description_short || null,
  }));
  return json({ source: "The Watch San Diego by Better Security", generated_at: new Date().toISOString(), events: items }, 200, { "Cache-Control": "public, max-age=900", "Access-Control-Allow-Origin": "*" });
}
