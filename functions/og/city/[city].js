import { cityOf } from "../../_lib/constants.js";
import { cityCard, render } from "../../_lib/og.js";

export async function onRequestGet({ params, env, request, waitUntil }) {
  const slug = String(params.city).replace(/\.png$/, "");
  const city = cityOf(slug);
  if (!city) return new Response("Not found", { status: 404 });
  const where = slug === "virtual" ? "(city='virtual' OR also_virtual=1)" : "city=?";
  const args = slug === "virtual" ? [] : [slug];
  const { n } = await env.DB.prepare(`SELECT COUNT(*) n FROM events WHERE status='published' AND ${where} AND start_utc > strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(...args).first();
  const { o } = await env.DB.prepare(`SELECT COUNT(DISTINCT organization_id) o FROM events WHERE status='published' AND ${where} AND start_utc > strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(...args).first();
  return render(request, await cityCard(city, n, o), waitUntil);
}
