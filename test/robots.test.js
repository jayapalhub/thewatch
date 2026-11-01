// /robots.txt must be ours in production: the [city] route used to swallow it and Cloudflare served a file with no rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest as middleware, ROBOTS } from "../functions/_middleware.js";
import { rememberEnvironment } from "../functions/_lib/env.js";
import { fakeDb } from "./helpers.js";

test("the served robots.txt matches public/robots.txt and never reaches the city route", async () => {
  assert.equal(ROBOTS, readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8"));
  const env = { ENVIRONMENT: "production", DB: fakeDb(), SITE_URL: "https://bettersecurity.ai" };
  rememberEnvironment(env);
  const res = await middleware({ request: new Request("https://bettersecurity.ai/robots.txt"), env, params: {}, waitUntil: () => {}, next: async () => { throw new Error("city route must not run"); } });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Sitemap: https:\/\/bettersecurity\.ai\/sitemap\.xml/);
  assert.match(body, /Disallow: \/\*\?/);
});
