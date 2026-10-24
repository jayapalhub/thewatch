// Employer logos from the employer's own site, initials badges for people and as the logo fallback.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { initialsOf, hueOf, initialsSvg, findIcon, fetchLogo, LOGO_HEADERS } from "../functions/_lib/logos.js";
import { onRequestGet as logoRoute } from "../functions/logo/[slug].js";
import { jobRow, hydrateJob } from "../functions/_lib/jobs.js";
import { fakeDb } from "./helpers.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]).buffer;
const res = (body, type, status = 200, url) => { const r = new Response(body, { status, headers: { "content-type": type } }); if (url) Object.defineProperty(r, "url", { value: url }); return r; };

describe("initials", () => {
  test("two letters from the first and last meaningful words, skipping company filler", () => {
    assert.equal(initialsOf("Michael Brewer"), "MB");
    assert.equal(initialsOf("Karine Thibault"), "KT");
    assert.equal(initialsOf("Mary Ann Peters"), "MA");
    assert.equal(initialsOf("Encore Capital Group"), "EC");
    assert.equal(initialsOf("The Walt Disney Company"), "WD");
    assert.equal(initialsOf("KLDiscovery"), "K");
    assert.equal(initialsOf("Jordan (JJ) Example"), "JE");
    assert.equal(initialsOf(""), "?");
  });
  test("a stable hue per name", () => {
    assert.equal(hueOf("Michael Brewer"), hueOf("Michael Brewer"));
    assert.ok(hueOf("Michael Brewer") >= 0 && hueOf("Michael Brewer") < 360);
  });
  test("the fallback SVG escapes the name and carries the initials", () => {
    const svg = initialsSvg("A&B <Security>");
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /aria-label="A&amp;B &lt;Security&gt;"/);
    assert.match(svg, />AS<\/text>/);
    assert.doesNotMatch(svg, /<script/);
  });
});

describe("findIcon", () => {
  const page = "https://www.example.com/en/";
  test("prefers the largest apple-touch-icon and resolves relative links", () => {
    const html = `<link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" sizes="96x96" href="/i96.png"><link rel="apple-touch-icon" sizes="152x152" href="a152.png"><link rel="apple-touch-icon" sizes="180x180" href="/a180.png">`;
    assert.equal(findIcon(html, page), "https://www.example.com/a180.png");
  });
  test("then an SVG icon, then a PNG icon of 48 pixels or more; plain favicons are skipped", () => {
    assert.equal(findIcon(`<link rel="icon" href="/logo.svg"><link rel="icon" sizes="192x192" href="/i192.png">`, page), "https://www.example.com/logo.svg");
    assert.equal(findIcon(`<link rel='shortcut icon' href='/favicon.ico'><link rel=icon sizes=64x64 href=/i64.png>`, page), "https://www.example.com/i64.png");
    assert.equal(findIcon(`<link rel="icon" href="/favicon.ico"><link rel="icon" sizes="32x32" href="/i32.png">`, page), null);
  });
  test("ignores non web links and stylesheets", () => {
    assert.equal(findIcon(`<link rel="stylesheet" href="/a.css"><link rel="apple-touch-icon" href="javascript:alert(1)">`, page), null);
  });
});

