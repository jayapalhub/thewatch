import { html, raw } from "./html.js";
import { CONSENT_TEXT, MAIL_ADDRESS, ASSET_VERSION, CITIES, DEFAULT_CITY, cityOf } from "./constants.js";

export const SHIELD_PATH = "M12699.99 19504.82l-4476.78 -2847.86c-440.67,-280.35 -871.71,-817.92 -871.71,-1701.16l0 -6890.42 5348.49 -2170.18 5348.48 2170.18 0 6890.42c0,883.24 -431.04,1420.81 -871.71,1701.16l-4476.77 2847.86zm0 -2838.35l2953.65 -1878.91 0 -1261.73 -1771.64 -1083.78 1771.64 -1083.74 0 -1680.18 -2953.65 -1198.49 -2953.66 1198.49 0 5109.43 2953.66 1878.91z";

export function mark(size = 36, cls = "") {
  return raw(`<svg class="mark ${cls}" width="${size}" height="${size}" viewBox="0 0 25400 25400" aria-hidden="true"><rect width="25400" height="25400" rx="5600" fill="#1FB6F0"/><g transform="translate(12700 12700) scale(1.42) translate(-12700 -12700)"><path fill="#1B4A8A" fill-rule="evenodd" d="${SHIELD_PATH}"/></g></svg>`);
}

export function signupForm({ source, compact = false, cta = "Get the Sunday email" }) {
  return html`
  <form class="signup ${compact ? "signup-compact" : ""}" method="post" action="/api/subscribe" data-signup>
    <input type="hidden" name="source" value="${source}">
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="sr-only" for="email-${source}">Email address</label>
    <div class="signup-row">
      <input id="email-${source}" type="email" name="email" placeholder="you@company.com" required autocomplete="email" inputmode="email">
      <button type="submit" class="btn btn-primary">${cta}</button>
    </div>
    <p class="consent">${CONSENT_TEXT} <a href="/privacy">Privacy policy</a>.</p>
    <p class="signup-msg" role="status" aria-live="polite"></p>
  </form>`;
}

export function shell({ title, description, body, city = null, path = "/", wide = false, head = "" }) {
  const c = cityOf(city) || CITIES[DEFAULT_CITY];
  const isVirtual = c.slug === "virtual";
  const atRoot = !city && path === "/";
  const brandTitle = atRoot ? "The Watch" : c.title;
  const fullTitle = title ? `${title} | ${brandTitle}` : atRoot ? "The Watch: cybersecurity events calendars by Better Security" : `${brandTitle}: cybersecurity events in ${c.name}`;
  const desc = description || `${c.description || "Every cybersecurity, AI security, privacy and audit event, in one calendar."} By Better Security.`;
  const calHome = isVirtual ? "/virtual" : `/${c.slug}`;
  const nav = [
    ...Object.values(CITIES).map((x) => [`/${x.slug}`, x.name]),
    ["/virtual", "Virtual"],
    ["/events", "Our events"],
    ["/submit", "Submit an event"],
    ["/sponsor", "Sponsor"],
    ["/about", "About"],
  ];
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:image" content="/assets/img/og.png">
<link rel="icon" href="/assets/img/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_VERSION}">
<link rel="alternate" type="text/calendar" title="${brandTitle} calendar feed" href="${calHome}/feed.ics">
${raw(head)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="Better Security home">${mark(34)}<span class="brand-text"><span class="brand-name">The Watch</span><span class="brand-city">${atRoot ? "by Better Security" : c.name}</span></span></a>
    <nav class="site-nav" aria-label="Main">
      ${nav.map(([href, label]) => html`<a href="${href}" ${path === href || (href !== "/" && path.startsWith(href + "/")) ? raw('aria-current="page"') : ""}>${label}</a>`)}
      <a class="btn btn-small btn-electric" href="/subscribe">Subscribe</a>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
  <nav id="mobile-nav" class="mobile-nav" hidden aria-label="Mobile">
    ${nav.map(([href, label]) => html`<a href="${href}">${label}</a>`)}
    <a href="/subscribe">Subscribe</a>
  </nav>
</header>
<main id="main" class="${wide ? "wide" : ""}">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      ${mark(40)}
      <p><strong>The Watch</strong> is published by Better Security, a San Diego events company. We cover every organizer's events in ${Object.values(CITIES).map((x) => x.name).join(" and ")}, plus the best online sessions, and run a few of our own.</p>
      ${signupForm({ source: "footer", compact: true, cta: "Subscribe" })}
    </div>
    <div class="footer-col">
      <h3>Calendar</h3>
      ${Object.values(CITIES).map((x) => html`<a href="/${x.slug}">${x.name}</a>`)}
      <a href="/virtual">Virtual sessions and CPE</a>
      <a href="/?choose=1">Change city</a>
      <a href="${calHome}/feed.ics">Subscribe to the calendar feed</a>
      ${isVirtual ? "" : html`<a href="${calHome}/issues">Past issues</a>`}
      <a href="/submit">Submit an event</a>
    </div>
    <div class="footer-col">
      <h3>Better Security</h3>
      <a href="/events">Our events</a>
      <a href="/events/padel-social-2027">Padel Social 2027</a>
      <a href="/sponsor">Sponsor</a>
      <a href="/about">About</a>
      <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>
    </div>
    <div class="footer-col">
      <h3>Fine print</h3>
      <a href="/privacy">Privacy policy</a>
      <a href="/terms">Terms</a>
      <p class="footer-address">${MAIL_ADDRESS}</p>
      <p class="footer-address">&copy; ${new Date().getFullYear()} Better Security</p>
    </div>
  </div>
</footer>
<script src="/assets/js/site.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`;
}
