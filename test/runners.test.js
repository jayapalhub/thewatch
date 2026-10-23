// The runners that turn adapter output into rows: runJobSource (including the Workday still open check before a role
// is closed) and the feed runSource. D1 is replaced by a fake that records statements; no database is touched.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runJobSource } from "../functions/_lib/job-sources.js";
import { runSource, enrichFromAggregator } from "../functions/_lib/feeds.js";
import { fakeDb, insertRow, recordingFetcher, fixtureJson, fixtureText, stubGlobalFetch } from "./helpers.js";

const NOW = new Date("2026-10-23T00:00:00Z");
const updatesTo = (db, re) => db.find(re).filter((c) => c.op === "run").map((c) => c.args[c.args.length - 1]);

describe("runJobSource", () => {
  const greenhouseSrc = () => ({ id: 7, kind: "greenhouse", employer_name: "Example Corp", organization_id: 3, config: '{"board":"examplecorp"}', search_text: "security", location_terms: "San Diego", city: "sandiego" });

  test("files in city roles as pending_review, closes roles that left the board and rejects out of scope titles", async () => {
    const db = fakeDb([
      { match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: [
        { id: 50, source_key: "1001", url: "https://boards.greenhouse.io/examplecorp/jobs/1001", title: "Senior Security Engineer" },
        { id: 51, source_key: "999", url: "https://boards.greenhouse.io/examplecorp/jobs/999", title: "Security Analyst" },
        { id: 52, source_key: "998", url: "https://boards.greenhouse.io/examplecorp/jobs/998", title: "Office Manager" },
      ] }) },
    ]);
    const run = await runJobSource(db, greenhouseSrc(), { fetcher: recordingFetcher(() => fixtureJson("jobs/greenhouse.json")), now: NOW });
    assert.deepEqual(run, { source: "Example Corp", fetched: 3, added: 1, closed: 1, skipped: 2 });

    const inserts = db.find(/INSERT INTO jobs/);
    assert.equal(inserts.length, 1);
    const row = insertRow(inserts[0]);
    assert.equal(row.status, "pending_review");
    assert.equal(row.hold, 0);
    assert.equal(row.source, "sweep");
    assert.equal(row.auto_publish_at, "2026-10-24 00:00:00");
    assert.equal(row.city, "sandiego");
    assert.equal(row.organization_id, 3);
    assert.equal(row.title, "Senior Security Engineer");
    assert.equal(row.url, "https://boards.greenhouse.io/examplecorp/jobs/1001");
    assert.equal(row.location, "San Diego, CA");
    assert.equal(row.salary_text, "$150,000 - $190,000");
    assert.equal(row.seniority, "practitioner");
    assert.equal(row.source_key, "1001");
    assert.match(row.reviewer_notes, /^From the Greenhouse board on 2026-10-23\./);

    assert.deepEqual(updatesTo(db, /SET status='closed'/), [51]);
    assert.deepEqual(updatesTo(db, /SET status='rejected'/), [52]);
    const status = db.find(/UPDATE job_sources SET last_run_at/)[0];
    assert.equal(status.args[0], "3 matched, 1 added, 1 closed");
  });

  test("refreshes a known role instead of inserting it, and skips a same title twin", async () => {
    const db = fakeDb([
      { match: /SELECT id, status FROM jobs/, reply: (args) => (args[1] === "1001" ? { id: 50, status: "published" } : null) },
    ]);
    const fetcher = recordingFetcher(() => ({ jobs: [
      { id: 1001, title: "Senior Security Engineer", absolute_url: "https://boards.greenhouse.io/examplecorp/jobs/1001", location: { name: "San Diego" }, content: "$150,000 - $190,000" },
      { id: 1006, title: "Security Analyst", absolute_url: "https://boards.greenhouse.io/examplecorp/jobs/1006", location: { name: "San Diego" } },
    ] }));
    const twinDb = fakeDb([
      { match: /SELECT id, status FROM jobs/, reply: () => null },
      { match: /lower\(title\)=lower\(\?\)/, reply: (args) => (args[1] === "Security Analyst" ? { id: 70 } : null) },
    ]);
    const run = await runJobSource(db, greenhouseSrc(), { fetcher, now: NOW });
    assert.equal(run.added, 1); // 1006 is new on this db
    assert.equal(db.find(/UPDATE jobs SET salary_text=COALESCE/).length, 1);
    assert.equal(db.find(/UPDATE jobs SET salary_text=COALESCE/)[0].args.at(-1), 50);

    const twinRun = await runJobSource(twinDb, greenhouseSrc(), { fetcher, now: NOW });
    assert.equal(twinRun.added, 1); // 1001 added, 1006 skipped as a twin of row 70
    assert.equal(twinRun.skipped, 1);
  });

  test("creates the employer organization when the source has none", async () => {
    const src = { ...greenhouseSrc(), organization_id: null };
    const db = fakeDb([{ match: /SELECT id FROM organizations/, reply: () => ({ id: 9 }) }]);
    await runJobSource(db, src, { fetcher: recordingFetcher(() => ({ jobs: [] })), now: NOW });
    assert.equal(src.organization_id, 9);
    assert.deepEqual(db.find(/UPDATE job_sources SET organization_id/)[0].args, [9, 7]);
  });

  test("an adapter error records the error and closes nothing", async () => {
    const db = fakeDb([{ match: /SELECT id, source_key, url, title FROM jobs/, reply: () => { throw new Error("must not be read"); } }]);
    const run = await runJobSource(db, greenhouseSrc(), { fetcher: recordingFetcher(() => { throw new Error("HTTP 500"); }), now: NOW });
    assert.equal(run.error, "HTTP 500");
    assert.equal(run.closed, 0);
    assert.equal(db.find(/UPDATE job_sources SET last_run_at/)[0].args[0], "error: HTTP 500");
  });

  test("an unknown kind is an error", async () => {
    const run = await runJobSource(fakeDb(), { ...greenhouseSrc(), kind: "taleo" }, { fetcher: recordingFetcher(() => null), now: NOW });
    assert.equal(run.error, "unknown kind taleo");
  });
});

