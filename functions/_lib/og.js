// Share card images (Open Graph), 1200 by 630, rendered on the fly with workers-og and cached a day.
import { ImageResponse } from "workers-og";
import { esc } from "./html.js";
import { fmtDateLong, fmtTimeRange } from "./dates.js";

const NAVY = "#071426", INK = "#0E1B2E", MUTED = "#5B6B80", SHIELD = "#1B4A8A", ELECTRIC = "#1FB6F0", PAPER = "#F4F7FB";
let fontCache = null;
// Fonts are served from the site itself (public/assets/fonts), so rendering has no outside dependency.
async function fonts(origin) {
  if (!fontCache) fontCache = Promise.all(["Manrope-Medium", "Manrope-ExtraBold"].map((f) => fetch(`${origin}/assets/fonts/${f}.ttf`).then((r) => { if (!r.ok) throw new Error(`font ${f} ${r.status}`); return r.arrayBuffer(); })))
    .then(([regular, bold]) => [{ name: "Manrope", data: regular, weight: 500, style: "normal" }, { name: "Manrope", data: bold, weight: 800, style: "normal" }])
    .catch((e) => { fontCache = null; throw e; });
  return fontCache;
}
const mark = `<div style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:12px;background:${ELECTRIC};"><div style="display:flex;width:22px;height:26px;background:${SHIELD};border-radius:4px 4px 11px 11px;"></div></div>`;
function pill(text, bg = "rgba(255,255,255,.12)", color = "#fff") { return `<div style="display:flex;padding:8px 16px;border-radius:999px;background:${bg};color:${color};font-size:22px;font-weight:800;">${esc(text)}</div>`; }
function clamp(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

function frame(inner, { kicker, brand }) {
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${NAVY};color:#fff;font-family:Manrope;padding:56px 64px;">
    <div style="display:flex;align-items:center;gap:16px;">${mark}<div style="display:flex;flex-direction:column;"><div style="display:flex;font-size:26px;font-weight:800;">The Watch</div><div style="display:flex;font-size:20px;color:${ELECTRIC};font-weight:800;">${esc(brand)}</div></div>
      <div style="display:flex;margin-left:auto;font-size:20px;color:rgba(255,255,255,.6);">${esc(kicker)}</div></div>
    ${inner}
    <div style="display:flex;margin-top:auto;font-size:20px;color:rgba(255,255,255,.55);">bettersecurity.ai</div>
  </div>`;
}

export async function eventCard(e, city) {
  const when = `${fmtDateLong(e.start_at)}${fmtTimeRange(e.start_at, e.end_at) ? ", " + fmtTimeRange(e.start_at, e.end_at) : ""}`;
  const where = e.format === "virtual" ? "Online" : [e.venue_display, e.neighborhood].filter(Boolean).join(", ");
  const pills = [];
  if (e.cpe_eligible) pills.push(pill(e.cpe_hours ? `${e.cpe_hours} CPE` : "CPE", ELECTRIC, NAVY));
  if (["free", "members_free"].includes(e.cost_type)) pills.push(pill(e.cost_type === "free" ? "Free" : "Free for members"));
  if (e.format === "virtual") pills.push(pill("Virtual")); else if (e.format === "hybrid") pills.push(pill("Hybrid"));
  const inner = `<div style="display:flex;flex-direction:column;margin-top:44px;gap:18px;">
    <div style="display:flex;font-size:${e.title.length > 70 ? 44 : 54}px;font-weight:800;line-height:1.12;">${esc(clamp(e.title, 110))}</div>
    <div style="display:flex;font-size:28px;color:${ELECTRIC};font-weight:800;">${esc(when)}</div>
    <div style="display:flex;font-size:26px;color:rgba(255,255,255,.8);">${esc(clamp([e.org_display, where].filter(Boolean).join("  ·  "), 90))}</div>
    ${pills.length ? `<div style="display:flex;gap:12px;margin-top:6px;">${pills.join("")}</div>` : ""}
  </div>`;
  return frame(inner, { kicker: city.slug === "virtual" ? "Live online" : city.region, brand: city.name });
}

export async function issueCard(issue, city, count) {
  const inner = `<div style="display:flex;flex-direction:column;margin-top:44px;gap:18px;">
    <div style="display:flex;font-size:24px;color:${ELECTRIC};font-weight:800;">The Sunday email · week of ${esc(issue.week_start)}</div>
    <div style="display:flex;font-size:${(issue.subject || "").length > 60 ? 44 : 54}px;font-weight:800;line-height:1.12;">${esc(clamp(issue.subject || "This week in security", 110))}</div>
    <div style="display:flex;font-size:26px;color:rgba(255,255,255,.8);">${esc(clamp(issue.preheader || `${count} events in ${city.name}, with a note from Jerome`, 110))}</div>
  </div>`;
  return frame(inner, { kicker: city.region, brand: city.name });
}

export async function cityCard(city, count, orgs) {
  const inner = `<div style="display:flex;flex-direction:column;margin-top:44px;gap:18px;">
    <div style="display:flex;font-size:56px;font-weight:800;line-height:1.1;">Every security event in ${esc(city.name)}, in one calendar.</div>
    <div style="display:flex;font-size:28px;color:rgba(255,255,255,.8);">${count} upcoming events from ${orgs} organizers${city.newsletter ? ", and a Sunday email" : ""}.</div>
    <div style="display:flex;gap:12px;margin-top:6px;">${pill("Chapters")}${pill("Meetups")}${pill("Summits")}${pill("CPE", ELECTRIC, NAVY)}</div>
  </div>`;
  return frame(inner, { kicker: city.slug === "virtual" ? "Live online, from anywhere" : city.region, brand: city.name });
}

export async function render(request, html, waitUntil) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = new ImageResponse(html, { width: 1200, height: 630, fonts: await fonts(new URL(request.url).origin), format: "png" });
  const out = new Response(await res.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
  if (waitUntil) waitUntil(cache.put(key, out.clone()));
  return out;
}
