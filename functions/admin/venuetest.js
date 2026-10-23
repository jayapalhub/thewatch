import { json } from "../_lib/html.js";
import { readEventPage } from "../_lib/eventpage.js";

// Venue reader. POST JSON { urls: [...] } (up to 10). Each event page is fetched server side and its schema.org Event
// data is read for the venue name, street address and whether it is online. Nothing is written.
const MAX = 10;
export async function onRequestPost({ request }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u) => /^https?:\/\//.test(u)).slice(0, MAX);
  const results = await Promise.all(urls.map(async (url) => {
    try { const v = await readEventPage(url); return v ? { url, found: true, ...v } : { url, found: false }; }
    catch (e) { return { url, error: String(e && e.message || e).slice(0, 80) }; }
  }));
  return json({ ok: true, results });
}
