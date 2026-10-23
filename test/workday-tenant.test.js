// Workday cxsTenant override: the host keeps the tenant from the board URL, and only the /wday/cxs/<tenant>/ path uses
// cxsTenant. Covers the list, the detail fetch, the URL fallback and the still open check in runJobSource.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pullWorkday, runJobSource } from "../functions/_lib/job-sources.js";
import { fakeDb, recordingFetcher } from "./helpers.js";

const cfg = { tenant: "osv-amerisure", host: "wd5", site: "Amerisure_Careers", cxsTenant: "osv_amerisure" };
const host = "https://osv-amerisure.wd5.myworkdayjobs.com";
const cxs = `${host}/wday/cxs/osv_amerisure/Amerisure_Careers`;

test("pullWorkday reads the list and details through the cxsTenant path on the board's own host", async () => {
  const f = recordingFetcher((url, init, body) => {
    if (body) return { total: 1, jobPostings: [{ title: "Information Security Analyst", externalPath: "/job/Farmington-Hills-MI/Information-Security-Analyst_R900", locationsText: "Farmington Hills, MI" }] };
    return { jobPostingInfo: { jobReqId: "R900", title: "Information Security Analyst", location: "Farmington Hills, MI" } };
  });
  const out = await pullWorkday(cfg, "security", f, ["Farmington Hills"]);
  assert.deepEqual(f.calls.map((c) => c.url), [`${cxs}/jobs`, `${cxs}/job/Farmington-Hills-MI/Information-Security-Analyst_R900`]);
  assert.equal(out.length, 1);
  // With no externalUrl the posting link is built on the public site, which keeps the host tenant and the site.
  assert.equal(out[0].url, `${host}/Amerisure_Careers/job/Farmington-Hills-MI/Information-Security-Analyst_R900`);
});

test("without cxsTenant the path repeats the host tenant, as before", async () => {
  const f = recordingFetcher(() => ({ total: 0, jobPostings: [] }));
  await pullWorkday({ tenant: "examplecorp", host: "wd1", site: "External" }, "security", f);
  assert.equal(f.calls[0].url, "https://examplecorp.wd1.myworkdayjobs.com/wday/cxs/examplecorp/External/jobs");
});

test("the still open check in runJobSource uses the cxsTenant path too", async () => {
  const src = { id: 606, kind: "workday", employer_name: "Example Insurer", organization_id: 3, config: JSON.stringify(cfg), search_text: "security", location_terms: "Farmington Hills", city: "detroit" };
  const db = fakeDb([{ match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: [
    { id: 1, source_key: "R901", title: "Security Engineer", url: `${host}/en-US/Amerisure_Careers/job/Farmington-Hills-MI/Security-Engineer_R901` },
  ] }) }]);
  const f = recordingFetcher((url, init, body) => (body ? { total: 0, jobPostings: [] } : { jobPostingInfo: {} }));
  const run = await runJobSource(db, src, { fetcher: f, now: new Date("2026-10-23T00:00:00Z") });
  assert.equal(run.closed, 0);
  assert.equal(f.calls[1].url, `${cxs}/job/Farmington-Hills-MI/Security-Engineer_R901`);
});
