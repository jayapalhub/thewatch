import { json } from "../_lib/html.js";
import { fetchText, parseIcal, parseBrightTalk, tidyTitle } from "../_lib/feeds.js";

// Feed tester, used before adding feed sources. POST a JSON body { feeds: [{ url, kind?, tz?, keywords? }, ...] } with
// up to 12 entries. Each feed is fetched and parsed the same way the hourly pull does it, and the result says whether it
// loaded, how many events are upcoming, how many survive the keyword filter, and the next few titles and dates.
// It reads only; nothing is written to the database.
const MAX = 12;

function keep(it, keywords) {
  const titleOnly = /^\s*title:/i.test(keywords || "");
  const kw = String(keywords || "").replace(/^\s*title:/i, "").split(",").map((k) => k.trim()).filter(Boolean);
  if (!kw.length) return true;
  const hay = titleOnly ? String(it.title || "") : `${it.title} ${it.summary || ""}`;
  return kw.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay));
}

export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const feeds = Array.isArray(body.feeds) ? body.feeds.slice(0, MAX) : [];
  const now = Date.now();
  const out = await Promise.all(feeds.map(async (f) => {
    const r = { url: f.url };
    try {
      const text = await fetchText(f.url);
      const items = f.kind === "brighttalk" ? parseBrightTalk(text) : parseIcal(text, f.tz || "America/Los_Angeles");
      const upcoming = items.filter((it) => it.startUtc && it.startUtc.getTime() > now);
      const kept = upcoming.filter((it) => keep(it, f.keywords)).sort((a, b) => a.startUtc - b.startUtc);
      Object.assign(r, { ok: true, total: items.length, upcoming: upcoming.length, kept: kept.length,
        next: kept.slice(0, 4).map((it) => `${it.startUtc.toISOString().slice(0, 10)} ${tidyTitle(it.title).slice(0, 70)}`),
        last_past: items.filter((it) => it.startUtc && it.startUtc.getTime() <= now).map((it) => it.startUtc.toISOString().slice(0, 10)).sort().pop() || null });
    } catch (e) {
      Object.assign(r, { ok: false, error: String(e && e.message || e).slice(0, 120) });
    }
    return r;
  }));
  return json({ ok: true, results: out });
}
