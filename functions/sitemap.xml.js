import { upcomingEvents } from "./_lib/events.js";
import { CITIES, eventPath, SHOW_BS_EVENTS } from "./_lib/constants.js";

export async function onRequestGet({ env }) {
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const cities = Object.keys(CITIES);
  const events = (await Promise.all(cities.concat("virtual").map((c) => upcomingEvents(env.DB, { city: c, limit: 500 })))).flat();
  const { results: orgs } = await env.DB.prepare("SELECT slug, default_city FROM organizations").all();
  const { results: sentIssues } = await env.DB.prepare("SELECT city, week_start FROM issues WHERE status='sent'").all();
  const urls = ["/", ...cities.map((c) => `/${c}`), ...cities.map((c) => `/${c}/issues`), ...cities.map((c) => `/${c}/organizers`), ...sentIssues.map((i) => `/${i.city}/issues/${i.week_start}`), "/virtual", ...(SHOW_BS_EVENTS ? ["/events", "/events/padel-social-2027"] : []), "/submit", "/sponsor", "/subscribe", "/about", "/privacy", "/terms"]
    .concat(events.map(eventPath), orgs.map((o) => `/${CITIES[o.default_city] ? o.default_city : "sandiego"}/organizers/${o.slug}`));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${u}</loc></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
}