describe("runJobSource suspect status", () => {
  const src = { id: 9, kind: "lever", employer_name: "Example Corp", organization_id: 3, config: '{"company":"examplecorp"}', search_text: "security", location_terms: "San Diego", city: "sandiego" };
  const live = (n) => Array.from({ length: n }, (_, i) => ({ id: 200 + i, source_key: `k${i}`, url: `https://jobs.lever.co/examplecorp/k${i}`, title: i === 0 ? "Office Manager" : "Security Engineer" }));
  const dbWith = (n) => fakeDb([{ match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: live(n) }) }]);
  const statusOf = (db) => db.find(/UPDATE job_sources SET last_run_at/)[0].args[0];

  test("a board that reads nothing while three or more roles are live closes nothing and is flagged", async () => {
    const db = dbWith(3);
    const run = await runJobSource(db, src, { fetcher: recordingFetcher(() => []), now: NOW });
    assert.equal(run.closed, 0);
    assert.equal(run.suspect, "read nothing but 3 roles are live; none closed, check the board");
    assert.equal(statusOf(db), "suspect: read nothing but 3 roles are live; none closed, check the board");
    assert.equal(db.find(/SET status='closed'/).length, 0);
    assert.equal(db.find(/SET status='rejected'/).length, 0); // the out of scope title waits too
  });

  test("with fewer than three live roles an empty read is a real wind down and they close", async () => {
    const db = dbWith(2);
    const run = await runJobSource(db, src, { fetcher: recordingFetcher(() => []), now: NOW });
    assert.equal(run.suspect, undefined);
    assert.deepEqual(updatesTo(db, /SET status='closed'/), [201]);
    assert.deepEqual(updatesTo(db, /SET status='rejected'/), [200]);
    assert.equal(statusOf(db), "0 matched, 0 added, 1 closed");
  });

  test("a board that read roles, even none in this city, closes missing roles as usual", async () => {
    const db = dbWith(3);
    const fetcher = recordingFetcher(() => [{ id: "x1", text: "Security Engineer", hostedUrl: "https://jobs.lever.co/examplecorp/x1", categories: { location: "Austin, TX" } }]);
    const run = await runJobSource(db, src, { fetcher, now: NOW });
    assert.equal(run.fetched, 1);
    assert.equal(run.suspect, undefined);
    assert.equal(run.closed, 2);
  });

  test("Workday is exempt: each missing role is still checked one by one", async () => {
    const wsrc = { ...src, kind: "workday", config: '{"tenant":"examplecorp","host":"wd5","site":"External"}' };
    const db = fakeDb([{ match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: Array.from({ length: 3 }, (_, i) => ({ id: 300 + i, source_key: `R${i}`, title: "Security Engineer", url: `https://examplecorp.wd5.myworkdayjobs.com/External/job/San-Diego-CA/Security-Engineer_R${i}` })) }) }]);
    const fetcher = recordingFetcher((url, init, body) => { if (body) return { total: 0, jobPostings: [] }; throw new Error("HTTP 404"); });
    const run = await runJobSource(db, wsrc, { fetcher, now: NOW });
    assert.equal(run.suspect, undefined);
    assert.equal(run.closed, 3);
  });
});

