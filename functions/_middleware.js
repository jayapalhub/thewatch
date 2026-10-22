import { loadCities } from "./_lib/constants.js";

// Runs before every function: keep the city list in step with the D1 cities table, and set the security headers
// that public/_headers only applies to static files (Pages does not apply it to function responses). The embed
// pages are the one place framing is allowed.
export async function onRequest(context) {
  await loadCities(context.env.DB);
  const res = await context.next();
  const path = new URL(context.request.url).pathname;
  const h = new Headers(res.headers);
  if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
  if (!h.has("Referrer-Policy")) h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!path.startsWith("/embed/") && !h.has("X-Frame-Options")) h.set("X-Frame-Options", "DENY");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
