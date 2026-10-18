import { upcomingEvents } from "./_lib/events.js";

export async function onRequestGet({ env }) {
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const events = await upcomingEvents(env.DB, { limit: 500 });
  const { results: orgs } = await env.DB.prepare("SELECT slug FROM organizations").all();
  const urls = ["/", "/sandiego", "/events", "/events/padel-social-2027", "/submit", "/sponsor", "/subscribe", "/about", "/privacy", "/terms"]
    .concat(events.map((e) => `/sandiego/events/${e.slug}`), orgs.map((o) => `/sandiego/organizers/${o.slug}`));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${u}</loc></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}
