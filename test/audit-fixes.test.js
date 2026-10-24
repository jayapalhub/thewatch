// Fixes from the 2026-10-23 site audit: no forty-tab city strip, long links wrap and are clickable, and people who
// hit a missing page get a real page with a way back instead of plain text.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { onRequest as middleware, wantsNotFoundPage } from "../functions/_middleware.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { linkify, notFound } from "../functions/_lib/html.js";
import { CITIES } from "../functions/_lib/constants.js";
import { rememberEnvironment } from "../functions/_lib/env.js";
import { fakeDb } from "./helpers.js";

const req = (path, accept = "text/html") => new Request("https://bettersecurity.ai" + path, { headers: { accept } });

async function through(path, next, accept = "text/html") {
  const request = req(path, accept);
  const env = { ENVIRONMENT: "production", DB: fakeDb(), SITE_URL: "https://bettersecurity.ai" };
  rememberEnvironment(env);
  return middleware({ request, env, params: {}, waitUntil: () => {}, next });
}

describe("city calendar header", () => {
  test("no strip of every city; a Change city link instead", async () => {
    const res = await cityPage({ request: req("/sandiego"), env: { DB: fakeDb() }, params: { city: "sandiego" }, waitUntil: () => {} });
    const body = await res.text();
    assert.doesNotMatch(body, /city-toggle/);
    assert.match(body, /<a class="change-city" href="\/\?choose=1">Change city<\/a>/);
    assert.match(body, /aria-label="View"/);
  });
});

describe("linkify", () => {
  test("links become anchors, text stays escaped, trailing punctuation stays outside", () => {
    const out = String(linkify("Zoom option: https://us02web.zoom.us/webinar/register/WN_x. Bring <ID>"));
    assert.match(out, /^Zoom option: <a href="https:\/\/us02web\.zoom\.us\/webinar\/register\/WN_x" rel="noopener nofollow" target="_blank">us02web\.zoom\.us\/webinar\/register\/WN_x<\/a>\. Bring &lt;ID&gt;$/);
    assert.equal(String(linkify("No links here")), "No links here");
    assert.equal(String(linkify(null)), "");
    assert.doesNotMatch(String(linkify('https://x.test/"onmouseover="alert(1)')), /"onmouseover/);
  });
});

describe("not found page", () => {
  test("an unknown event under a city gets the branded page pointing back to that city", async () => {
    const res = await through("/sandiego/events/nope", async () => notFound("Event not found"));
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const body = await res.text();
    assert.match(body, /We couldn't find that page\./);
    assert.match(body, new RegExp(`href="/sandiego">Go to the ${CITIES.sandiego.name} calendar`));
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
  test("an unknown top level path points to the city chooser", async () => {
    const body = await (await through("/no-such-page", async () => notFound())).text();
    assert.match(body, /href="\/\?choose=1">Choose your city/);
  });
  test("APIs, images, feeds and non HTML requests keep their plain 404", async () => {
    for (const p of ["/api/x", "/logo/nobody", "/sandiego/feed.ics", "/og/city/x.png", "/admin/events/9"]) assert.equal(wantsNotFoundPage(req(p), p, notFound()), false, p);
    assert.equal(wantsNotFoundPage(req("/sandiego/events/x", "application/json"), "/sandiego/events/x", notFound()), false);
    const api = await through("/api/nothing", async () => notFound());
    assert.equal(await api.text(), "Not found");
  });
});
