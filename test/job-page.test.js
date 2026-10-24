// A page per role: renders the role page, the board and the sitemap against the fake D1, and checks the parts that
// decide whether Google can use them: one JobPosting per role page and none on the board, the employer's own posting
// as the apply link, no stale listing for a closed role, and the role page cached at the edge like other public pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { jobPath } from "../functions/_lib/jobs.js";
import { onRequestGet as jobPage } from "../functions/[city]/jobs/[job].js";
import { onRequestGet as jobsBoard } from "../functions/[city]/jobs/index.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { onRequestPost as applyPing } from "../functions/go/j/[id].js";
import { onRequest as middleware } from "../functions/_middleware.js";

CITIES.dallas = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "Every cybersecurity event in Dallas.", empty: "Nothing yet.", newsletter: "sunday", sort: 110 };

const JOB = {
  id: 42, city: "dallas", title: "Senior Security Engineer", org_name: "Example Co", employer_name: null,
  url: "https://careers.example.com/jobs/123", location: "Plano, TX", remote: "hybrid", seniority: "practitioner",
  topics: '["grc"]', salary_text: "$150,000 to $180,000", posted_at: "2026-10-20", expires_at: "2099-11-20",
  status: "published", featured_until: null, created_at: "2026-10-20T08:00:00.000Z",
  posted_by_name: "Jane Doe", posted_by_title: "CISO", posted_by_url: "https://www.linkedin.com/posts/janedoe-123", posted_by_kind: "employer", posted_by_date: "2026-10-21",
};
const PATH = "/dallas/jobs/42-senior-security-engineer-at-example-co";

const withJob = (row) => fakeDb([{ match: /FROM jobs\b/, op: "first", reply: () => (row ? { ...row } : null) }]);
async function render(path, db) {
  const res = await jobPage({ params: { city: path.split("/")[1], job: path.split("/")[3] }, request: new Request("https://bettersecurity.ai" + path), env: { DB: db, SITE_URL: "https://bettersecurity.ai" } });
  return { res, body: await res.text() };
}
const ldBlocks = (body) => [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("role path: id first for a stable lookup, then a readable slug of title and employer", () => {
  assert.equal(jobPath({ ...JOB, employer: "Example Co" }), PATH);
  assert.equal(jobPath({ id: 7, city: "dallas", title: "GRC Analyst (Remote)", employer_name: "A&B Corp." }), "/dallas/jobs/7-grc-analyst-remote-at-ab-corp");
});

test("live role: 200 with one JobPosting carrying the right fields", async () => {
  const { res, body } = await render(PATH, withJob(JOB));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /public/);
  const ld = ldBlocks(body);
  assert.equal(ld.length, 1);
  const job = ld[0];
  assert.equal(job["@type"], "JobPosting");
  assert.equal(job.title, "Senior Security Engineer");
  assert.equal(job.hiringOrganization.name, "Example Co");
  assert.equal(job.directApply, false);
  assert.equal(job.validThrough, "2099-11-20T23:59:59");
  assert.equal(job.datePosted, "2026-10-20");
  assert.equal(job.jobLocation.address.addressLocality, "Plano");
  assert.equal(job.jobLocation.address.addressRegion, "TX");
  assert.equal(job.jobLocationType, undefined);
  assert.deepEqual(job.baseSalary.value, { "@type": "QuantitativeValue", minValue: 150000, maxValue: 180000, unitText: "YEAR" });
  assert.equal(job.url, "https://bettersecurity.ai" + PATH);
});

