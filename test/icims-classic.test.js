// Classic iCIMS portals (careers-<name>.icims.com): the public search page, read as HTML. Fixtures are handcrafted in
// the two layouts these portals use, the bootstrap rows with labeled fields and the older table.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pullIcimsClassic, ADAPTERS, SOURCE_KINDS } from "../functions/_lib/job-sources.js";
import { fixtureText, recordingFetcher } from "./helpers.js";

const pages = () => [fixtureText("jobs/icims-classic-p0.html"), fixtureText("jobs/icims-classic-p1.html")];
const byPr = (list) => recordingFetcher((url) => list[Number(new URL(url).searchParams.get("pr"))]);

describe("pullIcimsClassic", () => {
  test("is registered as the icims_classic kind", () => {
    assert.equal(ADAPTERS.icims_classic, pullIcimsClassic);
    assert.equal(SOURCE_KINDS.icims_classic, "iCIMS classic");
  });

  test("asks the public search page for text and follows pr= while there is a next page", async () => {
    const f = byPr(pages());
    await pullIcimsClassic({ host: "careers-examplecorp.icims.com" }, "cyber security", f);
    assert.deepEqual(f.calls.map((c) => c.url), [
      "https://careers-examplecorp.icims.com/jobs/search?ss=1&searchKeyword=cyber%20security&in_iframe=1&pr=0",
      "https://careers-examplecorp.icims.com/jobs/search?ss=1&searchKeyword=cyber%20security&in_iframe=1&pr=1",
    ]);
    assert.equal(f.calls[0].init.text, true);
  });

  test("reads titles, links, locations and posted dates from the bootstrap layout", async () => {
    const out = await pullIcimsClassic({ host: "careers-examplecorp.icims.com" }, "security", byPr(pages()));
    assert.deepEqual(out, [
      { key: "12345", title: "Cyber Security Analyst", url: "https://careers-examplecorp.icims.com/jobs/12345/cyber-security-analyst/job", location: "Herndon, VA, US", posted_at: "2026-10-20", salary_text: null, remote: "onsite", excerpt: null },
      { key: "12347", title: "Information Systems Security Officer (ISSO) & Analyst", url: "https://careers-examplecorp.icims.com/jobs/12347/information-systems-security-officer-%28isso%29/job", location: "San Diego, CA, US; Washington, DC, US", posted_at: "2026-09-03", salary_text: null, remote: "onsite", excerpt: null },
      { key: "12348", title: "Insider Threat Analyst", url: "https://careers-examplecorp.icims.com/jobs/12348/insider-threat-analyst/job", location: "Remote (US)", posted_at: "2026-10-01", salary_text: null, remote: "remote", excerpt: null },
    ]);
  });

  test("the apply link in a row is not a second posting, and a posting repeated on a later page is read once", async () => {
    const out = await pullIcimsClassic({ host: "careers-examplecorp.icims.com" }, "security", byPr(pages()));
    assert.equal(out.filter((r) => r.key === "12345").length, 1);
    assert.ok(out.every((r) => r.url.endsWith("/job")));
  });

  test("reads the older table layout, relative links and a host given as a URL", async () => {
    const f = recordingFetcher(() => fixtureText("jobs/icims-classic-table.html"));
    const out = await pullIcimsClassic({ host: "https://corporatejobs-example.icims.com/jobs/intro" }, "security", f);
    assert.equal(f.calls.length, 1); // no pager on the page
    assert.match(f.calls[0].url, /^https:\/\/corporatejobs-example\.icims\.com\/jobs\/search\?/);
    assert.deepEqual(out.map((r) => [r.key, r.title, r.location, r.url]), [
      ["5001", "Vulnerability Management Engineer", "Seattle, WA, US", "https://corporatejobs-example.icims.com/jobs/5001/vulnerability-management-engineer/job"],
      ["5003", "GRC Analyst", "Seattle, WA", "https://corporatejobs-example.icims.com/jobs/5003/grc-analyst/job"],
    ]);
  });

  test("stops when a page adds nothing new even if it links to another page", async () => {
    const same = fixtureText("jobs/icims-classic-p0.html");
    const f = recordingFetcher(() => same);
    await pullIcimsClassic({ host: "careers-examplecorp.icims.com" }, "security", f);
    assert.equal(f.calls.length, 2);
  });

  test("never reads more than ten pages", async () => {
    const f = recordingFetcher((url) => {
      const pr = Number(new URL(url).searchParams.get("pr"));
      return `<div class="iCIMS_JobsTable"><a href="/jobs/${100 + pr}/x/job"><h3>Security Engineer</h3></a></div><a href="?pr=${pr + 1}">Next</a>`;
    });
    const out = await pullIcimsClassic({ host: "careers-x.icims.com" }, "security", f);
    assert.equal(f.calls.length, 10);
    assert.equal(out.length, 10);
  });

  test("an empty result page is not an error, a page that is not an iCIMS list is", async () => {
    const empty = recordingFetcher(() => '<div class="iCIMS_JobsTable"><div class="iCIMS_Message">Sorry, no jobs were found.</div></div>');
    assert.deepEqual(await pullIcimsClassic({ host: "careers-x.icims.com" }, "security", empty), []);
    await assert.rejects(pullIcimsClassic({ host: "careers-x.icims.com" }, "security", recordingFetcher(() => "<html>Access denied</html>")), /unexpected page from iCIMS/);
  });
});
