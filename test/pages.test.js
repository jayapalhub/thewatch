// Renders the public city pages against a fake database and checks the parts that drive signups and search:
// the signup forms carry the page's city, and nothing about the visitor ends up in a page the edge caches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { onRequestGet as eventPage } from "../functions/[city]/events/[slug].js";
import { onRequestGet as jobsPage } from "../functions/[city]/jobs/index.js";

const DALLAS = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "Every cybersecurity, AI security, privacy and audit event in Dallas, Fort Worth and North Texas, in one calendar.", empty: "Nothing yet.", newsletter: "sunday", sort: 110 };
CITIES.dallas = DALLAS;

const EVENT = {
  id: 7, slug: "issa-north-texas-october", city: "dallas", title: "ISSA North Texas October Meeting", status: "published",
  start_at: "2099-10-28T18:00", end_at: "2099-10-28T20:00", start_utc: "2099-10-28T23:00:00.000Z", end_utc: "2099-10-29T01:00:00.000Z",
  timezone: "America/Chicago", format: "in_person", venue_display: "Example Hall", venue_address_display: "1 Main St, Dallas, TX",
  cost_type: "free", description_short: "Monthly chapter meeting.", org_slug: "issa-north-texas", org_display: "ISSA North Texas", org_name: "ISSA North Texas",
  registration_url: "https://example.test/register", topics: "[]",
};

const ctx = (path, db) => ({ request: new Request("https://bettersecurity.ai" + path), env: { DB: db, SITE_URL: "https://bettersecurity.ai" }, params: {}, waitUntil: () => {} });
const hiddenCities = (s) => [...s.matchAll(/<input type="hidden" name="city" value="([a-z]+)">/g)].map((m) => m[1]);

test("city calendar: value line at the top, and every signup form files the reader under that city", async () => {
  const c = ctx("/dallas", fakeDb());
  c.params = { city: "dallas" };
  const res = await cityPage(c);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /Every security event in Dallas, in your inbox Sunday morning\. <a href="#subscribe">/);
  assert.match(body, /id="subscribe"/);
  const cities = hiddenCities(body);
  assert.ok(cities.length >= 2);
  assert.deepEqual([...new Set(cities)], ["dallas"]);
});

test("event page: a signup band for the event's city", async () => {
  const db = fakeDb([{ match: /FROM events/, op: "first", reply: () => ({ ...EVENT }) }]);
  const c = ctx("/dallas/events/" + EVENT.slug, db);
  c.params = { city: "dallas", slug: EVENT.slug };
  const res = await eventPage(c);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.deepEqual([...new Set(hiddenCities(body))], ["dallas"]);
  assert.match(body, /Never miss the next one\./);
  assert.match(body, /That includes what ISSA North Texas has coming up\./);
});

test("event page: times are labeled in the event's own zone, not always Pacific", async () => {
  const db = fakeDb([{ match: /FROM events/, op: "first", reply: () => ({ ...EVENT }) }]);
  const c = ctx("/dallas/events/" + EVENT.slug, db);
  c.params = { city: "dallas", slug: EVENT.slug };
  const when = ((await (await eventPage(c)).text()).match(/<dt>When<\/dt><dd>([\s\S]*?)<\/dd>/) || [])[1] || "";
  assert.match(when, /PM Central/);
  assert.doesNotMatch(when, /Pacific/);
});

test("city calendar: canonical without the query, and a title and description for search", async () => {
  const c = ctx("/dallas?topic=grc&utm_source=x", fakeDb());
  c.params = { city: "dallas" };
  const body = await (await cityPage(c)).text();
  assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/dallas">/);
  assert.match(body, /<meta property="og:url" content="https:\/\/bettersecurity\.ai\/dallas">/);
  assert.match(body, /<title>Dallas cybersecurity events calendar \| The Watch Dallas<\/title>/);
  assert.match(body, /<meta name="description" content="Cybersecurity, AI security, privacy and audit events in Dallas, Fort Worth and North Texas: [^"]*plus a free Sunday email\. By Better Security\.">/);
});

test("event page: canonical is the event's own path and the description leads with when and where", async () => {
  const db = fakeDb([{ match: /FROM events/, op: "first", reply: () => ({ ...EVENT }) }]);
  const c = ctx("/dallas/events/" + EVENT.slug + "?s=abc", db);
  c.params = { city: "dallas", slug: EVENT.slug };
  const body = await (await eventPage(c)).text();
  assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/dallas\/events\/issa-north-texas-october">/);
  assert.match(body, /<meta name="description" content="Wednesday, October 28, 2099 in Dallas, hosted by ISSA North Texas\. Monthly chapter meeting\.">/);
});

test("jobs board: a Dallas signup band above the hiring band", async () => {
  const c = ctx("/dallas/jobs", fakeDb());
  c.params = { city: "dallas" };
  const res = await jobsPage(c);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /New Dallas security roles, in your inbox Sunday morning\./);
  assert.match(body, /name="source" value="jobs:dallas"/);
  assert.deepEqual([...new Set(hiddenCities(body))], ["dallas"]);
  assert.ok(body.indexOf('id="subscribe"') < body.indexOf("Hiring in Dallas?"));
});

test("city signup page: names the city, counts the next thirty days, files signups under the city, and is edge cacheable", async () => {
  const { onRequestGet: citySubscribe } = await import("../functions/[city]/subscribe.js");
  const rows = [
    { ...EVENT, id: 1, slug: "a", cost_type: "free", cpe_eligible: 1 },
    { ...EVENT, id: 2, slug: "b", cost_type: "paid", cpe_eligible: 0, title: "Dallas Cyber Summit" },
  ];
  const db = fakeDb([{ match: /FROM events/, op: "all", reply: () => ({ results: rows.map((r) => ({ ...r })) }) }]);
  const c = ctx("/dallas/subscribe", db);
  c.params = { city: "dallas" };
  const res = await citySubscribe(c);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /public/);
  assert.match(body, /<h1>Every security event in Dallas, Fort Worth and North Texas, in one Sunday email\.<\/h1>/);
  assert.match(body, /2 events are on the Dallas calendar over the next thirty days, 1 free and 1 with CPE credit\./);
  assert.ok(hiddenCities(body).length >= 1 && hiddenCities(body).every((x) => x === "dallas"), hiddenCities(body).join(","));
  assert.doesNotMatch(body, /<select name="city">/);
  assert.match(body, /name="source" value="city_subscribe:dallas"/);
  assert.match(body, /Dallas Cyber Summit/);
  assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/dallas\/subscribe">/);

  const empty = ctx("/dallas/subscribe", fakeDb());
  empty.params = { city: "dallas" };
  const b2 = await (await citySubscribe(empty)).text();
  assert.match(b2, /The Dallas calendar is filling up now\./);
  assert.doesNotMatch(b2, /Coming up in Dallas/);

  const shared = ctx("/dallas/subscribe?src=embed", fakeDb());
  shared.params = { city: "dallas" };
  assert.match(await (await citySubscribe(shared)).text(), /name="source" value="embed"/);

  const none = ctx("/nowhere/subscribe", fakeDb());
  none.params = { city: "nowhere" };
  assert.equal((await citySubscribe(none)).status, 404);
});