test("live role: the apply button is the employer's own posting, and the page names who posted it", async () => {
  const { body } = await render(PATH, withJob(JOB));
  const apply = (body.match(/<a [^>]*>Apply on the employer's site<\/a>/) || [])[0] || "";
  assert.match(apply, /href="https:\/\/careers\.example\.com\/jobs\/123"/);
  assert.match(apply, /rel="noopener nofollow"/);
  assert.match(apply, /target="_blank"/);
  assert.match(body, /<a href="https:\/\/www\.linkedin\.com\/posts\/janedoe-123" rel="noopener nofollow" target="_blank">Jane Doe<\/a>, CISO/);
  assert.match(body, /<dt>Salary<\/dt><dd>\$150,000 to \$180,000<\/dd>/);
  assert.match(body, /<dt>Work model<\/dt><dd>Hybrid<\/dd>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/dallas\/jobs\/42-senior-security-engineer-at-example-co">/);
  assert.match(body, /<title>Senior Security Engineer at Example Co, Plano, TX \| The Watch Dallas<\/title>/);
  assert.match(body, /<meta name="description" content="Senior Security Engineer at Example Co, Plano, TX \(hybrid\)\./);
  assert.match(body, /name="source" value="job:dallas"/);
  assert.match(body, /<input type="hidden" name="city" value="dallas">/);
});

test("remote role: TELECOMMUTE with no street location", async () => {
  const { body } = await render(PATH, withJob({ ...JOB, remote: "remote", location: "Remote, US" }));
  const [job] = ldBlocks(body);
  assert.equal(job.jobLocationType, "TELECOMMUTE");
  assert.equal(job.jobLocation, undefined);
  assert.deepEqual(job.applicantLocationRequirements, { "@type": "Country", name: "USA" });
});

test("an old slug or no slug redirects to the role's one address", async () => {
  for (const p of ["/dallas/jobs/42", "/dallas/jobs/42-security-engineer-at-old-name", "/sandiego/jobs/" + PATH.split("/")[3]]) {
    const { res } = await render(p, withJob(JOB));
    assert.equal(res.status, 301, p);
    assert.equal(res.headers.get("location"), "https://bettersecurity.ai" + PATH);
  }
});

test("closed and expired roles answer 410 and show nothing of the old listing", async () => {
  for (const row of [{ ...JOB, status: "closed" }, { ...JOB, status: "expired" }, { ...JOB, expires_at: "2001-01-01" }]) {
    const { res, body } = await render(PATH, withJob(row));
    assert.equal(res.status, 410);
    assert.doesNotMatch(body, /Senior Security Engineer|careers\.example\.com|application\/ld\+json/);
    assert.match(body, /<meta name="robots" content="noindex">/);
    assert.match(body, /href="\/dallas\/jobs"/);
  }
});

test("held, rejected and unknown roles answer 404", async () => {
  for (const row of [{ ...JOB, status: "pending_review" }, { ...JOB, status: "rejected" }, { ...JOB, status: "draft" }, null]) {
    const { res, body } = await render(PATH, withJob(row));
    assert.equal(res.status, 404);
    assert.doesNotMatch(body, /careers\.example\.com/);
  }
  assert.equal((await render("/dallas/jobs/not-a-role", withJob(JOB))).res.status, 404);
});

test("jobs board: no JobPosting markup, titles open the role page, Apply still goes to the employer", async () => {
  const db = fakeDb([{ match: /FROM jobs j/, op: "all", reply: () => ({ results: [{ ...JOB }] }) }]);
  const res = await jobsBoard({ params: { city: "dallas" }, request: new Request("https://bettersecurity.ai/dallas/jobs"), env: { DB: db, SITE_URL: "https://bettersecurity.ai" }, waitUntil: () => {} });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(body, /JobPosting/);
  assert.doesNotMatch(body, /application\/ld\+json/);
  assert.match(body, /<h2 class="job-title"><a href="\/dallas\/jobs\/42-senior-security-engineer-at-example-co">Senior Security Engineer<\/a><\/h2>/);
  assert.match(body, /<a class="btn btn-outline btn-small job-apply" href="\/go\/j\/42"/);
});

test("apply ping counts a click for a published role only", async () => {
  const live = withJob(JOB);
  const res = await applyPing({ params: { id: "42" }, request: new Request("https://bettersecurity.ai/go/j/42", { method: "POST" }), env: { DB: live } });
  assert.equal(res.status, 204);
  assert.equal(live.find(/apply_clicks = apply_clicks \+ 1/).length, 1);
  const closed = withJob({ ...JOB, status: "closed" });
  await applyPing({ params: { id: "42" }, request: new Request("https://bettersecurity.ai/go/j/42", { method: "POST" }), env: { DB: closed } });
  assert.equal(closed.find(/apply_clicks/).length, 0);
});

test("sitemap: live roles and their board, lastmod dates, no empty directories, recordings kept", async () => {
  const db = fakeDb([
    { match: /e\.start_at >= \? OR \(e\.recording_url/, op: "all", reply: () => ({ results: [{ slug: "issa-north-texas-october", city: "dallas", updated_at: "2026-10-20 10:00:00" }, { slug: "past-webinar-with-recording", city: "virtual", updated_at: "2026-09-01T12:00:00.000Z" }] }) },
    { match: /GROUP BY o\.id, e\.city/, op: "all", reply: () => ({ results: [{ slug: "issa-north-texas", city: "dallas", updated_at: "2026-10-20 10:00:00" }] }) },
    { match: /e\.speakers IS NOT NULL/, op: "all", reply: () => ({ results: [{ city: "dallas", also_virtual: 0, format: "in_person", speakers: "Jane Doe (Example Co)" }, { city: "virtual", also_virtual: 0, format: "virtual", speakers: "TBD" }] }) },
    { match: /FROM jobs j/, op: "all", reply: () => ({ results: [{ ...JOB, updated_at: "2026-10-22T08:00:00.000Z" }, { ...JOB, id: 43, title: "Old Role", expires_at: "2001-01-01", updated_at: null }] }) },
  ]);
  const xml = await (await sitemap({ env: { DB: db, SITE_URL: "https://bettersecurity.ai" } })).text();
  const has = (p) => xml.includes(`<loc>https://bettersecurity.ai${p}</loc>`);
  assert.ok(has(PATH));
  assert.match(xml, new RegExp(`<loc>https://bettersecurity.ai${PATH}</loc><lastmod>2026-10-22T08:00:00Z</lastmod>`));
  assert.ok(!has("/dallas/jobs/43-old-role-at-example-co"));
  assert.ok(has("/dallas/jobs"));
  assert.ok(!has("/sandiego/jobs"), "a board with no live roles is left out");
  assert.ok(has("/dallas/organizers") && has("/dallas/organizers/issa-north-texas"));
  assert.ok(!has("/sandiego/organizers"), "an organizer directory with nobody on it renders noindex");
  assert.ok(has("/dallas/speakers"));
  assert.ok(!has("/sandiego/speakers") && !has("/virtual/speakers"), "speaker boards with no parsed names render noindex");
  assert.ok(has("/virtual/events/past-webinar-with-recording"));
  assert.match(xml, /<loc>https:\/\/bettersecurity\.ai\/dallas\/events\/issa-north-texas-october<\/loc><lastmod>2026-10-20T10:00:00Z<\/lastmod>/);
  assert.equal(new Set(xml.match(/<loc>[^<]+<\/loc>/g)).size, xml.match(/<loc>/g).length, "no duplicate paths");
});

test("edge cache: a role page is cached like other public pages, the apply redirect is not", async () => {
  const puts = [];
  const original = globalThis.caches;
  globalThis.caches = { default: { match: async () => null, put: async (req) => { puts.push(new URL(req.url).pathname); } } };
  try {
    for (const path of [PATH, "/go/j/42"]) {
      const pending = [];
      await middleware({
        request: new Request("https://bettersecurity.ai" + path), env: { DB: fakeDb() }, waitUntil: (p) => pending.push(p),
        next: async () => new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } }),
      });
      await Promise.all(pending);
    }
  } finally { globalThis.caches = original; }
  assert.ok(puts.includes(PATH));
  assert.ok(!puts.includes("/go/j/42"));
});

test("excerpt: shown under the employer's name and leading the JobPosting description; absent when the board gave none", async () => {
  const excerpt = "You will lead the GRC program across SOC 2 and ISO 27001. You will partner with engineering on control design.";
  const { body } = await render(PATH, withJob({ ...JOB, excerpt }));
  assert.match(body, /<section class="job-excerpt"><h2>From Example Co's posting<\/h2><p>You will lead the GRC program/);
  assert.match(body, /The rest of the description and the application/);
  const [posting] = ldBlocks(body).filter((b) => b["@type"] === "JobPosting");
  assert.ok(posting.description.startsWith(excerpt), posting.description);
  assert.match(posting.description, /rest of the description and application are on Example Co's own careers page/);
  const plain = await render(PATH, withJob({ ...JOB, excerpt: null }));
  assert.doesNotMatch(plain.body, /job-excerpt/);
  assert.match(plain.body, /The full description and the application/);
});