describe("fetchLogo", () => {
  test("reads the homepage, takes its icon, and returns an image", async () => {
    const calls = [];
    const fetcher = async (url) => { calls.push(url); return url.endsWith("/") ? res(`<link rel="apple-touch-icon" href="/touch.png">`, "text/html", 200, "https://www.example.com/") : res(png, "image/png"); };
    const out = await fetchLogo("https://www.example.com", fetcher);
    assert.equal(out.type, "image/png");
    assert.equal(out.body.byteLength, png.byteLength);
    assert.deepEqual(calls, ["https://www.example.com/", "https://www.example.com/touch.png"]);
  });
  test("falls back to /apple-touch-icon.png when the page names none, and gives up on non images", async () => {
    const fetcher = async (url) => (url.endsWith("/apple-touch-icon.png") ? res("<html>not an image</html>", "text/html") : res("<html></html>", "text/html"));
    assert.equal(await fetchLogo("example.com", fetcher), null);
    const ok = await fetchLogo("example.com", async (url) => (url.endsWith("/apple-touch-icon.png") ? res(png, "image/png") : res("", "text/html", 403)));
    assert.equal(ok.type, "image/png");
  });
  test("no website, or a blocked site, is null", async () => {
    assert.equal(await fetchLogo(null, async () => res(png, "image/png")), null);
    assert.equal(await fetchLogo("https://x.example", async () => { throw new Error("refused"); }), null);
  });
});

describe("/logo/<slug>", () => {
  const ctx = (slug, org) => ({ params: { slug }, request: new Request(`https://bettersecurity.ai/logo/${slug}`), env: { DB: fakeDb([{ match: /FROM organizations WHERE slug=\?/, reply: () => org }]) } });
  test("serves the employer's icon with a week's cache and a locked down policy", async () => {
    const r = await logoRoute(ctx("example-co", { name: "Example Co", website: "https://example.com" }), { fetcher: async (url) => (url.endsWith("/") ? res(`<link rel="apple-touch-icon" href="/t.png">`, "text/html") : res(png, "image/png")) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("cache-control"), LOGO_HEADERS["Cache-Control"]);
    assert.match(r.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);
  });
  test("an employer without a website or a usable icon gets its initials", async () => {
    const r = await logoRoute(ctx("encore-capital-group", { name: "Encore Capital Group", website: null }));
    assert.equal(r.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.match(await r.text(), />EC<\/text>/);
  });
  test("unknown or malformed slugs are not found", async () => {
    assert.equal((await logoRoute(ctx("nobody", null))).status, 404);
    assert.equal((await logoRoute(ctx("../etc", null))).status, 404);
  });
});

describe("job rows", () => {
  const base = { id: 9, city: "sandiego", title: "Senior GRC Analyst", employer_name: "Encore Capital Group", org_name: "Encore Capital Group", org_slug: "encore-capital-group", url: "https://lnkd.in/p/x", topics: "[]", status: "published" };
  const today = "2026-10-23";
  test("a role someone posted about shows the employer logo and the person's initials", () => {
    const row = String(jobRow(hydrateJob({ ...base, posted_by_name: "Michael Brewer", posted_by_title: "CISO", posted_by_role: "leader", posted_by_url: "https://lnkd.in/p/x", posted_by_date: "2026-10-21", announced: 1 }), today));
    assert.match(row, /<img class="emp-logo" src="\/logo\/encore-capital-group" alt="" width="52" height="52" loading="lazy"/);
    assert.match(row, /<span class="person-badge" style="--hue:\d+" aria-hidden="true">MB<\/span><span>Michael Brewer, CISO, is hiring<\/span>/);
  });
  test("an ordinary role shows its employer logo but no person; a role without an organization shows the employer's initials", () => {
    const row = String(jobRow(hydrateJob(base), today));
    assert.match(row, /class="emp-logo" src="\/logo\/encore-capital-group"/);
    assert.doesNotMatch(row, /person-badge/);
    const bare = String(jobRow(hydrateJob({ ...base, org_slug: null, org_name: null }), today));
    assert.match(bare, /<span class="emp-logo emp-initials" style="--hue:\d+" aria-hidden="true">EC<\/span>/);
  });
  test("a title that ends with the employer is shortened in the insight line", () => {
    const row = String(jobRow(hydrateJob({ ...base, posted_by_name: "Karine Thibault", posted_by_title: "Global CISO, Encore Capital Group", posted_by_role: "leader", posted_by_date: "2026-10-23" }), today));
    assert.match(row, /<span>Karine Thibault, Global CISO, is hiring<\/span>/);
  });
});
