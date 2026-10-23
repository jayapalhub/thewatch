import { test } from "node:test";
import assert from "node:assert/strict";
import { signupForm, emailValueLine, subscribeBand } from "../functions/_lib/layout.js";

const hiddenCity = (s) => (String(s).match(/<input type="hidden" name="city" value="([a-z]+)">/) || [])[1] || null;
const selectedCity = (s) => (String(s).match(/<option value="([a-z]+)" selected>/) || [])[1] || null;

test("a form on a city page carries that city", () => {
  assert.equal(hiddenCity(signupForm({ source: "calendar:sanjose", city: "sanjose" })), "sanjose");
});

test("a form with no city sends none rather than the default city", () => {
  // The server then files the address by its source (calendar:<slug>) before falling back to the default.
  assert.equal(hiddenCity(signupForm({ source: "event:some-event" })), null);
});

test("an unknown city is never sent", () => {
  assert.equal(hiddenCity(signupForm({ source: "x", city: "atlantis" })), null);
});

test("the city picker preselects the given city, else the default", () => {
  const picked = signupForm({ source: "virtual", chooseCity: true, city: "sanjose" });
  assert.equal(hiddenCity(picked), null);
  assert.equal(selectedCity(picked), "sanjose");
  assert.equal(selectedCity(signupForm({ source: "virtual", chooseCity: true })), "sandiego");
});

test("the value line names the city and the Sunday send", () => {
  assert.equal(emailValueLine({ name: "Dallas", newsletter: "sunday" }), "Every security event in Dallas, in your inbox Sunday morning.");
  assert.match(emailValueLine({ name: "Reno", newsletter: null }), /starts soon/);
});

test("a city signup band is anchored, carries the city and nothing about the visitor", () => {
  const band = String(subscribeBand({ city: { slug: "sanjose", name: "San Jose", newsletter: "sunday" }, source: "jobs:sanjose" }));
  assert.match(band, /id="subscribe"/);
  assert.match(band, /Every security event in San Jose, in your inbox Sunday morning\./);
  assert.equal(hiddenCity(band), "sanjose");
  assert.match(band, /name="source" value="jobs:sanjose"/);
});
