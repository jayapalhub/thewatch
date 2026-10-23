import { json } from "../_lib/html.js";

// Sponsor event probe, used by research passes over the Hub's Sponsors tab. POST a JSON body
// { sites: ["https://vendor.com", ...], pages?: ["https://vendor.com/events", ...] } with up to 10 entries.
// For each site it loads the home page, picks up to three same-company links that look like events pages
// (events, webinars, roadshows, tours, summits, dinners), loads them, and returns short text snippets where one of
// our city names sits near a date. Explicit pages are loaded as given. It reads public pages only, never signs in,
// never writes to the database, and returns snippets rather than whole pages so a pass over 800 vendors stays small.
// Pages built entirely in JavaScript come back with no text; the caller reads those in a browser instead.
const TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (compatible; TheWatchBot/1.0; +https://bettersecurity.ai/about)";
const LINK_RE = /(^|[\/_.-])(events?|webinars?|roadshows?|world-?tour|tour|on-?tour|summits?|meetups?|dinners?|happy-?hours?|lunch|forums?|conferences?|live)([\/_.?#-]|$)/i;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RE = new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}\\s+${MONTH}\\b|\\b\\d{1,2}[\\/.]\\d{1,2}[\\/.](?:20)?2[67]\\b|\\b202[67]-\\d\\d-\\d\\d\\b`, "i");
// Extra names people use for our metros, beyond each city's own name.
const ALIASES = {
  sandiego: ["San Diego", "Carlsbad", "La Jolla"], losangeles: ["Los Angeles", "Santa Monica", "Irvine", "Pasadena", "Culver City", "Beverly Hills"],
  sanjose: ["San Jose", "Santa Clara", "Palo Alto", "Mountain View", "Sunnyvale", "Silicon Valley"], sanfrancisco: ["San Francisco", "Bay Area"],
  orangecounty: ["Orange County", "Newport Beach", "Costa Mesa", "Anaheim"], newyork: ["New York", "NYC", "Manhattan"],
  washington: ["Washington, DC", "Washington DC", "Washington D.C.", "Arlington, VA", "Tysons", "Reston", "McLean", "Bethesda"],
  dallas: ["Dallas", "Fort Worth", "Irving", "Plano", "Frisco"], minneapolis: ["Minneapolis", "St. Paul", "Twin Cities", "Bloomington, MN"],
  saltlake: ["Salt Lake", "Lehi", "Provo"], phoenix: ["Phoenix", "Scottsdale", "Tempe", "Chandler", "Tucson"], boston: ["Boston", "Cambridge, MA", "Waltham", "Worcester"], kansascity: ["Kansas City", "Overland Park"], stlouis: ["St. Louis", "Saint Louis"], tampa: ["Tampa", "St. Petersburg"],
  raleigh: ["Raleigh", "Durham", "Research Triangle", "Cary, NC"], miami: ["Miami", "Fort Lauderdale", "Boca Raton"],
};

function textOf(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|h\d|tr|section|article|br)>/gi, " | ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "-").replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}
function baseDomain(host) { const p = host.replace(/^www\./, "").split("."); return p.slice(-2).join("."); }
async function get(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: 3600 } });
    if (!r.ok) return { status: r.status, url: r.url };
    const ct = r.headers.get("content-type") || "";
    if (!/html/.test(ct)) return { status: r.status, url: r.url, skipped: ct.slice(0, 40) };
    return { status: r.status, url: r.url, html: (await r.text()).slice(0, 250000) };
  } catch (e) { return { status: 0, url, error: String(e && e.message || e).slice(0, 80) }; }
}
function eventLinks(html, pageUrl) {
  const out = new Map(); let base; try { base = new URL(pageUrl); } catch { return []; }
  const bd = baseDomain(base.host); const baseKey = base.toString().replace(/\/$/, "");
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi; let m; let n = 0;
  while ((m = re.exec(html)) && n++ < 1500) {
    const href = m[1];
    const label = html.slice(re.lastIndex, re.lastIndex + 160).replace(/<[^>]+>/g, " ").toLowerCase();
    if (!LINK_RE.test(href) && !/\b(events?|webinars?|roadshow|world tour|on tour|summit|dinner|meet us)\b/.test(label.split("</a")[0])) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || /\.(pdf|png|jpe?g|zip|mp4)$/i.test(u.pathname)) continue;
    if (baseDomain(u.host) !== bd) continue;
    const path = u.pathname.toLowerCase();
    if (/\/(blog|news|press|careers|jobs|privacy|legal|terms)\b/.test(path) && !/event/.test(path)) continue;
    u.hash = ""; const key = u.toString().replace(/\/$/, "");
    if (key === baseKey) continue;
    const score = (/event/.test(path) ? 3 : 0) + (/roadshow|tour|dinner|happy|lunch|summit/.test(path) ? 2 : 0) + (/webinar/.test(path) ? -1 : 0) - path.split("/").length * 0.1;
    if (!out.has(key) || out.get(key) < score) out.set(key, score);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
function snippets(text, cityRe, slugOf) {
  const found = []; const seen = new Set(); cityRe.lastIndex = 0; let m;
  while ((m = cityRe.exec(text)) && found.length < 10) {
    const w = text.slice(Math.max(0, m.index - 170), m.index + m[0].length + 170);
    if (!DATE_RE.test(w) || /\b2025\b/.test(w) && !/\b202[67]\b/.test(w)) continue;
    const key = w.slice(150, 230); if (seen.has(key)) continue; seen.add(key);
    found.push({ city: slugOf(m[0]), text: w });
  }
  return found;
}


// Places mode: every US "City, ST" (or "City, State") that sits near a date between Oct 23 2026 and Apr 30 2027.
// Used to see which cities outside our calendars get the most sponsor events.
const STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };
const ABBR = new Set([...Object.values(STATES), "DC"]);
const PLACE_RE = new RegExp(`\\b((?:[A-Z][A-Za-z.'-]+ ){0,2}[A-Z][A-Za-z.'-]+),\\s+(${[...ABBR].join("|")}|${Object.keys(STATES).join("|")})\\b`, "g");
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MD_RE = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(202[5-7]))?`, "gi");
function inWindow(mo, d, y) {
  if (!y) y = (mo > 10 || (mo === 10 && d >= 23)) ? 2026 : (mo <= 4 ? 2027 : 0);
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return iso >= "2026-10-23" && iso <= "2027-04-30" ? iso : null;
}
function placesOf(text) {
  const out = []; const seen = new Set(); PLACE_RE.lastIndex = 0; let m;
  while ((m = PLACE_RE.exec(text)) && out.length < 60) {
    const st = STATES[m[2]] || m[2];
    let city = m[1].replace(/^(?:In|At|Join|Us|The|And|Of|From|Event|Events|Location|Venue|Where|Live|Hotel|Center|Downtown)\s+/i, "");
    if (/^(Inc|LLC|Ltd|Suite|Floor|Corp|Street|St|Ave|Road|Rd|Blvd)$/i.test(city)) continue;
    const ws = Math.max(0, m.index - 140); const w = text.slice(ws, m.index + m[0].length + 140);
    const at = m.index - ws, end = at + m[0].length;
    MD_RE.lastIndex = 0; let d, best = null, bestDist = 1e9;
    while ((d = MD_RE.exec(w))) {
      const dist = d.index >= end ? d.index - end : d.index + d[0].length <= at ? at - (d.index + d[0].length) + 5 : 0;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    if (!best) continue;
    const iso = inWindow(MON[best[1].slice(0, 3).toLowerCase()], Number(best[2]), best[3] ? Number(best[3]) : 0);
    if (!iso) continue;
    const key = city.toLowerCase() + "," + st + "," + iso; if (seen.has(key)) continue; seen.add(key);
    out.push({ p: `${city}, ${st}`, d: iso });
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const sites = (Array.isArray(body.sites) ? body.sites : []).filter((u) => /^https?:\/\//.test(u)).slice(0, 10);
  const pages = (Array.isArray(body.pages) ? body.pages : []).filter((u) => /^https?:\/\//.test(u)).slice(0, 10);
  const perSite = Math.max(1, Math.min(3, Number(body.per_site) || 3));
  if (body.mode === "places") {
    const out = [];
    for (const pg of pages.slice(0, 8)) { const p = await get(pg); out.push({ page: pg, status: p.status, places: p.html ? placesOf(textOf(p.html)) : [] }); }
    return json({ ok: true, results: out });
  }
  const { results: cities } = await env.DB.prepare("SELECT slug, name FROM cities WHERE active=1").all();
  const nameTo = [];
  for (const c of cities) for (const n of new Set([c.name, ...(ALIASES[c.slug] || [])])) nameTo.push([n.toLowerCase().replace(/\s+/g, " "), c.slug]);
  const cityRe = new RegExp(`\\b(?:${nameTo.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
  const slugOf = (s) => { const k = s.toLowerCase().replace(/\s+/g, " "); const hit = nameTo.find(([n]) => n === k); return hit ? hit[1] : k; };
  const cityRes = [cityRe, slugOf];
  const out = [];
  for (const site of sites) {
    const home = await get(site);
    const row = { site, status: home.status, final: home.url, links: [], pages: [] };
    if (home.html) {
      const links = eventLinks(home.html, home.url || site);
      row.links = links.slice(0, 8);
      row.pages.push({ url: home.url, hits: snippets(textOf(home.html), ...cityRes) });
      for (const l of links.slice(0, perSite)) {
        const p = await get(l);
        const t = p.html ? textOf(p.html) : "";
        row.pages.push({ url: l, status: p.status, chars: t.length, hits: t ? snippets(t, ...cityRes) : [] });
      }
    } else if (home.error) row.error = home.error;
    out.push(row);
  }
  for (const pg of pages) {
    const p = await get(pg);
    const t = p.html ? textOf(p.html) : "";
    out.push({ page: pg, status: p.status, final: p.url, chars: t.length, links: p.html ? eventLinks(p.html, p.url || pg).slice(0, 8) : [], hits: t ? snippets(t, ...cityRes) : [] });
  }
  return json({ ok: true, results: out });
}
