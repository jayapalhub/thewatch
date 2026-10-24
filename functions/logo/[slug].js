// GET /logo/<organization slug>: the employer's logo from its own website, or a badge with its initials. Cached at the
// edge for a week per organization, so each employer's site is asked about once a week at most. See _lib/logos.js.
import { fetchLogo, initialsSvg, LOGO_HEADERS } from "../_lib/logos.js";

export async function onRequestGet({ params, env, request, waitUntil }, { fetcher = fetch } = {}) {
  const slug = String(params.slug || "").replace(/\.(png|svg)$/i, "").toLowerCase();
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return new Response("Not found", { status: 404 });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(`/logo/${slug}`, request.url).toString());
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const org = await env.DB.prepare("SELECT name, website FROM organizations WHERE slug=?").bind(slug).first();
  if (!org) return new Response("Not found", { status: 404 });
  const logo = org.website ? await fetchLogo(org.website, fetcher).catch(() => null) : null;
  const res = logo
    ? new Response(logo.body, { headers: { ...LOGO_HEADERS, "Content-Type": logo.type } })
    : new Response(initialsSvg(org.name), { headers: { ...LOGO_HEADERS, "Content-Type": "image/svg+xml; charset=utf-8" } });
  if (cache && waitUntil) waitUntil(cache.put(key, res.clone()));
  return res;
}
