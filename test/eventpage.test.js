import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEventPage, addressText } from "../functions/_lib/eventpage.js";

const page = (ld) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

test("reads venue name and a Meetup style address without repeats", () => {
  const v = parseEventPage(page({ "@context": "https://schema.org", "@type": "Event", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: "Example Brewpub", address: { "@type": "PostalAddress", streetAddress: "100 Main St, Example City, WI 53129, USA", addressLocality: "Example City", addressRegion: "WI" } } }));
  assert.equal(v.name, "Example Brewpub");
  assert.equal(v.address, "100 Main St, Example City, WI 53129");
  assert.equal(v.online, false);
});

test("marks an online event from the attendance mode", () => {
  const v = parseEventPage(page({ "@type": "Event", eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode", location: { "@type": "VirtualLocation", url: "https://example.test/live" } }));
  assert.equal(v.online, true);
  assert.equal(v.name, null);
});

test("finds the Event inside an @graph and ignores other blocks", () => {
  const v = parseEventPage(`<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>` + page({ "@graph": [{ "@type": "WebPage" }, { "@type": "SocialEvent", location: { "@type": "Place", name: "Hall", address: "1 Road, Town, ST" } }] }));
  assert.equal(v.name, "Hall");
  assert.equal(v.address, "1 Road, Town, ST");
});

test("returns null when the page has no Event data", () => {
  assert.equal(parseEventPage("<html><body>No data</body></html>"), null);
  assert.equal(parseEventPage('<script type="application/ld+json">{broken</script>'), null);
});

test("addressText keeps each part once and drops USA", () => {
  assert.equal(addressText({ streetAddress: "4001 SW 142nd Ave, Davie, FL", addressLocality: "Davie", addressRegion: "FL" }), "4001 SW 142nd Ave, Davie, FL");
  assert.equal(addressText(null), null);
});
