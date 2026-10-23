// tools/staging/seed.sql must load cleanly on top of every migration, twice, and hold only fictional data: no
// subscribers, no reminders and no real person's email address. Runs on Node's built in SQLite, so no dependency.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url);
const seed = readFileSync(new URL("tools/staging/seed.sql", root), "utf8");
let db;

before(() => {
  db = new DatabaseSync(":memory:");
  for (const f of readdirSync(new URL("migrations/", root)).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(`migrations/${f}`, root), "utf8"));
  db.exec(seed);
});
const one = (sql) => db.prepare(sql).get();
const all = (sql) => db.prepare(sql).all();

describe("staging seed", () => {
  test("loads twice without adding rows", () => {
    const before = { events: one("SELECT COUNT(*) n FROM events").n, orgs: one("SELECT COUNT(*) n FROM organizations").n, jobs: one("SELECT COUNT(*) n FROM jobs").n, sources: one("SELECT COUNT(*) n FROM job_sources").n };
    db.exec(seed);
    assert.deepEqual({ events: one("SELECT COUNT(*) n FROM events").n, orgs: one("SELECT COUNT(*) n FROM organizations").n, jobs: one("SELECT COUNT(*) n FROM jobs").n, sources: one("SELECT COUNT(*) n FROM job_sources").n }, before);
  });

  test("two active cities, San Diego from the migration and Dallas from the seed", () => {
    assert.deepEqual(all("SELECT slug FROM cities WHERE active=1 ORDER BY sort").map((r) => r.slug), ["sandiego", "dallas"]);
    assert.equal(one("SELECT timezone FROM cities WHERE slug='dallas'").timezone, "America/Chicago");
  });

  test("about 15 upcoming published events across San Diego, Dallas and Virtual, in every format and price", () => {
    const up = all("SELECT city, format, cost_type, cost_min, members_only, also_virtual FROM events WHERE status='published' AND start_utc > strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    assert.equal(up.length, 15);
    const count = (f) => up.filter(f).length;
    assert.deepEqual(new Set(up.map((e) => e.city)), new Set(["sandiego", "dallas", "virtual"]));
    assert.ok(count((e) => e.city === "sandiego") >= 4 && count((e) => e.city === "dallas") >= 4 && count((e) => e.city === "virtual") >= 3);
    assert.ok(count((e) => e.format === "in_person") >= 6);
    assert.ok(count((e) => e.format === "virtual") >= 3);
    assert.ok(count((e) => e.format === "hybrid") >= 2);
    assert.ok(count((e) => e.cost_type === "free") >= 8);
    assert.ok(count((e) => e.cost_type === "paid" && e.cost_min > 0) >= 3);
    assert.equal(count((e) => e.members_only === 1), 1);
    assert.equal(one("SELECT COUNT(*) n FROM events WHERE status='published' AND start_utc <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").n, 1, "one past event for the archive");
    assert.equal(one("SELECT COUNT(*) n FROM events WHERE status='pending_review' AND hold=1").n, 1, "one held submission in the queue");
  });

  test("every event has an organizer, a registration link on a .test host, UTC times and a wall clock in its city's zone", () => {
    for (const e of all("SELECT e.*, o.slug org FROM events e LEFT JOIN organizations o ON o.id=e.organization_id")) {
      assert.ok(e.org && e.org.startsWith("staging-"), `${e.slug} organizer`);
      assert.match(e.registration_url, /^https:\/\/[a-z0-9.-]+\.test\//, `${e.slug} link`);
      assert.match(e.start_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, `${e.slug} start_at`);
      assert.match(e.start_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${e.slug} start_utc`);
      assert.ok(e.end_utc > e.start_utc, `${e.slug} ends after it starts`);
      assert.equal(e.timezone, e.city === "dallas" ? "America/Chicago" : "America/Los_Angeles", `${e.slug} zone`);
      assert.doesNotThrow(() => JSON.parse(e.topics), `${e.slug} topics`);
      if (e.members_only) assert.ok(e.cost_notes, "a members only event says who can attend");
    }
  });

  test("ten published roles, each linked to an employer organization and a .test posting", () => {
    const jobs = all("SELECT j.*, o.type org_type FROM jobs j LEFT JOIN organizations o ON o.id=j.organization_id");
    assert.equal(jobs.length, 10);
    for (const j of jobs) {
      assert.equal(j.status, "published");
      assert.equal(j.org_type, "employer", `${j.title} employer org`);
      assert.match(j.url, /^https:\/\/careers\.[a-z-]+\.test\//, `${j.title} link`);
      assert.ok(["onsite", "hybrid", "remote"].includes(j.remote));
      assert.ok(j.expires_at > j.posted_at);
      assert.ok(j.excerpt && j.excerpt.length > 40);
    }
    assert.deepEqual(new Set(jobs.map((j) => j.city)), new Set(["sandiego", "dallas"]));
    assert.equal(all("SELECT id FROM jobs WHERE source='sweep' AND source_id IS NULL").length, 0, "swept roles point at their board");
    // Migration 0016 seeds ten real San Diego boards; the seed adds three fictional ones on top.
    assert.equal(one("SELECT COUNT(*) n FROM job_sources WHERE notes LIKE 'Sample board for staging%'").n, 3);
    assert.equal(one("SELECT COUNT(*) n FROM job_sources WHERE city='dallas'").n, 2);
  });

  test("no subscribers, reminders or real email addresses anywhere", () => {
    for (const t of ["subscribers", "reminders", "event_interest", "sponsor_inquiries", "linkedin_posts", "email_events"]) assert.equal(one(`SELECT COUNT(*) n FROM ${t}`).n, 0, t);
    assert.equal(one("SELECT COUNT(*) n FROM organizations WHERE contact_email IS NOT NULL").n, 0);
    assert.equal(one("SELECT COUNT(*) n FROM events WHERE submitted_by_email IS NOT NULL OR submitted_by_name IS NOT NULL").n, 0);
    assert.equal(one("SELECT COUNT(*) n FROM jobs WHERE submitted_by_email IS NOT NULL").n, 0);
    assert.ok(!/@/.test(seed), "the seed file contains no email address");
    for (const m of seed.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.ok(m[1].endsWith(".test"), `link host ${m[1]} is not a .test host`);
  });
});
