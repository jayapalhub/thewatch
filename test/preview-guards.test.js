// Preview deployments (ENVIRONMENT = "preview", staging database) must never send email, post to LinkedIn or run the
// background jobs that pages start on a visit. Each guard is checked with a fetch stub that fails the test if it is
// ever called, and the same path is run once more in production mode to show the guard is the only thing in the way.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isPreview } from "../functions/_lib/env.js";
import { sendEmail, notifyJerome } from "../functions/_lib/integrations.js";
import { sendPreview, lazyNewsletterTick } from "../functions/_lib/dispatch.js";
import { sendQueued } from "../functions/_lib/linkedin.js";
import { lazyAutoPublish } from "../functions/_lib/autopublish.js";
import { lazyJobs } from "../functions/_lib/jobs.js";
import { lazyReminders } from "../functions/_lib/reminders.js";
import { CITIES } from "../functions/_lib/constants.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { fakeDb, stubGlobalFetch } from "./helpers.js";

const PREVIEW = { ENVIRONMENT: "preview", RESEND_API_KEY: "placeholder-never-used", NOTIFY_EMAIL: "owner@example.test", SITE_URL: "https://preview.example.test", LINKEDIN_WEBHOOK_URL: "https://hooks.example.test/li" };
const PRODUCTION = { ...PREVIEW, ENVIRONMENT: "production" };
const neverFetch = () => stubGlobalFetch((url) => { throw new Error(`fetch must not be called in preview: ${url}`); });
// A database that fails the test the moment anything is prepared on it: the lazy jobs must not even read.
const untouchable = { prepare() { throw new Error("the database must not be touched in preview"); }, batch() { throw new Error("the database must not be touched in preview"); } };
// waitUntil collects the promises a page hands off so the test can wait for them.
const collector = () => { const ps = []; const f = (p) => ps.push(p); f.settle = () => Promise.allSettled(ps); return f; };

let stub;
afterEach(() => { if (stub) stub.restore(); stub = null; });

test("isPreview reads ENVIRONMENT and nothing else", () => {
  assert.equal(isPreview({ ENVIRONMENT: "preview" }), true);
  assert.equal(isPreview({ ENVIRONMENT: "Preview" }), true);
  assert.equal(isPreview({ ENVIRONMENT: "production" }), false);
  assert.equal(isPreview({ DEV_MODE: "1" }), false);
  assert.equal(isPreview({}), false);
  assert.equal(isPreview(null), false);
});

describe("email", () => {
  test("sendEmail and notifyJerome log and return without calling Resend in preview", async () => {
    stub = neverFetch();
    const r = await sendEmail(PREVIEW, { to: "someone@example.test", subject: "Welcome", html: "<p>hi</p>" });
    assert.deepEqual(r, { ok: true, skipped: "preview" });
    assert.deepEqual(await notifyJerome(PREVIEW, "Alert", "<p>x</p>"), { ok: true, skipped: "preview" });
    assert.equal(stub.calls.length, 0);
  });

  test("the same call reaches Resend in production", async () => {
    stub = stubGlobalFetch(() => ({ status: 200, body: { id: "em_1" } }));
    const r = await sendEmail(PRODUCTION, { to: "someone@example.test", subject: "Welcome", html: "<p>hi</p>" });
    assert.deepEqual(r, { ok: true });
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, "https://api.resend.com/emails");
  });

  test("the Saturday newsletter preview is built but not sent in preview", async () => {
    stub = neverFetch();
    const db = fakeDb([
      { match: /SELECT COUNT\(\*\) n FROM subscribers WHERE status='active' AND city=\?$/, reply: () => ({ n: 12 }) },
      { match: /profile_completed_at IS NULL/, reply: () => ({ n: 3 }) },
      { match: /UPDATE issues SET preview_sent_at=datetime\('now'\) WHERE id=\? AND preview_sent_at IS NULL/, reply: () => ({ meta: { changes: 1 } }) },
    ]);
    const issue = { id: 5, city: "sandiego", week_start: "2026-11-02", week_end: "2026-11-08", issue_number: 9, status: "draft" };
    const r = await sendPreview({ ...PREVIEW, DB: db }, issue, CITIES.sandiego);
    assert.equal(r.to, "owner@example.test");
    assert.equal(r.subscribers, 12);
    assert.equal(stub.calls.length, 0);
    assert.ok(db.find(/UPDATE issues SET subject=COALESCE/).length, "the issue is still marked as previewed on staging");
  });
});

describe("LinkedIn", () => {
  const row = { id: 3, city: "sandiego", kind: "events", week_start: "2026-11-02", text: "This week in San Diego", link: "https://preview.example.test/sandiego" };
  const claimDb = () => fakeDb([{ match: /SET status='sending'/, op: "run", reply: () => ({ meta: { changes: 1 } }) }]);
  const auth = { org_id: "1", access_token: "placeholder", token_expires_at: "2099-01-01" };

  test("a queued post is marked skipped and nothing is posted in preview", async () => {
    stub = neverFetch();
    const db = claimDb();
    const r = await sendQueued(db, PREVIEW, row, auth);
    assert.deepEqual(r, { ok: true, skipped: "preview" });
    assert.equal(stub.calls.length, 0);
    const mark = db.find(/SET status='skipped', error='preview environment: not posted'/);
    assert.equal(mark.length, 1);
    assert.deepEqual(mark[0].args, [3]);
    assert.equal(db.find(/status='posted'/).length, 0);
  });

  test("the same post goes to the webhook in production when no token is connected", async () => {
    stub = stubGlobalFetch(() => ({ status: 200, body: "ok" }));
    const db = claimDb();
    const r = await sendQueued(db, PRODUCTION, row, null);
    assert.equal(r.posted, true);
    assert.equal(stub.calls[0].url, "https://hooks.example.test/li");
    assert.equal(db.find(/status='posted'/).length, 1);
  });
});

describe("lazy background jobs", () => {
  test("none of them touch the database in preview", async () => {
    const wait = collector();
    lazyAutoPublish(untouchable, wait, PREVIEW);
    lazyJobs(untouchable, wait, PREVIEW);
    lazyReminders({ ...PREVIEW, DB: untouchable }, wait);
    lazyNewsletterTick({ ...PREVIEW, DB: untouchable }, wait);
    assert.equal((await wait.settle()).length, 0, "nothing was handed to waitUntil");
  });

  test("autopublish, jobs and reminders do run in production", async () => {
    stub = stubGlobalFetch(() => ({ status: 200, body: "" }));
    const db = fakeDb(); const wait = collector();
    lazyAutoPublish(db, wait, PRODUCTION);
    lazyJobs(db, wait, PRODUCTION);
    lazyReminders({ ...PRODUCTION, DB: db }, wait);
    await wait.settle();
    assert.ok(db.find(/FROM events WHERE status='pending_review'/).length, "autopublish read the queue");
    assert.ok(db.find(/FROM jobs/).length, "job maintenance ran");
    assert.ok(db.find(/FROM reminders/).length, "reminders ran");
  });

  test("a city page visit on a preview reads but never writes", async () => {
    stub = neverFetch();
    const db = fakeDb(); const wait = collector();
    const res = await cityPage({ request: new Request("https://preview.example.test/sandiego"), env: { ...PREVIEW, DB: db }, params: { city: "sandiego" }, waitUntil: wait });
    await wait.settle();
    assert.equal(res.status, 200);
    assert.ok(db.calls.length > 0, "the page read the calendar");
    const writes = db.calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql));
    assert.deepEqual(writes.map((c) => c.sql.slice(0, 60)), []);
    assert.equal(stub.calls.length, 0);
  });
});
