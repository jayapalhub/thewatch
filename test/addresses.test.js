// Event addresses go to search engines as PostalAddress fields, read from the stored text at render time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { postalAddress, eventObject } from "../functions/_lib/events.js";

const PA = (o) => ({ "@type": "PostalAddress", addressCountry: "US", ...o });

test("a full address splits into street, city, state and ZIP", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("3650 N Nevada Ave, Colorado Springs, CO 80907"))),
    PA({ streetAddress: "3650 N Nevada Ave", addressLocality: "Colorado Springs", addressRegion: "CO", postalCode: "80907" }));
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("1 Market St, Suite 300, San Francisco, CA 94105-1420, USA"))),
    PA({ streetAddress: "1 Market St, Suite 300", addressLocality: "San Francisco", addressRegion: "CA", postalCode: "94105" }));
});

test("a city and state alone, a trailing note, a neighborhood or a placeholder never become a street", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("Houston, TX"))), PA({ addressLocality: "Houston", addressRegion: "TX" }));
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("Irvine, CA (Orange County)"))), PA({ addressLocality: "Irvine", addressRegion: "CA" }));
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("SoHo, New York, NY"))), PA({ addressLocality: "New York", addressRegion: "NY" }));
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("Address shared on registration, El Segundo, CA"))), PA({ addressLocality: "El Segundo", addressRegion: "CA" }));
  assert.deepEqual(JSON.parse(JSON.stringify(postalAddress("The Broadmoor, 1 Lake Ave, Colorado Springs, CO 80906"))),
    PA({ streetAddress: "1 Lake Ave", addressLocality: "Colorado Springs", addressRegion: "CO", postalCode: "80906" }));
});

test("text that is not a US address is passed through, and nothing gives nothing", () => {
  assert.equal(postalAddress("Address shared on registration"), "Address shared on registration");
  assert.equal(postalAddress(""), undefined);
  assert.equal(postalAddress(null), undefined);
});

test("event location: a place with a PostalAddress; hybrid adds the online location; virtual is online only", () => {
  const e = { title: "Meeting", slug: "m", city: "dallas", start_at: "2099-01-01T18:00", format: "in_person", venue_display: "Example Hall", venue_address_display: "1 Main St, Dallas, TX 75201", registration_url: "https://example.test/r" };
  const inPerson = eventObject(e, "https://bettersecurity.ai").location;
  assert.equal(inPerson["@type"], "Place");
  assert.equal(inPerson.address.streetAddress, "1 Main St");
  assert.equal(inPerson.address.postalCode, "75201");
  const hybrid = eventObject({ ...e, format: "hybrid" }, "https://bettersecurity.ai").location;
  assert.deepEqual(hybrid.map((l) => l["@type"]), ["Place", "VirtualLocation"]);
  const online = eventObject({ ...e, format: "virtual" }, "https://bettersecurity.ai").location;
  assert.equal(online["@type"], "VirtualLocation");
  assert.equal(online.url, "https://example.test/r");
});
