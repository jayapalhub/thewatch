// Jobvite career sites (jobs.jobvite.com/<company>): the public search page plus one detail page per kept posting.
// Fixtures are handcrafted in the layout FirstBank's site used on 2026-10-23.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pullJobvite, ADAPTERS, SOURCE_KINDS } from "../functions/_lib/job-sources.js";
import { fixtureText, recordingFetcher } from "./helpers.js";

const single = `<p class="jv-job-detail-meta">Internal Audit<span class='jv-inline-separator'></span> Nashville, Tennessee </p>
  <div class="jv-job-detail-description"><h3>Description</h3><p>This position is responsible for planning and performing IT audits of the bank&rsquo;s systems and controls, and for reporting findings to management.</p></div><div class="jv-job-detail-bottom-actions"></div>`;
const site = (over = {}) => recordingFetcher((url) => {
  if (url.includes("/search?")) return over.search ?? fixtureText("jobs/jobvite-search.html");
  if (url.endsWith("/oCCC3333")) return over.multi ?? fixtureText("jobs/jobvite-detail-multi.html");
  if (url.endsWith("/oAAA1111")) return over.single ?? single;
  throw new Error("unexpected " + url);
});

describe("pullJobvite", () => {
  test("is registered as the jobvite kind", () => {
    assert.equal(ADAPTERS.jobvite, pullJobvite);
    assert.equal(SOURCE_KINDS.jobvite, "Jobvite");
  });

  test("reads the search page as text, then one detail page for each posting it keeps", async () => {
    const f = site();
    await pullJobvite({ company: "examplebank" }, "information security", f);
    assert.deepEqual(f.calls.map((c) => c.url), [
      "https://jobs.jobvite.com/examplebank/search?q=information%20security&p=0",
      "https://jobs.jobvite.com/examplebank/job/oAAA1111",
      "https://jobs.jobvite.com/examplebank/job/oCCC3333",
    ]);
    assert.ok(f.calls.every((c) => c.init.text === true));
  });

  test("keeps our roles with their posting links, places and excerpts; the apply link is not a second posting", async () => {
    const out = await pullJobvite({ company: "examplebank" }, "security", site());
    assert.deepEqual(out.map((r) => [r.key, r.title, r.url, r.location, r.remote]), [
      ["oAAA1111", "Senior IT Internal Auditor", "https://jobs.jobvite.com/examplebank/job/oAAA1111", "Nashville, Tennessee", "onsite"],
      ["oCCC3333", "Information Security Analyst & Engineer", "https://jobs.jobvite.com/examplebank/job/oCCC3333", "Nashville, Tennessee; Remote, United States", "hybrid"],
    ]);
    assert.match(out[0].excerpt, /^This position is responsible for planning/);
    assert.match(out[1].excerpt, /^You will monitor the bank’s security tools/);
    assert.ok(out.every((r) => r.posted_at === null && r.salary_text === null));
  });

  test("a detail page that fails keeps the list page's location", async () => {
    const f = recordingFetcher((url) => { if (url.includes("/search?")) return fixtureText("jobs/jobvite-search.html"); throw new Error("HTTP 500"); });
    const out = await pullJobvite({ company: "examplebank" }, "security", f);
    assert.deepEqual(out.map((r) => [r.key, r.location, r.excerpt]), [["oAAA1111", "Nashville, Tennessee", null], ["oCCC3333", "2 Locations", null]]);
  });

  test("follows p= while the pager says there is more, and stops on a page that adds nothing", async () => {
    const page = (p) => `<div class="jv-job-list"><a href="/x/job/id${p}"><div class="jv-job-list-name">Teller</div><div class="jv-job-list-location">A, B</div></a></div><div class="jv-pagination-text">${p * 1 + 1}-${p * 1 + 1} of 3</div>`;
    const f = recordingFetcher((url) => page(Number(new URL(url).searchParams.get("p"))));
    await pullJobvite({ company: "x" }, "security", f);
    assert.equal(f.calls.length, 3);
    const same = recordingFetcher(() => page(0));
    await pullJobvite({ company: "x" }, "security", same);
    assert.equal(same.calls.length, 2);
  });

  test("an empty result is not an error; a page that is not a Jobvite list is, and so is a missing company", async () => {
    const empty = recordingFetcher(() => '<body class="jv-page jv-page-search"><div class="jv-page-error">No jobs found</div></body>');
    assert.deepEqual(await pullJobvite({ company: "x" }, "security", empty), []);
    await assert.rejects(pullJobvite({ company: "x" }, "security", recordingFetcher(() => "<html>Access denied</html>")), /unexpected page from Jobvite/);
    await assert.rejects(pullJobvite({}, "security", recordingFetcher(() => "")), /needs a company/);
  });
});
