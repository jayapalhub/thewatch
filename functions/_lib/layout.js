import { html, raw } from "./html.js";
import { CONSENT_TEXT, MAIL_ADDRESS, ASSET_VERSION, CITIES, DEFAULT_CITY, cityOf, SHOW_BS_EVENTS, cityListText } from "./constants.js";
import { previewRuntime } from "./env.js";

export const SHIELD_PATH = "M12699.99 19504.82l-4476.78 -2847.86c-440.67,-280.35 -871.71,-817.92 -871.71,-1701.16l0 -6890.42 5348.49 -2170.18 5348.48 2170.18 0 6890.42c0,883.24 -431.04,1420.81 -871.71,1701.16l-4476.77 2847.86zm0 -2838.35l2953.65 -1878.91 0 -1261.73 -1771.64 -1083.78 1771.64 -1083.74 0 -1680.18 -2953.65 -1198.49 -2953.66 1198.49 0 5109.43 2953.66 1878.91z";

export function mark(size = 36, cls = "") {
  return raw(`<svg class="mark ${cls}" width="${size}" height="${size}" viewBox="0 0 25400 25400" aria-hidden="true"><rect width="25400" height="25400" rx="5600" fill="#1FB6F0"/><g transform="translate(12700 12700) scale(1.42) translate(-12700 -12700)"><path fill="#1B4A8A" fill-rule="evenodd" d="${SHIELD_PATH}"/></g></svg>`);
}