describe("Workday still open check", () => {
  const src = { id: 8, kind: "workday", employer_name: "Example Corp", organization_id: 3, config: '{"tenant":"examplecorp","host":"wd5","site":"External"}', search_text: "security", location_terms: "San Diego", city: "sandiego" };
  const base = "https://examplecorp.wd5.myworkdayjobs.com";
  const liveRows = (rows) => fakeDb([{ match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: rows }) }]);

  test("asks Workday for each missing role and closes only the ones it no longer has", async () => {
    const db = liveRows([
      { id: 60, source_key: "R1", title: "Security Engineer", url: `${base}/en-US/External/job/San-Diego-CA/Security-Engineer_R1?source=careers` },
      { id: 61, source_key: "R2", title: "Security Analyst", url: `${base}/External/job/San-Diego-CA/Security-Analyst_R2` },
      { id: 62, source_key: "R3", title: "GRC Analyst", url: `${base}/External/job/San-Diego-CA/GRC-Analyst_R3` },
      { id: 63, source_key: "R4", title: "Privacy Analyst", url: `${base}/External/job/San-Diego-CA/Privacy-Analyst_R4` },
      { id: 64, source_key: "R5", title: "Threat Analyst", url: "https://example.test/careers/R5" },
      { id: 65, source_key: "R6", title: "Cyber Risk Analyst", url: `${base}/External/job/San-Diego-CA/Risk-Analyst_R6` },
      { id: 66, source_key: "R7", title: "IT Audit Manager", url: `${base}/External/job/San-Diego-CA/Audit-Analyst_R7` },
    ]);
    const fetcher = recordingFetcher((url, init, body) => {
      if (body) return { total: 0, jobPostings: [] };
      if (url.endsWith("_R1")) return { jobPostingInfo: { title: "Security Engineer" } };
      if (url.endsWith("_R2")) throw new Error("HTTP 404");
      if (url.endsWith("_R3")) throw new Error("network connection lost");
      if (url.endsWith("_R4")) return {};
      if (url.endsWith("_R6")) throw new Error('HTTP 403 ({"errorCode":"S22","errorCaseId":"0191","httpStatus":403,"message":"permission denied"})');
      if (url.endsWith("_R7")) throw new Error("HTTP 403 (Access denied by firewall)");
      throw new Error("unexpected " + url);
    });
    const run = await runJobSource(db, src, { fetcher, now: NOW });
    const details = fetcher.calls.filter((c) => !c.body).map((c) => c.url);
    assert.deepEqual(details, [
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/Security-Engineer_R1`, // locale and query string dropped
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/Security-Analyst_R2`,
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/GRC-Analyst_R3`,
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/Privacy-Analyst_R4`,
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/Risk-Analyst_R6`,
      `${base}/wday/cxs/examplecorp/External/job/San-Diego-CA/Audit-Analyst_R7`,
    ]);
    assert.deepEqual(updatesTo(db, /SET status='closed'/), [61, 63, 65]); // 404, an answer without jobPostingInfo, Workday's S22 403
    assert.deepEqual(updatesTo(db, /UPDATE jobs SET last_checked_at/), [60, 62, 64, 66]); // open, network trouble, not a Workday URL, a firewall 403
    assert.equal(run.closed, 3);
  });

  test("checks at most twelve roles per run and leaves the rest for the next one", async () => {
    const db = liveRows(Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, source_key: `R${i}`, title: "Security Engineer", url: `${base}/External/job/San-Diego-CA/Security-Engineer_R${i}` })));
    const fetcher = recordingFetcher((url, init, body) => { if (body) return { total: 0, jobPostings: [] }; throw new Error("HTTP 404"); });
    const run = await runJobSource(db, src, { fetcher, now: NOW });
    assert.equal(fetcher.calls.filter((c) => !c.body).length, 12);
    assert.equal(run.closed, 12);
    assert.deepEqual(updatesTo(db, /SET status='closed'/), Array.from({ length: 12 }, (_, i) => 100 + i));
  });
});

describe("runSource (feeds)", () => {
  let stub;
  afterEach(() => stub && stub.restore());
  const icalSrc = (extra = {}) => ({ id: 4, name: "Example Meetup", kind: "ical", url: "https://www.meetup.com/example-security-group/events/ical/", city: "sandiego", timezone: "America/Los_Angeles", organization_id: 12, topics: '["network"]', keywords: null, cpe_default: 0, cpe_body: null, ...extra });

  test("files upcoming feed events inside the window as pending_review and skips duplicates", async () => {
    stub = stubGlobalFetch(() => ({ body: fixtureText("feeds/meetup.ics") }));
    const db = fakeDb([{ match: /SELECT id FROM events WHERE feed_uid=\?/, reply: (args) => (args[0] === "ical:evt-zoom@example.test" ? { id: 1 } : null) }]);
    const stats = await runSource(db, icalSrc(), { now: NOW });
    // six timed events: September is past, March 2027 is beyond 90 days, the Zoom one is already on file
    assert.deepEqual(stats, { source_id: 4, name: "Example Meetup", fetched: 4, added: 3, skipped: 3, error: null });
    assert.equal(stub.calls[0].url, "https://www.meetup.com/example-security-group/events/ical/");

    const rows = db.find(/INSERT INTO events/).map(insertRow);
    assert.deepEqual(rows.map((r) => r.feed_uid), ["ical:evt-in-person@example.test", "ical:evt-luma@example.test", "ical:evt-floating@example.test"]);
    for (const r of rows) {
      assert.equal(r.status, "pending_review");
      assert.equal(r.source, "feed");
      assert.match(r.auto_publish_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      assert.equal(r.topics, '["network"]');
      assert.equal(r.organization_id, 12);
    }
    const [inPerson, luma, floating] = rows;
    assert.equal(inPerson.slug, "monthly-meetup-detection-engineering-2026-11-12");
    assert.equal(inPerson.start_at, "2026-11-12T18:00:00");
    assert.equal(inPerson.start_utc, "2026-11-13T02:00:00.000Z");
    assert.equal(inPerson.timezone, "America/Los_Angeles");
    assert.equal(inPerson.format, "in_person");
    assert.equal(inPerson.venue_name, "Example Brewing, 123 Main St, San Diego, CA");
    assert.equal(inPerson.registration_url, "https://www.meetup.com/example-security-group/events/311000001/");
    assert.equal(inPerson.cpe_eligible, 1);
    assert.equal(inPerson.cpe_body, "self_reported");
    assert.equal(inPerson.cost_type, "unknown");
    assert.equal(luma.format, "in_person");
    assert.equal(luma.venue_name, "Address shared on registration");
    assert.equal(floating.format, "virtual");
    assert.equal(floating.venue_address, "Virtual");
    assert.equal(floating.also_virtual, 1);

    const log = db.find(/INSERT INTO feed_runs/)[0];
    assert.deepEqual(log.args, [4, 4, 3, 3, null]);
    assert.equal(db.find(/UPDATE feed_sources SET last_run_at/)[0].args[0], "ok, 4 upcoming, 3 new");
  });

  test("a title: keyword list matches whole words in the title only", async () => {
    stub = stubGlobalFetch(() => ({ body: fixtureText("feeds/meetup.ics") }));
    const db = fakeDb();
    const stats = await runSource(db, icalSrc({ keywords: "title:AppSec, Social" }), { now: NOW });
    assert.equal(stats.added, 2);
    assert.deepEqual(db.find(/INSERT INTO events/).map(insertRow).map((r) => r.title), ["Security Social", "AppSec Office Hours"]);
  });

  test("BrightTALK rows are free, virtual and take the source's CPE default", async () => {
    stub = stubGlobalFetch(() => ({ body: fixtureText("feeds/brighttalk.atom") }));
    const db = fakeDb();
    const stats = await runSource(db, { id: 5, name: "Example BrightTALK", kind: "brighttalk", url: "https://www.brighttalk.com/service/channel/v2/channel/13159/feed", city: "virtual", organization_id: null, topics: "[]", cpe_default: 1, cpe_body: "ISC2" }, { now: NOW });
    assert.equal(stats.added, 2);
    const [a] = db.find(/INSERT INTO events/).map(insertRow);
    assert.equal(a.city, "virtual");
    assert.equal(a.format, "virtual");
    assert.equal(a.platform, "BrightTALK");
    assert.equal(a.venue_name, "BrightTALK");
    assert.equal(a.cost_type, "free");
    assert.equal(a.cost_min, 0);
    assert.equal(a.cpe_eligible, 1);
    assert.equal(a.cpe_body, "ISC2");
    assert.equal(a.topics, '["threat_intel"]'); // empty topics fall back
    assert.equal(a.speakers, "Jordan Example; Sam Sample");
  });

  test("titles are tidied into house style before they are filed", async () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:tidy@example.test", "SUMMARY:**Cloud Security Night!!** - Lightning Talks | November 2026", "DTSTART:20261112T020000Z", "URL:https://example.test/night", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    stub = stubGlobalFetch(() => ({ body: ics }));
    const db = fakeDb();
    await runSource(db, icalSrc(), { now: NOW });
    const [row] = db.find(/INSERT INTO events/).map(insertRow);
    assert.equal(row.title, "Cloud Security Night: Lightning Talks");
    assert.equal(row.slug, "cloud-security-night-lightning-talks-2026-11-11");
  });

  test("a UTC TZID is read as local time only for the WiCyS hosts", async () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:wicys@example.test", "SUMMARY:Lunch and Learn", "DTSTART;TZID=UTC+0:20261112T113000", "DTEND;TZID=UTC+0:20261112T130000", "URL:https://example.test/lunch", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const startFor = async (url) => {
      stub = stubGlobalFetch(() => ({ body: ics }));
      const db = fakeDb();
      await runSource(db, icalSrc({ url }), { now: NOW });
      stub.restore();
      return insertRow(db.find(/INSERT INTO events/)[0]);
    };
    for (const host of ["www.wicys.org", "wicys.org"]) {
      const row = await startFor(`https://${host}/events/?ical=1`);
      assert.equal(row.start_at, "2026-11-12T11:30:00", host);
      assert.equal(row.start_utc, "2026-11-12T19:30:00.000Z", host);
      assert.equal(row.end_at, "2026-11-12T13:00:00", host);
    }
    const other = await startFor("https://www.meetup.com/example-group/events/ical/");
    assert.equal(other.start_at, "2026-11-12T03:30:00");
    assert.equal(other.start_utc, "2026-11-12T11:30:00.000Z");
  });

  test("an HTTP error is logged on the source and nothing is inserted", async () => {
    stub = stubGlobalFetch(() => ({ status: 403, body: "Forbidden" }));
    const db = fakeDb();
    const stats = await runSource(db, icalSrc(), { now: NOW });
    assert.equal(stats.error, "HTTP 403");
    assert.equal(db.find(/INSERT INTO events/).length, 0);
    assert.equal(db.find(/UPDATE feed_sources SET last_run_at/)[0].args[0], "error: HTTP 403");
  });
});

