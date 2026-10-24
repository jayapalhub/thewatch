// Logos and initials for roles people post about.
//
// Employer logos come from the employer's own website: the square app icon nearly every site publishes for phones
// (apple-touch-icon) or a sized icon, fetched by /logo/<organization slug> on our own domain and cached for a week, so
// no third party sees visitors and nothing is copied from LinkedIn. When a site has no usable icon the route returns a
// small badge with the company's initials instead, so a broken image never shows.
//
// People get a colored circle with their initials, never a photo (decided 2026-10-23: no profile photos).

const SKIP = new Set(["the", "of", "and", "for", "a", "an", "inc", "inc.", "llc", "ltd", "co", "co.", "corp", "corp.", "corporation", "company", "group", "&"]);

// "Michael Brewer" -> "MB", "Encore Capital Group" -> "EC", "KLDiscovery" -> "K". Letters only, at most two.
export function initialsOf(name) {
  const words = String(name || "").replace(/\(.*?\)/g, " ").split(/[\s,]+/).filter((w) => w && !SKIP.has(w.toLowerCase()));
  const letters = words.map((w) => (w.match(/\p{L}/u) || [""])[0]).filter(Boolean);
  if (!letters.length) return "?";
  return (letters.length === 1 ? letters[0] : letters[0] + letters[letters.length > 2 ? 1 : letters.length - 1]).toUpperCase();
}

// A stable hue per name, so the same person or company always gets the same color.
export function hueOf(name) {
  let h = 0; for (const c of String(name || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// The fallback logo: the company's initials on a colored rounded square. White text on a 40 percent lightness
// background reads at better than 4.5:1.
export function initialsSvg(name) {
  const text = escXml(initialsOf(name));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88" role="img" aria-label="${escXml(name)}"><rect width="88" height="88" rx="18" fill="hsl(${hueOf(name)} 45% 36%)"/><text x="44" y="44" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${text.length > 1 ? 34 : 40}" font-weight="700" fill="#fff">${text}</text></svg>`;
}

// The best icon a page offers, as an absolute URL: an apple-touch-icon (largest first), then an SVG icon, then a PNG
// icon of 48 pixels or more. Plain favicons are left out on purpose: at 16 or 32 pixels they look blurry at our size,
// and the initials badge looks better.
export function findIcon(html, pageUrl) {
  const found = [];
  for (const tag of String(html || "").match(/<link\b[^>]*>/gi) || []) {
    const attr = (n) => (new RegExp(`\\b${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag) || []).slice(2).find((v) => v !== undefined);
    const rel = String(attr("rel") || "").toLowerCase(), href = attr("href");
    if (!href || !/icon/.test(rel)) continue;
    let url; try { url = new URL(href, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const size = Math.max(0, ...String(attr("sizes") || "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    const svg = /\.svg(\?|$)/i.test(url.pathname) || /svg/i.test(String(attr("type") || ""));
    const apple = /apple-touch-icon/.test(rel);
    let score = -1;
    if (apple) score = 1000 + (size || 180);
    else if (svg) score = 900;
    else if (size >= 48) score = 500 + size;
    if (score >= 0) found.push({ url: url.toString(), score });
  }
  found.sort((a, b) => b.score - a.score);
  return found.length ? found[0].url : null;
}

const MAX_BYTES = 300 * 1024;
async function limitedFetch(fetcher, url, accept) {
  const r = await fetcher(url, { headers: { "User-Agent": "TheWatchBot/1.0 (+https://bettersecurity.ai/about)", Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(6000), cf: { cacheTtl: 86400 } });
  if (!r || !r.ok) return null;
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return null;
  return r;
}

// Fetches the employer's logo from its own website. Returns { body, type } or null.
export async function fetchLogo(website, fetcher = fetch) {
  let home;
  try { home = new URL(/^https?:\/\//i.test(String(website || "")) ? website : `https://${website}`); } catch { return null; }
  if (!website || !/^https?:$/.test(home.protocol)) return null;
  home.protocol = "https:";
  const candidates = [];
  try {
    const page = await limitedFetch(fetcher, home.toString(), "text/html");
    if (page) {
      const html = (await page.text()).slice(0, 400000);
      const icon = findIcon(html, page.url || home.toString());
      if (icon) candidates.push(icon);
    }
  } catch { /* the site may block us; try the conventional icon path */ }
  candidates.push(new URL("/apple-touch-icon.png", home).toString());
  for (const url of candidates) {
    try {
      const r = await limitedFetch(fetcher, url, "image/*");
      if (!r) continue;
      const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) continue;
      const body = await r.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_BYTES) continue;
      return { body, type };
    } catch { /* next candidate */ }
  }
  return null;
}

// Logo responses carry a locked down policy: an SVG from an employer's site is shown as an image on our pages, and
// even opened directly it can run nothing.
export const LOGO_HEADERS = {
  "Cache-Control": "public, max-age=604800",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
};
