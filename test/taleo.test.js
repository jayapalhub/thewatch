// Oracle Taleo career sections: the JSON search a section's own page posts to. Responses are handcrafted in the shape
// Hyatt's US section (hyatt.taleo.net/careersection/10780) returned on 2026-10-23.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pullTaleo, ADAPTERS, SOURCE_KINDS } from "../functions/_lib/job-sources.js";
import { parseConfig } from "../functions/admin/jobs/sources/index.js";
import { recordingFetcher } from "./helpers.js";

const req = (contestNo, title, places, date = "Oct 20, 2026") => ({ jobId: contestNo.length, contestNo, column: [title, "Hyatt Corporate Office", "Technology", JSON.stringify(places), date] });
const page1 = { pagingData: { currentPageNo: 1, pageSize: 25, totalCount: 5 }, requisitionList: [
  req("CHI015724", "Lead Analyst - Cyber Security Operations (Remote)", ["US-IL-Chicago"]),
  req("SAL001680", "Security Officer | Full Time", ["US-UT-Salt Lake City"]),
  req("CHI015700", "IT Auditor", ["US-IL-Chicago", "US-NY-New York"], "Sep 3, 2026"),
] };
const page2 = { pagingData: { currentPageNo: 2, pageSize: 25, totalCount: 5 }, requisitionList: [
  req("CHI015724", "Lead Analyst - Cyber Security Operations (Remote)", ["US-IL-Chicago"]),
  req("LON000001", "Information Security Manager", ["GB-ENG-London"]),
] };
const cfg = { host: "hyatt.taleo.net", section: "10780", portal: "21860210089" };

describe("pullTaleo", () => {
  test("is registered as the taleo kind", () => {
    assert.equal(ADAPTERS.taleo, pullTaleo);
    assert.equal(SOURCE_KINDS.taleo, "Taleo");
  });

  test("posts the section's own search, page by page, until it has read totalCount", async () => {
    const f = recordingFetcher((url, init) => (JSON.parse(init.body).pageNo === 1 ? page1 : page2));
    await pullTaleo(cfg, "information security", f);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].url, "https://hyatt.taleo.net/careersection/rest/jobboard/searchjobs?lang=en&portal=21860210089");
    assert.equal(f.calls[0].init.method, "POST");
    const body = JSON.parse(f.calls[1].init.body);
    assert.equal(body.fieldData.fields.KEYWORD, "information security");
    assert.equal(body.pageNo, 2);
  });

  test("keeps our roles once each, with readable places, posted dates, remote from the title, and the section's job link", async () => {
    const f = recordingFetcher((url, init) => (JSON.parse(init.body).pageNo === 1 ? page1 : page2));
    const out = await pullTaleo(cfg, "security", f);
    assert.deepEqual(out.map((r) => [r.key, r.title, r.location, r.posted_at, r.remote, r.url]), [
      ["CHI015724", "Lead Analyst - Cyber Security Operations (Remote)", "Chicago, IL", "2026-10-20", "remote", "https://hyatt.taleo.net/careersection/10780/jobdetail.ftl?job=CHI015724&lang=en"],
      ["CHI015700", "IT Auditor", "Chicago, IL; New York, NY", "2026-09-03", "onsite", "https://hyatt.taleo.net/careersection/10780/jobdetail.ftl?job=CHI015700&lang=en"],
      ["LON000001", "Information Security Manager", "London, ENG, GB", "2026-10-20", "onsite", "https://hyatt.taleo.net/careersection/10780/jobdetail.ftl?job=LON000001&lang=en"],
    ]);
  });

  test("stops on an empty page, and never reads more than eight", async () => {
    const empty = recordingFetcher(() => ({ pagingData: { totalCount: 0 }, requisitionList: [] }));
    assert.deepEqual(await pullTaleo(cfg, "security", empty), []);
    assert.equal(empty.calls.length, 1);
    let n = 0;
    const endless = recordingFetcher(() => ({ pagingData: { totalCount: 9999 }, requisitionList: [req(`X${n++}`, "Teller", ["US-IL-Chicago"])] }));
    await pullTaleo(cfg, "security", endless);
    assert.equal(endless.calls.length, 8);
  });

  test("a response that is not a Taleo search is an error, and so is a missing setting", async () => {
    await assert.rejects(pullTaleo(cfg, "security", recordingFetcher(() => ({ error: "nope" }))), /unexpected response from Taleo/);
    await assert.rejects(pullTaleo({ host: "x.taleo.net", section: "1" }, "security", recordingFetcher(() => ({}))), /needs host, section and portal/);
  });
});

describe("admin board form settings", () => {
  test("Taleo takes host, section and portal; Oracle takes host and site; Jobvite takes the company", () => {
    assert.deepEqual(parseConfig("taleo", "https://hyatt.taleo.net/careersection, 10780, 21860210089"), { host: "hyatt.taleo.net", section: "10780", portal: "21860210089" });
    assert.equal(parseConfig("taleo", "hyatt.taleo.net, 10780"), null);
    assert.deepEqual(parseConfig("oracle", "egug.fa.us2.oraclecloud.com"), { host: "egug.fa.us2.oraclecloud.com", site: "CX_1" });
    assert.deepEqual(parseConfig("oracle", "eofe.fa.us2.oraclecloud.com, BNY-Careers"), { host: "eofe.fa.us2.oraclecloud.com", site: "BNY-Careers" });
    assert.deepEqual(parseConfig("jobvite", "firstbank"), { company: "firstbank" });
  });
});
