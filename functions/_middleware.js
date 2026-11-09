// bettersecurity.ai is parked (2026-11-09). Every address answers with the same name only page.
// The home page answers 200; every other address answers 410 Gone so search engines drop the old pages.
// The former site (The Watch calendar, newsletter, forms, admin, API) is in this repository's git history.
const PAGE = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<title>Better Security</title>\n<style>\n  html, body { height: 100%; margin: 0; }\n  body { display: flex; align-items: center; justify-content: center; background: #ffffff; color: #14213d;\n         font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; }\n  h1 { font-size: 1.75rem; font-weight: 600; letter-spacing: .01em; margin: 0; padding: 0 16px; text-align: center; }\n  @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #e8edf5; } }\n</style>\n</head>\n<body>\n<h1>Better Security</h1>\n</body>\n</html>\n";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export async function onRequest({ request }) {
  const path = new URL(request.url).pathname;
  // Crawlers may fetch everything so they see the 410s and drop the old URLs; there is no sitemap.
  if (path === "/robots.txt") {
    return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  const status = path === "/" && (request.method === "GET" || request.method === "HEAD") ? 200 : 410;
  return new Response(request.method === "HEAD" ? null : PAGE, { status, headers: HEADERS });
}