// city: the calendar the visitor is on. Every caller on a city page must pass it; when it is left out the form sends no
// city and the server files the address by its source (calendar:<slug>) or the default, never by a silent San Diego.
export function signupForm({ source, compact = false, cta = "Get the Sunday email", chooseCity = false, city = null }) {
  const picked = CITIES[city] ? city : DEFAULT_CITY;
  return html`
  <form class="signup ${compact ? "signup-compact" : ""}" method="post" action="/api/subscribe" data-signup>
    <input type="hidden" name="source" value="${source}">
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    ${!chooseCity && CITIES[city] ? html`<input type="hidden" name="city" value="${city}">` : ""}
    ${chooseCity && Object.keys(CITIES).length > 1 ? html`<label class="signup-city">Your city <select name="city">${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${c.slug === picked ? raw("selected") : ""}>${c.name}${c.newsletter === "sunday" ? "" : " (starting soon)"}</option>`)}</select></label>` : ""}
    <label class="sr-only" for="email-${source}">Email address</label>
    <div class="signup-row">
      <input id="email-${source}" type="email" name="email" placeholder="you@company.com" required autocomplete="email" inputmode="email">
      <button type="submit" class="btn btn-primary">${cta}</button>
    </div>
    <p class="consent">${CONSENT_TEXT} <a href="/privacy">Privacy policy</a>.</p>
    <p class="signup-msg" role="status" aria-live="polite"></p>
  </form>`;
}

// What the email is, in one line, for a city. Used at the top of a city calendar and in the city signup bands.
export function emailValueLine(city) {
  return city.newsletter === "sunday"
    ? `Every security event in ${city.name}, in your inbox Sunday morning.`
    : `Every security event in ${city.name}, in one calendar. Its Sunday email starts soon, and subscribers get the first issue.`;
}

// The navy signup band for a city page. id="subscribe" so a link near the top of the page can jump to it.
// Everything in it depends only on the city and the page, never on the visitor, so the page stays edge cacheable.
export function subscribeBand({ city, source, heading, text }) {
  return html`<section class="band band-navy band-tight" id="subscribe"><div class="wrap split-center">
    <div><h2>${heading || emailValueLine(city)}</h2>${text ? html`<p>${text}</p>` : ""}</div>
    ${signupForm({ source, city: city.slug })}
  </div></section>`;
}

// canonical: the one URL search engines should index for this page (a path). City pages pass it explicitly, because
// `path` there only picks the highlighted nav item; site wide pages default to their own path. Query strings never
// reach it, so a filtered, month or tracking URL points back at the plain page.
// On a preview deployment every page opens with a thin bar pinned to the top, so sample data is never taken for the
// live calendar. The middleware records the environment; production renders nothing here.
export const PREVIEW_BAR_TEXT = "Preview site with sample data. The live site is";
export function previewBar() {
  return previewRuntime() ? html`<div class="preview-bar" role="note">${PREVIEW_BAR_TEXT} <a href="https://bettersecurity.ai">bettersecurity.ai</a></div>` : "";
}

export function shell({ title, description, body, city = null, path = "/", wide = false, head = "", image = null, canonical }) {
  const c = cityOf(city) || CITIES[DEFAULT_CITY];
  const preview = previewRuntime();
  const isVirtual = c.slug === "virtual";
  const atRoot = !city && path === "/";
  const generic = !city; // site wide pages (about, sponsor, subscribe, submit, legal) carry the brand, not a city
  const brandTitle = generic ? "The Watch" : c.title;
  const fullTitle = title ? `${title} | ${brandTitle}` : atRoot ? "The Watch: cybersecurity events calendars by Better Security" : `${brandTitle}: cybersecurity events in ${c.name}`;
  const desc = description || (generic ? `Every cybersecurity, AI security, privacy and audit event in ${cityListText()}, in one calendar and one Sunday email. By Better Security.` : `${c.description || "Every cybersecurity, AI security, privacy and audit event, in one calendar."} By Better Security.`);
  const calHome = isVirtual ? "/virtual" : `/${c.slug}`;
  const canonicalPath = canonical !== undefined ? canonical : generic ? path : null;
  const canonicalUrl = canonicalPath ? `https://bettersecurity.ai${canonicalPath}` : null;
  // Up to three cities sit in the header by name. Past that the header shows the current city and an All cities link
  // to the chooser, so the navigation stays the same width however many cities there are.
  const cityList = Object.values(CITIES);
  const cityNav = cityList.length <= 3 ? cityList.map((x) => [`/${x.slug}`, x.name]) : [...(c && !generic && CITIES[c.slug] ? [[`/${c.slug}`, c.name]] : []), ["/?choose=1", "All cities"]];
  const nav = [
    ...cityNav,
    ["/virtual", "Virtual"],
    ...(SHOW_BS_EVENTS ? [["/events", "Our events"]] : []),
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
${canonicalUrl ? html`<link rel="canonical" href="${canonicalUrl}">
<meta property="og:url" content="${canonicalUrl}">` : ""}
<meta property="og:image" content="https://bettersecurity.ai${image || (atRoot ? "/og/city/sandiego.png" : `/og/city/${c.slug}.png`)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://bettersecurity.ai${image || (atRoot ? "/og/city/sandiego.png" : `/og/city/${c.slug}.png`)}">
<link rel="icon" href="/assets/img/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_VERSION}">
<link rel="alternate" type="text/calendar" title="${brandTitle} calendar feed" href="${calHome}/feed.ics">
${raw(head)}
</head>
<body${preview ? raw(' class="preview"') : ""}>
${previewBar()}
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="Better Security home">${mark(34)}<span class="brand-text"><span class="brand-name">The Watch</span><span class="brand-city">${generic ? "by Better Security" : c.name}</span></span></a>
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
      <p><strong>The Watch</strong> is published by Better Security, a San Diego events company. We cover every organizer's events in ${cityListText()}, plus the best online sessions.</p>
      ${CITIES[c.slug] ? signupForm({ source: "footer", compact: true, cta: "Subscribe", city: c.slug }) : signupForm({ source: "footer", compact: true, cta: "Subscribe", chooseCity: true })}
    </div>
    <div class="footer-col">
      <h3>Calendar</h3>
      ${Object.values(CITIES).map((x) => html`<a href="/${x.slug}">${x.name}</a>`)}
      <a href="/virtual">Virtual sessions and CPE</a>
      <a href="/?choose=1">Change city</a>
      <a href="${calHome}/feed.ics">Subscribe to the calendar feed</a>
      ${isVirtual ? "" : html`<a href="${calHome}/organizers">Organizers in ${c.name}</a>`}
      <a href="${calHome}/speakers">${isVirtual ? "Speakers at online sessions" : `Speakers in ${c.name}`}</a>
      ${isVirtual ? "" : html`<a href="${calHome}/jobs">Security jobs in ${c.name}</a>`}
      ${isVirtual ? "" : html`<a href="${calHome}/cpe">CPE in ${c.name}</a>`}
      ${isVirtual ? "" : html`<a href="${calHome}/issues">Past issues</a>`}
      <a href="/submit">Submit an event</a>
    </div>
    <div class="footer-col">
      <h3>Better Security</h3>
      ${SHOW_BS_EVENTS ? html`<a href="/events">Our events</a><a href="/events/padel-social-2027">Padel Social 2027</a>` : ""}
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
