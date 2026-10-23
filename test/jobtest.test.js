// The board diagnostic at /admin/jobtest: raw and total must mean the same thing for every board kind. Oracle
// Recruiting nests its postings in items[0].requisitionList and reports the count of search blocks, not postings, at the
// top level, so it is checked against main's Oracle fixture alongside a flat JSON board.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as jobtest } from "../functions/admin/jobtest.js";
import { fakeDb, fixtureJson, stubGlobalFetch } from "./helpers.js";

let stub;
afterEach(() => stub && stub.restore());

async function diagnose(row, route) {
  stub = stubGlobalFetch(route);
  const db = fakeDb([{ match: /FROM job_sources WHERE id IN/, reply: () => ({ results: [row] }) }]);
  const res = await jobtest({ request: new Request("https://example.test/admin/jobtest", { method: "POST", body: JSON.stringify({ ids: [row.id] }) }), env: { DB: db } });
  return (await res.json()).results[0];
}

describe("board diagnostic", () => {
  test("Oracle Recruiting: raw counts the nested requisition list and total reads TotalJobsCount, not the outer count", async () => {
    const r = await diagnose(
      { id: 901, employer_name: "Example Bank", kind: "oracle", city: "newyork", config: '{"host":"careers.example.test","site":"careers"}', location_terms: "New York, Jersey City", search_text: "security" },
      () => ({ body: fixtureJson("jobs/oracle.json") }),
    );
    assert.equal(r.calls, 1);
    assert.equal(r.raw, 4); // four rows on the page, one of them a repeat
    assert.equal(r.total, 3); // TotalJobsCount, where the outer count is 1
    assert.equal(r.matched, 2);
    assert.equal(r.in_city, 1);
    assert.equal(r.error, undefined);
  });

  test("a flat JSON board still counts its largest list and its own total", async () => {
    const r = await diagnose(
      { id: 902, employer_name: "Example Corp", kind: "greenhouse", city: "sandiego", config: '{"board":"examplecorp"}', location_terms: "San Diego", search_text: "security" },
      () => ({ body: fixtureJson("jobs/greenhouse.json") }),
    );
    assert.equal(r.raw, 5);
    assert.equal(r.total, null);
    assert.equal(r.matched, 3);
    assert.equal(r.in_city, 1);
  });
});
