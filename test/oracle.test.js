// Oracle Recruiting Cloud (Oracle HCM Candidate Experience): the public recruitingCEJobRequisitions finder. The fixture
// is handcrafted in that API's shape, 25 requisitions on the first page and two on the second.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pullOracle, ADAPTERS, SOURCE_KINDS } from "../functions/_lib/job-sources.js";
import { onRequestPost as jobtest } from "../functions/admin/jobtest.js";
import { fakeDb, fixtureJson, recordingFetcher, stubGlobalFetch } from "./helpers.js";

const cfg = { host: "exmp.fa.us2.oraclecloud.com", site: "CX_7" };
const offsetOf = (url) => Number(/[;,]offset=(\d+)/.exec(url)[1]);
const byOffset = () => { const fx = fixtureJson("jobs/oracle.json"); return recordingFetcher((url) => fx.pages[offsetOf(url) / 25]); };

describe("pullOracle", () => {
  test("is registered as the oracle kind", () => {
    assert.equal(ADAPTERS.oracle, pullOracle);
    assert.equal(SOURCE_KINDS.oracle, "Oracle Recruiting Cloud");
  });

  test("calls the requisitions finder with the site, keyword, page size and offset", async () => {
    const f = byOffset();
    await pullOracle(cfg, "cyber security", f);
    assert.equal(f.calls[0].url, "https://exmp.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=CX_7,keyword=cyber%20security,limit=25,offset=0,sortBy=POSTING_DATES_DESC");
    assert.deepEqual(f.calls.map((c) => offsetOf(c.url)), [0, 25]); // 27 in total: two pages
  });

  test("filters titles, dedupes across pages and reads the common role shape", async () => {
    const out = await pullOracle(cfg, "security", byOffset());
    assert.deepEqual(out, [
      { key: "300001", title: "Senior Information Security Engineer", url: "https://exmp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_7/job/300001", location: "San Diego, CA, United States; Rancho Cordova, CA, United States", posted_at: "2026-10-15", salary_text: "$150,000 - $185,000", remote: "onsite" },
      { key: "300003", title: "Cyber Threat Intelligence Analyst", url: "https://exmp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_7/job/300003", location: "United States", posted_at: "2026-10-01", salary_text: null, remote: "remote" },
      { key: "300004", title: "IT Audit Manager", url: "https://exmp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_7/job/300004", location: "San Diego, CA, United States", posted_at: null, salary_text: null, remote: "hybrid" },
      { key: "300005", title: "Privacy Analyst", url: "https://exmp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_7/job/300005", location: "Sacramento, CA, United States", posted_at: "2026-10-15", salary_text: null, remote: "onsite" },
    ]);
  });

  test("defaults the site to CX_1 and accepts a host given as a URL", async () => {
    const f = recordingFetcher(() => ({ items: [{ TotalJobsCount: 0, requisitionList: [] }] }));
    assert.deepEqual(await pullOracle({ host: "https://exmp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1" }, "", f), []);
    assert.match(f.calls[0].url, /^https:\/\/exmp\.fa\.us2\.oraclecloud\.com\/hcmRestApi\/.*siteNumber=CX_1,keyword=security,/);
    assert.equal(f.calls.length, 1);
  });

  test("stops on a short page even when the total says more, and never reads past 200 rows", async () => {
    const short = recordingFetcher(() => ({ items: [{ TotalJobsCount: 500, requisitionList: [{ Id: "1", Title: "Security Engineer" }] }] }));
    await pullOracle(cfg, "security", short);
    assert.equal(short.calls.length, 1);
    const full = recordingFetcher((url) => ({ items: [{ TotalJobsCount: 5000, requisitionList: Array.from({ length: 25 }, (_, i) => ({ Id: String(offsetOf(url) + i), Title: "Security Engineer" })) }] }));
    const out = await pullOracle(cfg, "security", full);
    assert.equal(full.calls.length, 8);
    assert.equal(out.length, 200);
  });

  test("an empty items list is no postings; a response without items is an error", async () => {
    assert.deepEqual(await pullOracle(cfg, "security", recordingFetcher(() => ({ items: [] }))), []);
    await assert.rejects(pullOracle(cfg, "security", recordingFetcher(() => ({ title: "Not Found" }))), /unexpected response from Oracle Recruiting Cloud/);
  });
});

describe("board diagnostic on an Oracle board", () => {
  let stub;
  afterEach(() => stub && stub.restore());

  test("counts the postings nested in items[0].requisitionList and reads TotalJobsCount", async () => {
    const fx = fixtureJson("jobs/oracle.json");
    stub = stubGlobalFetch((url) => ({ body: fx.pages[offsetOf(url) / 25] }));
    const db = fakeDb([{ match: /FROM job_sources WHERE id IN/, reply: () => ({ results: [{ id: 828, employer_name: "Example Dental", kind: "oracle", city: "sacramento", config: JSON.stringify(cfg), location_terms: "Sacramento, Rancho Cordova", search_text: "security" }] }) }]);
    const res = await jobtest({ request: new Request("https://example.test/admin/jobtest", { method: "POST", body: JSON.stringify({ ids: [828] }) }), env: { DB: db } });
    const [r] = (await res.json()).results;
    assert.equal(r.raw, 27);
    assert.equal(r.total, 27);
    assert.equal(r.calls, 2);
    assert.equal(r.matched, 4);
    assert.equal(r.in_city, 2); // Rancho Cordova on the first role, Sacramento on the privacy role
  });
});
