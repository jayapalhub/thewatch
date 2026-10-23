import { loadCities } from "./_lib/constants.js";
import { meterDB, noteRequest, flushUsage, alertOnce } from "./_lib/ops.js";
import { isPreview, rememberEnvironment } from "./_lib/env.js";

// Runs before every function.
// 1. Public pages are cached at the edge for a few minutes, so crawlers and repeat visitors do not each cost a set of
//    database reads. Only anonymous GETs (no cookie) of public paths are cached; admin, API, redirects, profile and
//    anything personal always run fresh.
// 2. A longer lived copy of each cached page is kept as a fallback. If the database is unavailable (for example the
//    daily read allowance is spent) or a page throws, visitors get the last good copy, or a plain notice, instead of
//    a Cloudflare error screen.
// 3. Keeps the city list in step with the D1 cities table and sets the security headers that public/_headers only
//    applies to static files. The embed pages are the one place framing is allowed.
// 4. Preview deployments (ENVIRONMENT = "preview", see docs/environments.md) must never be indexed or mistaken for the
//    live site: every response carries X-Robots-Tag: noindex, nofollow, /robots.txt disallows everything, and nothing
//    is put in or read from the edge cache, so a preview never serves or leaves behind a cached copy.
const FRESH_SECONDS = 300;
const STALE_SECONDS = 172800; // two days
const PRIVATE = /^\/(admin|api|go|r|profile|unsubscribe|resubscribe|remind|cpe|subscribe|submit|casestudy)(\/|$)/;

function cacheable(request, path) {
  if (request.method !== "GET") return false;
  if (PRIVATE.test(path)) return false;
  if (request.headers.get("cookie")) return false;
  const u = new URL(request.url);
  if (u.searchParams.has("s") || u.searchParams.has("token") || u.searchParams.has("t")) return false; // tokenised links
  return true;
}
function staleKey(url) { const u = new URL(url); u.searchParams.set("__stale", "1"); return new Request(u.toString(), { method: "GET" }); }

function withHeaders(res, path, extra = {}) {
  const h = new Headers(res.headers);
  if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
  if (!h.has("Referrer-Policy")) h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!path.startsWith("/embed/") && !h.has("X-Frame-Options")) h.set("X-Frame-Options", "DENY");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const PREVIEW_HEADERS = { "X-Robots-Tag": "noindex, nofollow" };
const PREVIEW_ROBOTS = "User-agent: *\nDisallow: /\n";

function notice(path, extra = {}) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Watch</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f8fa;color:#14213d;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}main{max-width:520px;padding:32px 24px;text-align:center}h1{font-size:1.4rem;margin:0 0 12px}p{line-height:1.6;color:#3d4a63}</style></head>
<body><main><h1>The Watch is taking a short break</h1><p>The calendar is temporarily unavailable while we catch up. Please check back in a little while. Thank you for your patience.</p></main></body></html>`;
  return withHeaders(new Response(body, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "900", "Cache-Control": "no-store" } }), path, extra);
}

export async function onRequest(context) {
  const { request } = context;
  const path = new URL(request.url).pathname;
  const preview = isPreview(context.env);
  rememberEnvironment(context.env);
  const extra = preview ? PREVIEW_HEADERS : {};
  if (preview && path === "/robots.txt") return withHeaders(new Response(PREVIEW_ROBOTS, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }), path, extra);
  const useCache = !preview && cacheable(request, path) && typeof caches !== "undefined";
  const cache = useCache ? caches.default : null;

  if (cache) {
    const hit = await cache.match(request).catch(() => null);
    if (hit) return withHeaders(hit, path, { "X-Watch-Cache": "hit" });
  }

  // Every function downstream sees a metered binding, so reads and writes are counted per request.
  context.env.DB = meterDB(context.env.DB);
  let res, err = null;
  try {
    await loadCities(context.env.DB);
    res = await context.next();
  } catch (e) {
    res = null; err = e;
  }

  const failed = !res || res.status >= 500;
  noteRequest(failed);
  if (context.waitUntil) context.waitUntil(flushUsage(context.env.DB));
  if (failed) {
    const detail = err ? String(err.message || err).slice(0, 300) : `status ${res.status}`;
    if (context.waitUntil) context.waitUntil(alertOnce(context.env, "fallback-served", "The site served a fallback page",
      `<p>A request for <code>${path}</code> failed and visitors are getting the cached copy or the short notice instead.</p><p>Error: ${detail.replace(/</g, "&lt;")}</p><p>If this says the D1 read limit was reached, check usage at /api/health and the Cloudflare dashboard. Otherwise look at the Pages function logs for this route.</p>`).catch(() => {}));
  }

  if (failed) {
    if (cache) {
      const old = await cache.match(staleKey(request.url)).catch(() => null);
      if (old) return withHeaders(old, path, { "X-Watch-Cache": "stale" });
    }
    if (!res || request.method === "GET") {
      const accept = request.headers.get("accept") || "";
      if (!res || accept.includes("text/html")) return notice(path, extra);
    }
    return withHeaders(res, path, extra);
  }

  const out = withHeaders(res, path, extra);
  // The only cookie a public page sets is the remembered city (watch_city); that one is dropped from the cached copy.
  const cookies = res.headers.get("set-cookie") || "";
  const onlyCityCookie = !cookies || cookies.split(/,(?=\s*[A-Za-z_]+=)/).every((c) => /^\s*watch_city=/.test(c));
  if (cache && res.status === 200 && onlyCityCookie && !/no-store|private/.test(res.headers.get("cache-control") || "")) {
    const ct = res.headers.get("content-type") || "";
    if (/text\/html|xml|json|calendar|image\//.test(ct)) {
      const fresh = out.clone(); const stale = out.clone();
      const fh = new Headers(fresh.headers); fh.set("Cache-Control", `public, max-age=${FRESH_SECONDS}`); fh.delete("Set-Cookie");
      const sh = new Headers(stale.headers); sh.set("Cache-Control", `public, max-age=${STALE_SECONDS}`); sh.delete("Set-Cookie");
      const put = Promise.all([
        cache.put(request, new Response(fresh.body, { status: 200, headers: fh })),
        cache.put(staleKey(request.url), new Response(stale.body, { status: 200, headers: sh })),
      ]).catch(() => {});
      if (context.waitUntil) context.waitUntil(put);
    }
  }
  return out;
}
