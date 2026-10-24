// Feed adapters in functions/_lib/feeds.js: BrightTALK Atom, iCal (Meetup, Luma, The Events Calendar), SANS JSON and
// the aggregator page follow through. Fixtures are handcrafted in the shape of each source; no network is used.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseBrightTalk, parseIcal, parseSans, sansSpeakerName, parseAggregatorPage, firstSentence, plainText, utcToLocalIso, tidyTitle } from "../functions/_lib/feeds.js";
import { fixtureText, fixtureJson } from "./helpers.js";

// The common event shape every adapter hands to runSource.
const EVENT_KEYS = ["uid", "title", "startUtc", "endUtc", "url", "summary", "speakers", "platform", "cpeHint"];
function assertEventShape(e) {
  for (const k of EVENT_KEYS) assert.ok(k in e, `missing ${k}`);
  assert.equal(typeof e.uid, "string");
  assert.equal(typeof e.title, "string");
  assert.ok(e.title.length > 0);
  assert.ok(e.startUtc instanceof Date && !isNaN(e.startUtc));
  assert.ok(e.endUtc instanceof Date && e.endUtc > e.startUtc);
  assert.match(e.url, /^https?:\/\//);
}

describe("parseBrightTalk", () => {
  const items = parseBrightTalk(fixtureText("feeds/brighttalk.atom"));

  test("keeps only upcoming entries that have a start time", () => {
    assert.deepEqual(items.map((e) => e.uid), ["brighttalk:650001", "brighttalk:650002"]);
    items.forEach(assertEventShape);
  });

  test("reads times, entities, speakers and the CPE hint", () => {
    const [a] = items;
    assert.equal(a.title, "Zero Trust & Identity: What's Next for 2027");
    assert.equal(a.startUtc.toISOString(), "2026-11-10T17:00:00.000Z");
    assert.equal(a.endUtc.toISOString(), "2026-11-10T17:45:00.000Z"); // bt:duration 2700 seconds
    assert.equal(a.url, "https://www.brighttalk.com/webcast/13159/650001?utm_source=feed&utm_medium=atom");
    assert.equal(a.speakers, "Jordan Example; Sam Sample");
    assert.equal(a.platform, "BrightTALK");
    assert.equal(a.cpeHint, 1);
  });

  test("falls back to a one hour duration and a webcast URL built from the channel id", () => {
    const b = items[1];
    assert.equal(b.endUtc.getTime() - b.startUtc.getTime(), 3600000);
    assert.equal(b.url, "https://www.brighttalk.com/webcast/13159/650002");
    assert.equal(b.cpeHint, null);
  });

  test("returns nothing for an empty feed", () => {
    assert.deepEqual(parseBrightTalk("<feed></feed>"), []);
  });
});

describe("parseIcal", () => {
  const items = parseIcal(fixtureText("feeds/meetup.ics"));
  const byUid = (u) => items.find((e) => e.uid === `ical:${u}@example.test`);

  test("parses every timed VEVENT and skips all day ones", () => {
    assert.equal(items.length, 6);
    assert.equal(byUid("evt-all-day"), undefined);
    items.forEach(assertEventShape);
  });

  test("converts TZID wall clock times to UTC and unescapes text", () => {
    const e = byUid("evt-in-person");
    assert.equal(e.startUtc.toISOString(), "2026-11-13T02:00:00.000Z"); // 6 PM Pacific standard time
    assert.equal(e.endUtc.toISOString(), "2026-11-13T04:00:00.000Z");
    assert.equal(e.location, "Example Brewing, 123 Main St, San Diego, CA");
    assert.equal(e.online, false);
    assert.equal(e.platform, "other");
  });

  test("unfolds continuation lines and drops the group name line and markdown headings", () => {
    const e = byUid("evt-in-person");
    assert.equal(e.summary, "Agenda\nTwo talks on detection engineering, then networking. 1 CPE available.");
    assert.equal(e.cpeHint, 1);
  });

  test("defaults the end to one hour and marks Zoom locations online", () => {
    const e = byUid("evt-zoom");
    assert.equal(e.endUtc.getTime() - e.startUtc.getTime(), 3600000);
    assert.equal(e.online, true);
    assert.equal(e.platform, "Zoom");
  });

  test("treats a Luma link in LOCATION as an in person event with a withheld address", () => {
    const e = byUid("evt-luma");
    assert.equal(e.location, "Address shared on registration");
    assert.equal(e.online, false);
  });

  test("floating times use the source time zone; the URL comes from the description when there is no URL line", () => {
    const pacific = byUid("evt-floating");
    assert.equal(pacific.startUtc.toISOString(), "2026-12-03T17:00:00.000Z");
    const eastern = parseIcal(fixtureText("feeds/meetup.ics"), "America/New_York").find((e) => e.uid === "ical:evt-floating@example.test");
    assert.equal(eastern.startUtc.toISOString(), "2026-12-03T14:00:00.000Z");
    assert.equal(pacific.url, "https://example.org/register");
    assert.equal(pacific.location, "");
    assert.equal(pacific.online, true); // no LOCATION, but the description says online event
  });

  test("an event with no LOCATION and no online wording is in person", () => {
    assert.equal(byUid("evt-past").online, false);
  });
});

describe("parseIcal with a UTC TZID", () => {
  // An 11:30 meetup whose organizer left the event zone at UTC but typed local wall clock times.
  const ics = (dtstart, dtend = "") => ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:utc-tzid@example.test", "SUMMARY:Lunch and Learn", dtstart, dtend, "URL:https://example.test/lunch", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  const start = (text, opts) => parseIcal(text, "America/Los_Angeles", opts)[0].startUtc.toISOString();

  test("a UTC TZID is read as UTC by default", () => {
    for (const tz of ["UTC+0", "UTC", "GMT", "Etc/UTC", "Etc/GMT", "UTC-00"]) assert.equal(start(ics(`DTSTART;TZID=${tz}:20261112T113000`)), "2026-11-12T11:30:00.000Z", tz);
  });

  test("with utcTzidIsLocal a UTC TZID is read as the feed's own zone, start and end alike", () => {
    const [e] = parseIcal(ics("DTSTART;TZID=UTC+0:20261112T113000", "DTEND;TZID=UTC+0:20261112T130000"), "America/Los_Angeles", { utcTzidIsLocal: true });
    assert.equal(e.startUtc.toISOString(), "2026-11-12T19:30:00.000Z"); // 11:30 Pacific standard time
    assert.equal(e.endUtc.toISOString(), "2026-11-12T21:00:00.000Z");
    assert.equal(start(ics('DTSTART;TZID="Etc/UTC":20261112T113000'), { utcTzidIsLocal: true }), "2026-11-12T19:30:00.000Z");
  });

  test("utcTzidIsLocal leaves a trailing Z and real zone names alone", () => {
    assert.equal(start(ics("DTSTART:20261112T113000Z"), { utcTzidIsLocal: true }), "2026-11-12T11:30:00.000Z");
    assert.equal(start(ics("DTSTART;TZID=America/New_York:20261112T113000"), { utcTzidIsLocal: true }), "2026-11-12T16:30:00.000Z");
  });

  test("an unknown TZID falls back to the feed's zone instead of failing the feed", () => {
    assert.equal(start(ics("DTSTART;TZID=Not/A_Zone:20261112T113000")), "2026-11-12T19:30:00.000Z");
  });
});

describe("parseSans", () => {
  const items = parseSans(fixtureJson("feeds/sans.json"));

  test("keeps hits with a start date and time", () => {
    assert.deepEqual(items.map((e) => e.uid), ["sans:wc-101", "sans:uid-303"]);
    items.forEach(assertEventShape);
    items.forEach((e) => { assert.equal(e.online, true); assert.equal(e.platform, "SANS"); });
  });

  test("builds absolute URLs, joins speakers and reads CPE hours", () => {
    const [a, b] = items;
    assert.equal(a.title, "Cloud Incident Response in Practice");
    assert.equal(a.url, "https://www.sans.org/webcasts/cloud-incident-response-in-practice/");
    assert.equal(a.speakers, "Jordan Example; Sam Sample");
    assert.equal(a.cpeHint, 1);
    assert.equal(a.cpeHours, 1);
    assert.equal(a.summary, "How responders scope a cloud incident.");
    assert.equal(b.url, "https://www.sans.org/webcasts/purple-team-basics/");
    assert.equal(b.endUtc.toISOString(), "2026-11-07T18:30:00.000Z");
    assert.equal(b.cpeHint, null);
    assert.equal(b.cpeHours, null);
  });

  test("speaker names as SANS sends them now: a name object with first, middle and last", () => {
    assert.equal(sansSpeakerName({ name: { prefix: "", first: "Robert", middle: "M.", last: "Lee", postfix: "" }, url: "/profiles/robert-m-lee" }), "Robert M. Lee");
    assert.equal(sansSpeakerName({ name: "Jordan Example" }), "Jordan Example");
    assert.equal(sansSpeakerName("Sam Sample"), "Sam Sample");
    assert.equal(sansSpeakerName({ url: "/profiles/x" }), null);
    assert.equal(sansSpeakerName({ name: { first: "" } }), null);
    const [hit] = parseSans({ results: [{ hits: [{ title: "T", utcStartDate: "2026-11-01", utcStartTime: "17:00:00", url: "/webcasts/t/", webcastId: "w1",
      speakers: [{ name: { prefix: "", first: "Tim", middle: "", last: "Conway", postfix: "" } }, { name: { first: "Brian", last: "Harrell" } }] }] }] });
    assert.equal(hit.speakers, "Tim Conway; Brian Harrell");
    assert.doesNotMatch(hit.speakers, /object/);
  });

  test("tolerates an empty or malformed response", () => {
    assert.deepEqual(parseSans(null), []);
    assert.deepEqual(parseSans({ results: [] }), []);
  });
});

describe("parseAggregatorPage", () => {
  test("finds the organizer's own registration link, name and website", () => {
    assert.deepEqual(parseAggregatorPage(fixtureText("feeds/freelivecpe-event.html")), {
      registrationUrl: "https://events.example-firm.test/webcast/register?id=42&src=flc",
      organizerName: "Example Firm LLP",
      organizerUrl: "https://www.freelivecpe.com/organizer/example-firm/",
      organizerWebsite: "https://www.example-firm.test/",
    });
  });

  test("returns nulls when the page has no Events Calendar blocks", () => {
    assert.deepEqual(parseAggregatorPage("<html><body>Nothing here</body></html>"), { registrationUrl: null, organizerName: null, organizerUrl: null });
  });
});

describe("tidyTitle", () => {
  const cases = [
    ["CISO Roundtable - Cloud Risk", "CISO Roundtable: Cloud Risk"], // first separator becomes a colon
    ["Cloud Risk \u2013 Lessons Learned \u2014 Part 2", "Cloud Risk: Lessons Learned, Part 2"], // en and em dashes, later ones commas
    ["Threat Briefing: Q4 - Ransomware | Identity", "Threat Briefing: Q4, Ransomware, Identity"], // a colon already present
    ["CISO Roundtable | October 2026", "CISO Roundtable"], // trailing month and year
    ["CISO Roundtable | Sept. 2026", "CISO Roundtable"],
    ["AppSec Meetup - TBD", "AppSec Meetup"],
    ["**Hack the Box!!!** Night", "Hack the Box Night"], // asterisks and exclamation runs
    ["Cloud Security Office Hours!", "Cloud Security Office Hours"], // trailing exclamation
    ["Yahoo! Security Day", "Yahoo! Security Day"], // a single brand "!" stays
    ['Panel "AI Risk" Session', 'Panel "AI Risk" Session'], // balanced quotes stay
    ['Panel "AI Risk Session', "Panel AI Risk Session"], // an unmatched quote goes
    ["  Spaced   out  \u2013  title ", "Spaced out: title"],
    ["Cyber-Security 101", "Cyber-Security 101"], // a hyphen inside a word is not a separator
    ["BSides|Talk", "BSides|Talk"], // a pipe without spaces is left alone
  ];
  for (const [input, want] of cases) test(JSON.stringify(input), () => assert.equal(tidyTitle(input), want));

  test("empty input", () => {
    assert.equal(tidyTitle(null), "");
    assert.equal(tidyTitle("***"), "");
  });
});

describe("text helpers", () => {
  test("plainText removes markdown emphasis, rules and bare labels", () => {
    assert.equal(plainText("**Description:**\n***\nA *talk* on __threat__ hunting."), "A talk on threat hunting.");
    assert.equal(plainText("Description:\nBody"), "Body");
  });

  test("firstSentence skips a headline line and cuts long text at a sentence end", () => {
    assert.equal(firstSentence("Panel on Cloud Risk\nThree speakers compare notes."), "Three speakers compare notes.");
    const long = "This opening sentence is long enough to pass the eighty character threshold for cutting. " + "More words follow here. ".repeat(10);
    assert.equal(firstSentence(long, 100), "This opening sentence is long enough to pass the eighty character threshold for cutting.");
    assert.equal(firstSentence(long, 120), "This opening sentence is long enough to pass the eighty character threshold for cutting. More words follow here.");
    assert.ok(firstSentence("word ".repeat(100), 50).length <= 50);
  });

  test("utcToLocalIso renders wall clock time in the given zone", () => {
    assert.equal(utcToLocalIso(new Date("2026-11-13T02:00:00Z")), "2026-11-12T18:00:00");
    assert.equal(utcToLocalIso(new Date("2026-11-13T02:00:00Z"), "America/New_York"), "2026-11-12T21:00:00");
    assert.equal(utcToLocalIso(new Date("2026-07-01T07:00:00Z")), "2026-07-01T00:00:00"); // midnight, not hour 24
  });
});
