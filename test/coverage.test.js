// Named role coverage: the status thresholds, the once a day snapshot guard, the Needs a person queue filter, the admin
// page and the JSON endpoint, all against the fake database.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { coverageStatus, coverageRows, coverageTotal, snapshotCoverage, coverageHistory, needsPerson, sparkline, READY_AT, GROWING_AT } from "../functions/_lib/coverage.js";
import { onRequestGet as coveragePage } from "../functions/admin/jobs/coverage.js";
import { onRequestGet as needsPersonApi } from "../functions/api/jobs/needs-person.js";

CITIES.dallas = CITIES.dallas || { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "", empty: "", newsletter: "sunday", sort: 110 };

describe("status thresholds", () => {
  test("15 or more named is ready to consider, 5 to 14 growing, below 5 early", () => {
    assert.equal(READY_AT, 15); assert.equal(GROWING_AT, 5);
    assert.equal(coverageStatus(0), "Early"); assert.equal(coverageStatus(4), "Early");
    assert.equal(coverageStatus(5), "Growing"); assert.equal(coverageStatus(14), "Growing");
    assert.equal(coverageStatus(15), "Ready to consider"); assert.equal(coverageStatus(40), "Ready to consider");
  });
  test("rows carry percent and status, sort by named count, and every board appears even at zero", async () => {
    const db = fakeDb([{ match: /GROUP BY j\.city/, op: "all", reply: () => ({ results: [{ city: "sandiego", total: 40, named: 6, recent: 2 }, { city: "dallas", total: 30, named: 16, recent: 5 }] }) }]);
    const rows = await coverageRows(db);
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.city, r.named, r.percent, r.status, r.recent]), [["dallas", 16, 53, "Ready to consider", 5], ["sandiego", 6, 15, "Growing", 2]]);
    assert.ok(rows.some((r) => r.city === "remote" && r.total === 0 && r.status === "Early"));
    assert.ok(rows.some((r) => r.city === "sanjose" && r.total === 0));
    const total = coverageTotal(rows);
    assert.equal(total.total, 70); assert.equal(total.named, 22); assert.equal(total.percent, 31); assert.equal(total.recent, 7);
    assert.equal(db.calls.filter((c) => /FROM jobs/.test(c.sql)).length, 1, "one grouped query, not one per city");
  });
});

describe("daily snapshot", () => {
  const counts = { match: /GROUP BY j\.city/, op: "all", reply: () => ({ results: [{ city: "dallas", total: 30, named: 16, recent: 5 }] }) };
  test("writes one row per board the first time today", async () => {
    const db = fakeDb([counts, { match: /FROM job_coverage_daily WHERE day=\?/, reply: () => null }]);
    const r = await snapshotCoverage(db, { today: "2026-10-25" });
    assert.ok(r.written >= 2 && !r.skipped);
    const writes = db.find(/INSERT OR IGNORE INTO job_coverage_daily/);
    assert.equal(writes.length, r.written);
    const dallas = writes.find((w) => w.args[1] === "dallas");
    assert.deepEqual(dallas.args, ["2026-10-25", "dallas", 30, 16]);
    assert.ok(writes.find((w) => w.args[1] === "remote" && w.args[2] === 0));
  });
  test("skips when today is already recorded, without reading the jobs table", async () => {
    const db = fakeDb([counts, { match: /FROM job_coverage_daily WHERE day=\?/, reply: () => ({ x: 1 }) }]);
    const r = await snapshotCoverage(db, { today: "2026-10-25" });
    assert.deepEqual(r, { skipped: true, day: "2026-10-25" });
    assert.equal(db.find(/INSERT OR IGNORE INTO job_coverage_daily/).length, 0);
    assert.equal(db.find(/FROM jobs/).length, 0);
  });
  test("history groups the last 28 days per board, oldest first, and draws a plain inline bar", async () => {
    const db = fakeDb([{ match: /FROM job_coverage_daily WHERE day >= \?/, op: "all", reply: (args) => { assert.equal(args[0], "2026-09-28"); return { results: [{ day: "2026-10-24", city: "dallas", total: 30, named: 15 }, { day: "2026-10-25", city: "dallas", total: 31, named: 16 }, { day: "2026-10-25", city: "sandiego", total: 40, named: 6 }] }; } }]);
    const h = await coverageHistory(db, { today: "2026-10-25" });
    assert.deepEqual(h.dallas.map((p) => p.named), [15, 16]);
    assert.equal(h.sandiego.length, 1);
    const bar = String(sparkline(h.dallas));
    assert.match(bar, /<span class="a-spark" aria-label="2026-10-24: 15, 2026-10-25: 16">/);
    assert.match(bar, /<i style="height:18px" title="2026-10-25: 16 named of 31"><\/i>/);
    assert.match(bar, /15 16<\/span>/);
    assert.doesNotMatch(bar, /<script|cdn/);
    assert.match(String(sparkline([])), /no snapshots yet/);
  });
});

