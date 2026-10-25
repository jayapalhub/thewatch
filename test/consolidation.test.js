// The 2026-10-25 consolidation: one live city, paused cities redirect, the job board is gone from pages, sitemap and
// the Sunday email, and the data behind both stays where it was.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequestGet as home } from "../functions/index.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { renderIssueHtml, loadIssueData } from "../functions/_lib/newsletter.js";
import { CITIES, HIDDEN_CITIES, loadCities, singleCity } from "../functions/_lib/constants.js";
import { rememberEnvironment } from "../functions/_lib/env.js";
import { fakeDb } from "./helpers.js";

const req = (path, accept = "text/html") => new Request("https://bettersecurity.ai" + path, { headers: { accept } });
const cityRows = [
  { slug: "sandiego", name: "San Diego", title: "The Watch San Diego", region: "San Diego County", timezone: "America/Los_Angeles", newsletter: "sunday", active: 1, sort: 10 },
  { slug: "atlanta", name: "Atlanta", title: "The Watch Atlanta", region: "Metro Atlanta", timezone: "America/New_York", newsletter: "sunday", active: 0, sort: 20 },
  { slug: "losangeles", name: "Los Angeles", title: "The Watch Los Angeles", region: "Los Angeles", timezone: "America/Los_Angeles", newsletter: "sunday", active: 0, sort: 30 },
];
const cityDb = (extra = []) => fakeDb([{ match: /FROM cities ORDER BY sort/, op: "all", reply: () => ({ results: cityRows }) }, ...extra]);

async function through(path, next = async () => new Response("ok")) {
  const env = { ENVIRONMENT: "production", DB: cityDb(), SITE_URL: "https://bettersecurity.ai" };
  rememberEnvironment(env);
  return middleware({ request: req(path), env, params: {}, waitUntil: () => {}, next });
}

describe("the city list", () => {
  test("paused cities leave CITIES and land in HIDDEN_CITIES; one live city is a single city site", async () => {
    await loadCities(cityDb(), { force: true });
    assert.deepEqual(Object.keys(CITIES), ["sandiego"]);
    assert.deepEqual([...HIDDEN_CITIES].sort(), ["atlanta", "losangeles"]);
    assert.equal(singleCity(), true);
  });
});

describe("retired paths", () => {
  test("a paused city's pages, images and embed redirect to San Diego with no caching and a noindex header", async () => {
    for (const p of ["/atlanta", "/atlanta/events/some-event", "/losangeles/issues/2026-10-19", "/atlanta/subscribe", "/embed/atlanta", "/og/city/losangeles.png"]) {
      const res = await through(p, async () => { throw new Error("the page function must not run for " + p); });
      assert.equal(res.status, 302, p);
      assert.equal(res.headers.get("location"), "https://bettersecurity.ai/sandiego", p);
      assert.equal(res.headers.get("cache-control"), "no-store", p);
      assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow", p);
    }
  });
  test("the job board paths redirect too, for live and paused cities, remote and the employer pages", async () => {
    for (const p of ["/sandiego/jobs", "/sandiego/jobs/12-some-role", "/sandiego/jobs/posted", "/atlanta/jobs", "/remote/jobs", "/jobs/posted", "/employers", "/employers/okta"]) {
      const res = await through(p, async () => { throw new Error("must not run for " + p); });
      assert.equal(res.status, 302, p);
      assert.equal(res.headers.get("location"), "https://bettersecurity.ai/sandiego", p);
    }
  });
  test("the admin and the API keep their jobs paths, and live pages still run", async () => {
    for (const p of ["/admin/jobs", "/admin/jobs/12", "/api/jobs/anything", "/sandiego", "/sandiego/events/x", "/virtual", "/go/j/5"]) {
      const res = await through(p);
      assert.equal(res.status, 200, p);
    }
  });
});

describe("one city", () => {
  test("the root sends visitors to the San Diego calendar", async () => {
    await loadCities(cityDb(), { force: true });
    const res = await home({ request: req("/"), env: { DB: cityDb() } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://bettersecurity.ai/sandiego");
  });
  test("the calendar page has no Change city link, no city grid in the footer and no jobs link", async () => {
    await loadCities(cityDb(), { force: true });
    const body = await (await cityPage({ request: req("/sandiego"), env: { DB: cityDb() }, params: { city: "sandiego" }, waitUntil: () => {} })).text();
    assert.doesNotMatch(body, /Change city/);
    assert.doesNotMatch(body, /footer-cities/);
    assert.doesNotMatch(body, /\/jobs"/);
    assert.match(body, /security and technology events in San Diego County/);
  });
  test("the sitemap lists San Diego and Virtual only, and nothing from the job board", async () => {
    await loadCities(cityDb(), { force: true });
    const xml = await (await sitemap({ env: { DB: cityDb(), SITE_URL: "https://bettersecurity.ai" } })).text();
    assert.match(xml, /<loc>https:\/\/bettersecurity\.ai\/sandiego<\/loc>/);
    assert.match(xml, /<loc>https:\/\/bettersecurity\.ai\/virtual<\/loc>/);
    assert.doesNotMatch(xml, /atlanta|losangeles/);
    assert.doesNotMatch(xml, /\/jobs|\/employers/);
    assert.doesNotMatch(xml, /<loc>https:\/\/bettersecurity\.ai\/<\/loc>/, "the root redirects, so the calendar is the page to index");
  });
});

describe("the Sunday email", () => {
  test("loads no roles and renders no jobs slot", async () => {
    const db = cityDb();
    const issue = { id: 1, city: "sandiego", week_start: "2026-11-02", week_end: "2026-11-08", personal_note: "A quiet week." };
    const data = await loadIssueData(db, issue);
    assert.equal("jobs" in data, false);
    assert.equal(db.find(/FROM jobs/).length, 0, "the jobs table is not read");
    const html = renderIssueHtml(issue, data, "https://bettersecurity.ai", CITIES.sandiego);
    assert.doesNotMatch(html, /\{\{JOBS\}\}/);
    assert.doesNotMatch(html, /Hiring this week/);
  });
});