describe("enrichFromAggregator", () => {
  let stub;
  afterEach(() => stub && stub.restore());

  test("swaps an aggregator link for the organizer's own registration page and files the organizer", async () => {
    stub = stubGlobalFetch(() => ({ body: fixtureText("feeds/freelivecpe-event.html") }));
    const db = fakeDb([{ match: /SELECT id FROM organizations WHERE slug=\?$/, reply: () => ({ id: 77 }) }]);
    const it = { url: "https://www.freelivecpe.com/event/example-webcast/" };
    await enrichFromAggregator(db, it);
    assert.equal(it.url, "https://events.example-firm.test/webcast/register?id=42&src=flc");
    assert.equal(it.aggregatorUrl, "https://www.freelivecpe.com/event/example-webcast/");
    assert.equal(it.organizationId, 77);
    const org = db.find(/INSERT INTO organizations/)[0];
    assert.deepEqual(org.args.slice(0, 5), ["example-firm-llp", "Example Firm LLP", "vendor", "https://www.example-firm.test/", "virtual"]);
  });

  test("uses an existing organization when the name matches", async () => {
    stub = stubGlobalFetch(() => ({ body: fixtureText("feeds/freelivecpe-event.html") }));
    const db = fakeDb([{ match: /lower\(short_name\)/, reply: () => ({ id: 5 }) }]);
    const it = { url: "https://freelivecpe.com/event/x/" };
    await enrichFromAggregator(db, it);
    assert.equal(it.organizationId, 5);
    assert.equal(db.find(/INSERT INTO organizations/).length, 0);
  });

  test("leaves other hosts alone without fetching", async () => {
    stub = stubGlobalFetch(() => { throw new Error("must not fetch"); });
    const it = { url: "https://www.meetup.com/x/events/1/" };
    await enrichFromAggregator(fakeDb(), it);
    assert.deepEqual(it, { url: "https://www.meetup.com/x/events/1/" });
    assert.equal(stub.calls.length, 0);
  });
});