describe("Needs a person queue", () => {
  const role = (id, employer, extra = {}) => ({ id, city: "dallas", title: `Role ${id}`, organization_id: null, employer_name: employer, org_name: null, url: `https://careers.example.test/${id}`, published_at: `2026-10-${String(25 - (id % 20)).padStart(2, "0")}T08:00:00.000Z`, created_at: "2026-10-01T00:00:00.000Z", ...extra });
  const db = (sizes, roles) => fakeDb([
    { match: /GROUP BY j\.organization_id, lower\(j\.employer_name\)/, op: "all", reply: () => ({ results: sizes }) },
    { match: /AND NOT \(j\.posted_by_name IS NOT NULL/, op: "all", reply: () => ({ results: roles }) },
  ]);
  test("keeps roles from employers with fewer than ten live roles, newest first, with the days live and the role page", async () => {
    const big = Array.from({ length: 12 }, (_, i) => role(100 + i, "Big Corp"));
    const out = await needsPerson(db([{ organization_id: null, employer_name: "Big Corp", n: 12 }, { organization_id: 7, employer_name: "Small Co", n: 2 }, { organization_id: null, employer_name: "Tiny LLC", n: 1 }],
      [role(1, "Small Co", { organization_id: 7, org_name: "Small Co" }), ...big, role(2, "Tiny LLC")]), { today: "2026-10-25" });
    assert.deepEqual(out.map((j) => j.id), [1, 2]);
    assert.equal(out[0].employer, "Small Co"); assert.equal(out[0].live_days, 1); assert.equal(out[0].page, "/dallas/jobs/1-role-1-at-small-co"); assert.equal(out[0].employer_live_roles, 2);
    assert.equal(out[1].live_days, 2); assert.equal(out[1].city_name, "Dallas"); assert.equal(out[1].posting_url, "https://careers.example.test/2");
  });
  test("an employer with exactly ten live roles is left out, and the list stops at fifty", async () => {
    const roles = Array.from({ length: 80 }, (_, i) => role(i + 1, i % 2 ? "Ten Inc" : `Solo ${i}`));
    const sizes = [{ organization_id: null, employer_name: "Ten Inc", n: 10 }, ...roles.filter((r) => r.employer_name.startsWith("Solo")).map((r) => ({ organization_id: null, employer_name: r.employer_name, n: 1 }))];
    const out = await needsPerson(db(sizes, roles), { today: "2026-10-25" });
    assert.equal(out.length, 40, "forty solo employers, none from Ten Inc");
    assert.ok(out.every((j) => j.employer.startsWith("Solo")));
    const many = Array.from({ length: 120 }, (_, i) => role(i + 1, `Solo ${i}`));
    const capped = await needsPerson(db(many.map((r) => ({ organization_id: null, employer_name: r.employer_name, n: 1 })), many), { today: "2026-10-25" });
    assert.equal(capped.length, 50);
  });
  test("the queue is two queries, whatever the number of cities or employers", async () => {
    const d = db([], []);
    await needsPerson(d);
    assert.equal(d.calls.filter((c) => /FROM jobs/.test(c.sql)).length, 2);
    assert.match(d.calls[1].sql, /LIMIT \?/);
  });
});

describe("the page and the endpoint", () => {
  const handlers = [
    { match: /GROUP BY j\.city/, op: "all", reply: () => ({ results: [{ city: "dallas", total: 30, named: 16, recent: 5 }, { city: "sandiego", total: 12, named: 2, recent: 0 }] }) },
    { match: /FROM job_coverage_daily WHERE day >= \?/, op: "all", reply: () => ({ results: [{ day: "2026-10-25", city: "dallas", total: 30, named: 16 }] }) },
    { match: /GROUP BY j\.organization_id, lower\(j\.employer_name\)/, op: "all", reply: () => ({ results: [{ organization_id: null, employer_name: "Small Co", n: 1 }] }) },
    { match: /AND NOT \(j\.posted_by_name IS NOT NULL/, op: "all", reply: () => ({ results: [{ id: 9, city: "dallas", title: "GRC Analyst", organization_id: null, employer_name: "Small Co", org_name: null, url: "https://careers.example.test/9", published_at: "2026-10-20T08:00:00.000Z", created_at: "2026-10-20T00:00:00.000Z" }] }) },
  ];
  test("the admin page shows every board with its status, a total row, the trend and the queue, in four queries", async () => {
    const db = fakeDb(handlers);
    const res = await coveragePage({ env: { DB: db }, data: { user: "t" } });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<td><strong>Dallas<\/strong><\/td><td>30<\/td><td><strong>16<\/strong><\/td><td>53%<\/td><td>5<\/td><td><span class="a-pill a-pill-good">Ready to consider<\/span><\/td>/);
    assert.match(body, /<td><strong>San Diego<\/strong><\/td><td>12<\/td><td><strong>2<\/strong><\/td><td>17%<\/td><td>0<\/td><td><span class="a-pill ">Early<\/span><\/td>/);
    assert.match(body, /<td><strong>Remote board<\/strong><\/td><td>0<\/td>/);
    assert.match(body, /<tr class="a-total"><td><strong>All boards<\/strong><\/td><td><strong>42<\/strong><\/td><td><strong>18<\/strong><\/td><td>43%<\/td>/);
    assert.ok(body.indexOf("<strong>Dallas</strong>") < body.indexOf("<strong>San Diego</strong>"), "highest named first");
    assert.match(body, /class="a-spark"/);
    assert.match(body, /<h2>Needs a person<\/h2>/);
    assert.match(body, /GRC Analyst[\s\S]*<a href="\/dallas\/jobs\/9-grc-analyst-at-small-co" target="_blank" rel="noopener">Role page<\/a>/);
    assert.match(body, /<a href="\/admin\/jobs\/coverage">Coverage<\/a>|Back to jobs/);
    assert.equal(db.calls.filter((c) => /FROM jobs|FROM job_coverage_daily/.test(c.sql)).length, 4);
  });
  test("the JSON endpoint needs the admin token and returns the same queue", async () => {
    const env = { DB: fakeDb(handlers), ADMIN_TOKEN: "placeholder-token" };
    const denied = await needsPersonApi({ request: new Request("https://bettersecurity.ai/api/jobs/needs-person"), env });
    assert.equal(denied.status, 401);
    const res = await needsPersonApi({ request: new Request("https://bettersecurity.ai/api/jobs/needs-person", { headers: { authorization: "Bearer placeholder-token" } }), env });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const j = await res.json();
    assert.equal(j.count, 1);
    assert.deepEqual(Object.keys(j.roles[0]).sort(), ["city", "city_name", "employer", "employer_live_roles", "id", "live_days", "live_since", "page", "posting_url", "title"]);
    assert.equal(j.roles[0].page, "/dallas/jobs/9-grc-analyst-at-small-co");
  });
});
