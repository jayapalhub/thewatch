import { CITIES, eventPath } from "../_lib/constants.js";
import { queryEvents, costLabel } from "../_lib/events.js";
import { todayKey, addDays, weekday3, month3, dayNum, fmtTime } from "../_lib/dates.js";

// Embeddable "This week on The Watch" for chapter and meetup sites. Two shapes under one route:
//   /embed/<city>.js  a loader that writes an iframe where the script tag sits (one line to paste)
//   /embed/<city>     the iframe content: the next six events, plain styling, links back to the calendar
// Everything links to the organizer's own event page on The Watch and to the subscribe page; no cookies, no tracking.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function onRequestGet({ params, env, request }) {
  const wantsJs = /\.js$/i.test(params.city);
  const slug = params.city.replace(/\.js$/i, "");
  const city = CITIES[slug];
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  if (!city) return new Response(wantsJs ? "/* The Watch: unknown city */" : "Not found", { status: 404, headers: { "Content-Type": wantsJs ? "text/javascript" : "text/plain" } });
  if (wantsJs) {
    const u = new URL(request.url); const n = Math.min(12, Math.max(3, parseInt(u.searchParams.get("n") || "6", 10) || 6));
    const js = `(function(){var s=document.currentScript||(function(){var a=document.getElementsByTagName("script");return a[a.length-1];})();var f=document.createElement("iframe");f.src=${JSON.stringify(`${siteUrl}/embed/${slug}?n=${n}`)};f.title=${JSON.stringify(`The Watch ${city.name}: upcoming security events`)};f.loading="lazy";f.style.cssText="width:100%;max-width:640px;height:"+(96+n*62)+"px;border:0;display:block;";f.setAttribute("referrerpolicy","no-referrer-when-downgrade");s.parentNode.insertBefore(f,s);window.addEventListener("message",function(e){if(e.origin===${JSON.stringify(siteUrl)}&&e.data&&e.data.watchEmbedHeight&&e.source===f.contentWindow){f.style.height=e.data.watchEmbedHeight+"px";}});})();`;
    return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  }
  const u = new URL(request.url); const n = Math.min(12, Math.max(3, parseInt(u.searchParams.get("n") || "6", 10) || 6));
  const today = todayKey(city.timezone);
  const events = (await queryEvents(db(env), { city: slug, from: `${today}T00:00`, to: `${addDays(today, 70)}T00:00`, limit: n })).slice(0, n);
  const rows = events.map((e) => `<li><a href="${esc(siteUrl + eventPath(e))}" target="_top"><span class="d">${weekday3(e.start_at)} ${month3(e.start_at)} ${dayNum(e.start_at)}</span><span class="t">${esc(e.title)}</span><span class="m">${esc([fmtTime(e.start_at), e.format === "virtual" ? "online" : (e.venue_display || ""), e.cpe_eligible ? (e.cpe_hours ? `${e.cpe_hours} CPE` : "CPE") : "", costLabel(e) && e.cost_type !== "unknown" ? costLabel(e) : ""].filter(Boolean).join(" · "))}</span></a></li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>The Watch ${esc(city.name)}</title>
<style>body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#0E1B2E;background:#fff}.w{border:1px solid #DCE4EE;border-radius:10px;overflow:hidden}.h{background:#071426;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px}.h b{font-size:15px}.h a{color:#1FB6F0;text-decoration:none;font-size:12px;white-space:nowrap}ul{list-style:none;margin:0;padding:0}li{border-top:1px solid #EEF2F7}li:first-child{border-top:0}li a{display:grid;grid-template-columns:72px 1fr;gap:2px 10px;padding:9px 14px;text-decoration:none;color:inherit}li a:hover{background:#F4F7FB}.d{grid-row:1/3;font-weight:700;color:#1B4A8A;font-size:13px}.t{font-weight:600}.m{color:#5B6B80;font-size:12px}.f{padding:8px 14px;background:#F4F7FB;font-size:12px;color:#5B6B80}.f a{color:#1B4A8A}.e{padding:16px 14px;color:#5B6B80}</style></head><body>
<div class="w"><div class="h"><b>Security events in ${esc(city.name)}</b><a href="${esc(siteUrl)}/${esc(slug)}?utm_source=embed" target="_top">Full calendar</a></div>
${rows ? `<ul>${rows}</ul>` : `<p class="e">${esc(city.empty)}</p>`}
<div class="f">From <a href="${esc(siteUrl)}/${esc(slug)}?utm_source=embed" target="_top">The Watch</a>, with CPE hours, prices and registration links. <a href="${esc(siteUrl)}/subscribe?city=${esc(slug)}&src=embed" target="_top">Get the Sunday email</a>.</div></div>
<script>try{parent.postMessage({watchEmbedHeight:document.documentElement.scrollHeight},"*")}catch(e){}</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600", "X-Frame-Options": "", "Content-Security-Policy": "frame-ancestors *" } });
}
function db(env) { return env.DB; }
