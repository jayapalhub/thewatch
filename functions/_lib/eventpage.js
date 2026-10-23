// Reads an event page's schema.org Event data (JSON-LD) for the venue and whether the event is online. Meetup, Luma,
// Eventbrite and The Events Calendar sites publish it. Used by the feed importer when a feed leaves the venue out, and by
// /admin/venuetest.
const UA = "Mozilla/5.0 (compatible; TheWatchBot/1.0; +https://bettersecurity.ai/about)";

function ldBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); out.push(...(Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j])); } catch { /* skip malformed blocks */ }
  }
  return out;
}
const isEvent = (x) => x && /Event$/.test([].concat(x["@type"] || "").join(" "));
// Meetup repeats the town and state inside streetAddress and appends "USA"; keep each part once.
export function addressText(a) {
  if (!a) return null;
  const raw = typeof a === "string" ? a : [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(" ")].join(",");
  const out = [];
  for (const p of String(raw).split(",").map((s) => s.trim()).filter((s) => s && s !== "USA" && s !== "US")) {
    if (out.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
    if (/^[A-Z]{2}$/.test(p) && out.some((x) => new RegExp(`\\b${p}(\\s+\\d{5})?$`).test(x))) continue;
    out.push(p);
  }
  return out.length ? out.join(", ") : null;
}
export function parseEventPage(html) {
  const ev = ldBlocks(html).find(isEvent);
  if (!ev) return null;
  const locs = [].concat(ev.location || []);
  const place = locs.find((l) => l && (l["@type"] === "Place" || l.address)) || null;
  const mode = String(ev.eventAttendanceMode || "").split("/").pop() || null;
  const online = mode === "OnlineEventAttendanceMode" || (!place && locs.some((l) => l && l["@type"] === "VirtualLocation"));
  return { name: place ? String(place.name || "").trim() || null : null, address: place ? addressText(place.address) : null, online, mode, start: ev.startDate || null };
}
export async function readEventPage(url, fetcher = fetch) {
  const r = await fetcher(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseEventPage(await r.text());
}
