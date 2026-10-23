import { json } from "../_lib/html.js";

// Venue reader. POST JSON { urls: [...] } (up to 10). Each event page is fetched server side and its schema.org Event
// data (JSON-LD) is read for the venue name, street address and attendance mode. Meetup, Luma, Eventbrite and The
// Events Calendar sites all publish it. Nothing is written; the caller decides what to apply.
const UA = "Mozilla/5.0 (compatible; TheWatchBot/1.0; +https://bettersecurity.ai/about)";
const MAX = 10;

function ldBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); out.push(...(Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j])); } catch { /* skip malformed blocks */ }
  }
  return out;
}
const isEvent = (x) => x && /Event$/.test([].concat(x["@type"] || "").join(" "));
function addressText(a) {
  if (!a) return null;
  if (typeof a === "string") return a.trim() || null;
  const parts = [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(" ")].map((s) => String(s || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function onRequestPost({ request }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u) => /^https?:\/\//.test(u)).slice(0, MAX);
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (!r.ok) return { url, error: `HTTP ${r.status}` };
      const html = await r.text();
      const ev = ldBlocks(html).find(isEvent);
      if (!ev) return { url, found: false };
      const locs = [].concat(ev.location || []);
      const place = locs.find((l) => l && (l["@type"] === "Place" || l.address)) || null;
      const virtual = locs.some((l) => l && l["@type"] === "VirtualLocation");
      return { url, found: true, name: place ? String(place.name || "").trim() || null : null, address: place ? addressText(place.address) : null,
        mode: String(ev.eventAttendanceMode || "").split("/").pop() || null, virtual, start: ev.startDate || null };
    } catch (e) { return { url, error: String(e && e.message || e).slice(0, 80) }; }
  }));
  return json({ ok: true, results });
}
