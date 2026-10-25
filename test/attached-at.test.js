// posted_by_attached_at (migration 0031): set wherever a person is put on a role, cleared when the name is cleared,
// counted by the coverage page and the Monday digest, and every path keeps working before the column exists.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, insertRow } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { untilMigrated, attachedNow, isMissingColumn } from "../functions/_lib/jobs.js";
import { onRequestPost as addPosted } from "../functions/admin/jobs/posted.js";
import { onRequestPost as editJob } from "../functions/admin/jobs/[id].js";
import { onRequestPost as addJob } from "../functions/admin/jobs/new.js";

CITIES.dallas = CITIES.dallas || { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "", empty: "", newsletter: "sunday", sort: 110 };

const form = (path, o) => new Request("https://bettersecurity.ai" + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// A database from before migration 0031: any statement naming the column fails the way D1 does.
const missing = { match: /posted_by_attached_at/, reply: () => { throw new Error("D1_ERROR: no such column: posted_by_attached_at"); } };
const org = { match: /FROM organizations WHERE slug/, reply: () => ({ id: 3, trusted: 1 }) };

describe("untilMigrated", () => {
  test("runs the statement that names the column, and only a missing column falls back", async () => {
    assert.equal(await untilMigrated(async () => "new", async () => "old"), "new");
    assert.equal(await untilMigrated(async () => { throw new Error("no such column: posted_by_attached_at"); }, async () => "old"), "old");
    await assert.rejects(untilMigrated(async () => { throw new Error("D1_ERROR: database is locked"); }, async () => "old"), /locked/);
    assert.equal(isMissingColumn(new Error("SQLITE_ERROR: no such column: x")), true);
    assert.match(attachedNow("Jane Doe"), ISO);
    assert.equal(attachedNow(""), null); assert.equal(attachedNow(null), null); assert.equal(attachedNow("   "), null);
  });
});

describe("Add a posted role", () => {
  const fields = { posted_by_url: "https://www.linkedin.com/posts/janedoe-9", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_date: "2026-10-22", employer: "Example Co", title: "Security Engineer", city: "dallas" };
  test("a new row carries the attached time", async () => {
    const db = fakeDb([org]);
    await addPosted({ request: form("/admin/jobs/posted", fields), env: { DB: db }, data: { user: "t" } });
    const [row] = db.find(/INSERT INTO jobs/).map(insertRow);
    assert.match(row.posted_by_attached_at, ISO);
    assert.equal(row.posted_by_name, "Jane Doe");
  });
  test("attaching to a listed role sets the attached time to now", async () => {
    const db = fakeDb([{ match: /SELECT id, status FROM jobs WHERE url=\?/, reply: () => ({ id: 77, status: "published" }) }]);
    await addPosted({ request: form("/admin/jobs/posted", { ...fields, url: "https://careers.example.com/jobs/9" }), env: { DB: db }, data: { user: "t" } });
    const up = db.find(/UPDATE jobs SET posted_by_name=\?/);
    assert.equal(up.length, 1);
    assert.match(up[0].sql, /posted_by_attached_at=strftime\('%Y-%m-%dT%H:%M:%fZ','now'\),/);
  });
  test("before the migration both paths fall back to statements without the column", async () => {
    const db = fakeDb([missing, org]);
    const res = await addPosted({ request: form("/admin/jobs/posted", fields), env: { DB: db }, data: { user: "t" } });
    assert.equal(res.status, 302);
    const inserts = db.find(/INSERT INTO jobs/);
    assert.equal(inserts.length, 2, "the attempt with the column, then the one without");
    assert.match(inserts[0].sql, /posted_by_attached_at/); assert.doesNotMatch(inserts[1].sql, /posted_by_attached_at/);
    const db2 = fakeDb([missing, { match: /SELECT id, status FROM jobs WHERE url=\?/, reply: () => ({ id: 77, status: "published" }) }]);
    await addPosted({ request: form("/admin/jobs/posted", { ...fields, url: "https://careers.example.com/jobs/9" }), env: { DB: db2 }, data: { user: "t" } });
    const ups = db2.find(/UPDATE jobs SET posted_by_name=\?/);
    assert.equal(ups.length, 2); assert.doesNotMatch(ups[1].sql, /posted_by_attached_at/);
  });
});

describe("the edit page and Add role", () => {
  const before = { id: 5, city: "dallas", title: "Security Engineer", employer_name: "Example Co", url: "https://careers.example.com/jobs/5", status: "published", topics: "[]", expires_at: "2099-01-01", posted_by_name: null, announced: 0 };
  const edit = (db, extra) => editJob({ params: { id: "5" }, request: form("/admin/jobs/5", { title: "Security Engineer", employer: "Example Co", url: "https://careers.example.com/jobs/5", city: "dallas", status: "published", ...extra }), env: { DB: db }, data: { user: "t" } });
  test("saving sets the time when a name arrives on a role that had none, keeps it otherwise, and clears it with the name", async () => {
    const db = fakeDb([org, { match: /FROM jobs j/, op: "first", reply: () => ({ ...before }) }]);
    await edit(db, { posted_by_name: "Jane Doe", posted_by_role: "leader", posted_by_url: "https://www.linkedin.com/posts/x-1" });
    const [up] = db.find(/UPDATE jobs SET city=\?/);
    assert.match(up.sql, /posted_by_attached_at=CASE WHEN \?='' THEN NULL WHEN posted_by_name IS NULL OR posted_by_name='' THEN strftime\('%Y-%m-%dT%H:%M:%fZ','now'\) ELSE posted_by_attached_at END,/);
    const idx = up.sql.slice(0, up.sql.indexOf("posted_by_attached_at=CASE")).split("?").length - 1; // bound parameters before the CASE
    assert.equal(up.args[idx], "Jane Doe", "the CASE sees the new name");
    const cleared = fakeDb([org, { match: /FROM jobs j/, op: "first", reply: () => ({ ...before, posted_by_name: "Jane Doe" }) }]);
    await edit(cleared, { posted_by_name: "" });
    const [up2] = cleared.find(/UPDATE jobs SET city=\?/);
    assert.equal(up2.args[idx], "", "an empty name clears the time");
  });
  test("before the migration the edit page saves without the column", async () => {
    const db = fakeDb([missing, org, { match: /FROM jobs j/, op: "first", reply: () => ({ ...before }) }]);
    const res = await edit(db, { posted_by_name: "Jane Doe" });
    assert.equal(res.status, 302);
    const ups = db.find(/UPDATE jobs SET city=\?/);
    assert.equal(ups.length, 2); assert.doesNotMatch(ups[1].sql, /posted_by_attached_at/);
  });
  test("Add role stores the time only when a person is named", async () => {
    const run = async (extra) => { const db = fakeDb([org]); await addJob({ request: form("/admin/jobs/new", { title: "GRC Analyst", employer: "Example Co", url: "https://careers.example.com/jobs/8", city: "dallas", status: "published", ...extra }), env: { DB: db }, data: { user: "t" } }); return db.find(/INSERT INTO jobs/).map(insertRow)[0]; };
    assert.match((await run({ posted_by_name: "Sam Lee" })).posted_by_attached_at, ISO);
    assert.equal((await run({})).posted_by_attached_at, null);
  });
});

