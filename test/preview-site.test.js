// A preview deployment must be unmistakable and unindexable, and production must be exactly as before. Everything here
// runs through the middleware with a fake database, the way a request does on Pages, once with ENVIRONMENT = "preview"
// and once with "production".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { onRequestGet as embedPage } from "../functions/embed/[city].js";
import { PREVIEW_BAR_TEXT } from "../functions/_lib/layout.js";
import { rememberEnvironment } from "../functions/_lib/env.js";
import { emailShell } from "../functions/_lib/integrations.js";
import { fakeDb } from "./helpers.js";

const PRODUCTION_ROBOTS = "User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://bettersecurity.ai/sitemap.xml\n";
const envFor = (environment) => ({ ENVIRONMENT: environment, DB: fakeDb(), SITE_URL: "https://bettersecurity.ai" });

// Runs a request through the middleware. next() is what Pages would serve underneath: a function or a static asset.
async function through(environment, path, next) {
  const request = new Request(`https://${environment === "preview" ? "abc123.thewatch.pages.dev" : "bettersecurity.ai"}${path}`, { headers: { accept: "text/html" } });
  const env = envFor(environment);
  const ctx = { request, env, params: { city: "sandiego" }, waitUntil: () => {}, next: () => next({ request, env, params: { city: "sandiego" }, waitUntil: () => {} }) };
  return middleware(ctx);
}
const asset = (body, type) => async () => new Response(body, { status: 200, headers: { "Content-Type": type } });

describe("robots", () => {
  test("preview: every response says noindex, nofollow and robots.txt disallows everything", async () => {
    const res = await through("preview", "/robots.txt", asset(PRODUCTION_ROBOTS, "text/plain"));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "User-agent: *\nDisallow: /\n");
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.match(res.headers.get("Cache-Control"), /no-store/);
    const page = await through("preview", "/sandiego", cityPage);
    assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
    const css = await through("preview", "/assets/css/site.css", asset("body{}", "text/css"));
    assert.equal(css.headers.get("X-Robots-Tag"), "noindex, nofollow");
  });

  test("production: robots.txt passes through untouched and no X-Robots-Tag is added", async () => {
    const res = await through("production", "/robots.txt", asset(PRODUCTION_ROBOTS, "text/plain"));
    assert.equal(await res.text(), PRODUCTION_ROBOTS);
    assert.equal(res.headers.get("X-Robots-Tag"), null);
    const page = await through("production", "/sandiego", cityPage);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("X-Robots-Tag"), null);
    assert.equal(page.headers.get("X-Frame-Options"), "DENY"); // the usual security headers still arrive
  });

  test("the fallback notice on a preview carries the header too", async () => {
    const res = await through("preview", "/sandiego", async () => { throw new Error("database away"); });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
  });
});

describe("banner", () => {
  test("follows the house style", () => {
    assert.equal(PREVIEW_BAR_TEXT, "Preview site with sample data. The live site is");
    assert.ok(!/[-!–—]|\.\.\./.test(PREVIEW_BAR_TEXT));
  });

  test("a preview page opens with the bar, linked to the live site", async () => {
    const res = await through("preview", "/sandiego", cityPage);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<body class="preview">\s*<div class="preview-bar" role="note">Preview site with sample data\. The live site is <a href="https:\/\/bettersecurity\.ai">bettersecurity\.ai<\/a><\/div>/);
    assert.equal(body.indexOf("preview-bar") < body.indexOf("site-header"), true, "the bar comes before the header");
  });

  test("a production page has no bar and no preview class", async () => {
    const res = await through("production", "/sandiego", cityPage);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.ok(!body.includes("preview-bar"));
    assert.ok(!body.includes(PREVIEW_BAR_TEXT));
    assert.match(body, /<body>\s*<a class="skip"/);
  });

  test("the embed widget never carries the bar, though its preview response is still noindex", async () => {
    const res = await through("preview", "/embed/sandiego", embedPage);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    assert.ok(!body.includes("preview-bar"));
    assert.ok(!body.includes(PREVIEW_BAR_TEXT));
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(res.headers.get("X-Frame-Options"), null, "the embed may still be framed");
  });

  test("emails never carry the bar, even on a preview", () => {
    rememberEnvironment({ ENVIRONMENT: "preview" });
    try {
      const mail = emailShell("Welcome", "<p>Hi</p>");
      assert.ok(!mail.includes("preview-bar"));
      assert.ok(!mail.includes(PREVIEW_BAR_TEXT));
    } finally { rememberEnvironment(null); }
  });
});

describe("edge cache", () => {
  // Node has no caches global, so the cache is already off here; this checks the decision itself.
  test("a preview never uses the cache even when one exists", async () => {
    const puts = []; const matches = [];
    globalThis.caches = { default: { match: async (r) => { matches.push(String(r.url || r)); return null; }, put: async (r) => { puts.push(String(r.url || r)); } } };
    try {
      const res = await through("preview", "/sandiego", cityPage);
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(res.status, 200);
      assert.deepEqual(matches, []);
      assert.deepEqual(puts, []);
      const prod = await through("production", "/sandiego", cityPage);
      assert.equal(prod.status, 200);
      assert.equal(matches.length, 1, "production still reads the cache");
    } finally { delete globalThis.caches; }
  });
});
