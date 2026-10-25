import { html, raw, page, readForm, str } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { SECTIONS, home, CSS, PASS_COOKIE } from "../_lib/casestudy.js";

// /casestudy and /casestudy/<section>: a passphrase gated set of pages about how The Watch is built and run.
// The passphrase is the CASESTUDY_PASS secret; a correct entry sets a signed cookie good for one day. Attempts are
// rate limited per address through the edge cache. Every response is noindex and uncached, and the path is excluded
// from robots and the sitemap, so the pages are reached only by someone who was given the address and the phrase.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" };
const DAY = 86400;

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function cookieOf(request) { const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${PASS_COOKIE}=([^;]+)`)); return m ? m[1] : ""; }
async function validCookie(env, request) {
  const v = cookieOf(request); if (!v) return false;
  const [exp, sig] = v.split("."); if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(env.ADMIN_TOKEN || "", `cs:${exp}`));
}
async function tooMany(request) {
  if (typeof caches === "undefined") return false;
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const key = new Request(`https://ratelimit.internal/casestudy/${ip}`);
  const hit = await caches.default.match(key);
  const n = hit ? Number(await hit.text()) : 0;
  if (n >= 8) return true;
  await caches.default.put(key, new Response(String(n + 1), { headers: { "Cache-Control": "public, max-age=900" } }));
  return false;
}

function gate(msg = "") {
  const body = html`<style>${raw(CSS)}</style>
  <div class="cs-gate">
    <p class="kicker">Better Security</p>
    <h1>Case study</h1>
    <p>This page was shared with you directly. Enter the phrase you were given.</p>
    <form method="post" action="/casestudy">
      <input type="password" name="phrase" autocomplete="off" autofocus aria-label="Phrase" required>
      <button class="btn btn-primary" type="submit">Open</button>
    </form>
    ${msg ? html`<p class="notice notice-warn" style="margin-top:12px">${msg}</p>` : ""}
  </div>`;
  return page(shell({ title: "Case study", body, path: "/casestudy", head: '<meta name="robots" content="noindex,nofollow">' }), 200, HEADERS);
}

async function numbers(db) {
  const one = async (sql) => { try { const r = await db.prepare(sql).first(); return r ? r.n : 0; } catch { return 0; } };
  return {
    cities: await one("SELECT count(*) n FROM cities WHERE active=1"),
    events: await one("SELECT count(*) n FROM events WHERE status='published' AND start_at >= date('now')"),
    orgs: await one("SELECT count(*) n FROM organizations"),
    feeds: await one("SELECT count(*) n FROM feed_sources WHERE active=1"),
    pausedCities: await one("SELECT count(*) n FROM cities WHERE active=0"),
  };
}

export async function onRequestPost({ request, env }) {
  if (!env.CASESTUDY_PASS) return gate("The phrase has not been set up yet.");
  if (await tooMany(request)) return gate("Too many attempts. Try again in fifteen minutes.");
  const p = await readForm(request);
  const phrase = str(p.phrase, 200);
  if (!phrase || !safeEqual(phrase, env.CASESTUDY_PASS)) return gate("That phrase did not match.");
  const exp = Math.floor(Date.now() / 1000) + DAY;
  const sig = await hmac(env.ADMIN_TOKEN || "", `cs:${exp}`);
  return new Response(null, { status: 303, headers: { Location: "/casestudy", "Set-Cookie": `${PASS_COOKIE}=${exp}.${sig}; Path=/casestudy; Max-Age=${DAY}; HttpOnly; Secure; SameSite=Lax`, ...HEADERS } });
}

export async function onRequestGet({ request, env, params }) {
  if (!(await validCookie(env, request))) return gate();
  const key = Array.isArray(params.page) ? params.page.join("/") : (params.page || "");
  const nav = html`<p class="crumbs"><a href="/casestudy">Case study</a>${key ? html` &rsaquo; ${SECTIONS[key] ? SECTIONS[key].title : ""}` : ""}</p>`;
  let body;
  if (!key) body = html`<style>${raw(CSS)}</style>${home(await numbers(env.DB))}`;
  else {
    const s = SECTIONS[key];
    if (!s) return page(shell({ title: "Not found", body: html`<section class="band"><div class="wrap narrow"><p>No such section.</p><p><a href="/casestudy">Back to the case study</a></p></div></section>`, path: "/casestudy" }), 404, HEADERS);
    body = html`<style>${raw(CSS)}</style>
    <section class="hero hero-short"><div class="wrap narrow">${nav}<p class="kicker">${s.kicker}</p><h1>${s.title}</h1><p class="lede">${s.blurb}</p></div></section>
    <section class="band"><div class="wrap narrow prose">${raw(s.body)}<p style="margin-top:28px"><a class="btn btn-outline" href="/casestudy">Back to the overview</a></p></div></section>`;
  }
  return page(shell({ title: key && SECTIONS[key] ? SECTIONS[key].title : "Case study", body, path: "/casestudy", head: '<meta name="robots" content="noindex,nofollow">' }), 200, HEADERS);
}
