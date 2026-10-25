// Employer pages: /employers/<slug> lists one employer's live roles, named first and then by city; /employers lists every
// employer with a live role and filters by name with a plain query parameter; job rows and pages link the employer name;
// the sitemap carries the pages. All against the fake database.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { jobRow } from "../functions/_lib/jobs.js";
import { employerIndex, employerPath } from "../functions/_lib/employers.js";
import { onRequestGet as employerPage } from "../functions/employers/[slug].js";
import { onRequestGet as employersIndex } from "../functions/employers/index.js";
import { onRequestGet as jobPage } from "../functions/[city]/jobs/[job].js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";

CITIES.dallas = CITIES.dallas || { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "", empty: "", newsletter: "sunday", sort: 110 };

const ORG = { id: 3, slug: "example-co", name: "Example Co", website: "https://www.example.com/", description: null };
const base = { organization_id: 3, org_name: "Example Co", org_slug: "example-co", employer_name: null, location: "Plano, TX", remote: "hybrid", seniority: "practitioner", topics: '["grc"]', salary_text: null, status: "published", featured_until: null, created_at: "2026-10-01T08:00:00.000Z", expires_at: "2099-01-01", posted_at: "2026-10-20", announced: 0, posted_by_name: null };
const NAMED = { ...base, id: 1, city: "dallas", title: "Senior Security Engineer", url: "https://careers.example.com/jobs/1", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_kind: "employer", posted_by_url: "https://www.linkedin.com/posts/janedoe-1", posted_by_date: "2026-10-22" };
const DALLAS = { ...base, id: 2, city: "dallas", title: "GRC Analyst", url: "https://careers.example.com/jobs/2", posted_at: "2026-10-23" };
const SANDIEGO = { ...base, id: 3, city: "sandiego", title: "Security Engineer II", url: "https://careers.example.com/jobs/3", posted_at: "2026-10-21" };
const REMOTE = { ...base, id: 4, city: "remote", title: "Detection Engineer", url: "https://careers.example.com/jobs/4", location: "United States (Remote)", remote: "remote" };

const withOrg = (rows, org = ORG) => fakeDb([
  { match: /FROM organizations WHERE slug=\?/, op: "first", reply: (args) => (args[0] === org.slug ? { ...org } : null) },
  { match: /WHERE j\.organization_id = \?/, op: "all", reply: (args) => ({ results: args[0] === org.id ? rows.map((r) => ({ ...r })) : [] }) },
]);
const render = async (handler, path, params = {}) => { const res = await handler({ params, request: new Request("https://bettersecurity.ai" + path), env: { DB: withOrgDb, SITE_URL: "https://bettersecurity.ai" } }); return { res, body: await res.text() }; };
let withOrgDb;

describe("the employer page", () => {
  test("lists named roles first, then the rest grouped by city, with title, description and canonical", async () => {
    withOrgDb = withOrg([SANDIEGO, DALLAS, NAMED, REMOTE]);
    const { res, body } = await render(employerPage, "/employers/example-co", { slug: "example-co" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.match(body, /<title>Security jobs at Example Co \| The Watch<\/title>/);
    assert.match(body, /<meta name="description" content="4 open cybersecurity, GRC, privacy and audit roles at Example Co, 1 posted about by someone at the employer, each linked to Example Co&#39;s own posting\.">/);
    assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/employers\/example-co">/);
    assert.match(body, /<h1>Example Co<\/h1>/);
    assert.match(body, /<img class="emp-logo emp-logo-page" src="\/logo\/example-co"/);
    assert.match(body, /<a href="https:\/\/www\.example\.com\/" rel="noopener" target="_blank">www\.example\.com<\/a>/);
    const named = body.indexOf('id="named-roles"'), sd = body.indexOf('id="city-sandiego"'), dal = body.indexOf('id="city-dallas"'), rem = body.indexOf('id="city-remote"');
    assert.ok(named > 0 && sd > named && dal > sd && rem > dal, "named first, then cities in board order, remote last");
    assert.match(body.slice(named, sd), /<h2>From the people hiring<\/h2><p class="jobs-fine">Roles someone at Example Co posted about publicly, with a link to their post\.<\/p>/);
    assert.match(body.slice(named, sd), /Senior Security Engineer[\s\S]*Jane Doe, Director of Security, is hiring/);
    assert.doesNotMatch(body.slice(sd, dal), /Senior Security Engineer|GRC Analyst/);
    assert.match(body.slice(sd, dal), /<h2>San Diego<\/h2>[\s\S]*Security Engineer II/);
    assert.match(body.slice(dal, rem), /<h2>Dallas<\/h2>[\s\S]*GRC Analyst/);
    assert.match(body.slice(rem), /<h2>Remote, anywhere in the US<\/h2>[\s\S]*Detection Engineer/);
    assert.match(body, /anyone named can <a href="mailto:watch@bettersecurity\.ai\?subject=Please%20remove%20my%20name">ask to be removed<\/a>/);
    assert.doesNotMatch(body, /name="robots" content="noindex"/);
    assert.equal(withOrgDb.calls.filter((c) => /FROM jobs/.test(c.sql)).length, 1, "one query for the roles");
  });
  test("an employer with nothing live gets a friendly noindex page, and an unknown slug a 404", async () => {
    withOrgDb = withOrg([]);
    const { res, body } = await render(employerPage, "/employers/example-co", { slug: "example-co" });
    assert.equal(res.status, 200);
    assert.match(body, /<meta name="robots" content="noindex">/);
    assert.match(body, /Example Co has no open security roles listed on The Watch at the moment\./);
    assert.match(body, /<a href="\/employers">employers index<\/a>/);
    assert.match(body, /<a href="\/dallas\/jobs">Dallas<\/a>/);
    assert.match(body, /<a href="\/remote\/jobs">Remote<\/a>/);
    assert.doesNotMatch(body, /job-row/);
    const missing = await render(employerPage, "/employers/nobody", { slug: "nobody" });
    assert.equal(missing.res.status, 404);
    assert.equal((await render(employerPage, "/employers/..", { slug: ".." })).res.status, 404);
  });
});

describe("the employers index", () => {
  const indexDb = (rows) => fakeDb([{ match: /GROUP BY o\.id ORDER BY n DESC/, op: "all", reply: (args) => ({ results: rows.filter((r) => !args.length || r.name.toLowerCase().includes(args[0].replace(/%/g, "").toLowerCase())) }) }]);
  const ROWS = [{ slug: "example-co", name: "Example Co", n: 4, named: 1 }, { slug: "sample-health", name: "Sample Health", n: 2, named: 0 }];
  test("lists employers with live roles, most roles first, with a link to each page", async () => {
    const db = indexDb(ROWS);
    const res = await employersIndex({ request: new Request("https://bettersecurity.ai/employers"), env: { DB: db } });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.match(body, /<title>Employers hiring in security \| The Watch<\/title>/);
    assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/employers">/);
    assert.match(body, /2 employers with 6 open roles/);
    assert.match(body, /<a href="\/employers\/example-co"><img class="emp-logo" src="\/logo\/example-co"[^>]*><span class="emp-name">Example Co<\/span><span class="emp-count">4 roles <small>1 posted about<\/small><\/span><\/a>/);
    assert.ok(body.indexOf("Example Co") < body.indexOf("Sample Health"));
    assert.match(body, /<form class="filters" method="get" action="\/employers">[\s\S]*<input type="search" name="q" value=""/);
    assert.equal(db.calls.filter((c) => /FROM jobs/.test(c.sql)).length, 1, "one query for the index");
  });
  test("the text filter is a GET parameter, escaped for LIKE, and the filtered page is noindex", async () => {
    const db = indexDb(ROWS);
    const res = await employersIndex({ request: new Request("https://bettersecurity.ai/employers?q=Sample"), env: { DB: db } });
    const body = await res.text();
    assert.match(body, /1 employer with 2 open roles/);
    assert.match(body, /Sample Health/); assert.doesNotMatch(body, /emp-name">Example Co/);
    assert.match(body, /value="sample"/);
    assert.match(body, /<a class="clear" href="\/employers">Clear<\/a>/);
    assert.match(body, /<meta name="robots" content="noindex">/);
    const q = db.calls.find((c) => /FROM jobs/.test(c.sql));
    assert.match(q.sql, /lower\(o\.name\) LIKE \? ESCAPE '\\'/);
    assert.deepEqual(q.args, ["%sample%"]);
    const tricky = await employerIndex(indexDb([]), "50%_off\\");
    assert.equal(tricky.term, "50%_off\\");
    assert.equal(indexDb([]).calls.length, 0);
  });
});

describe("links to the employer page", () => {
  test("job rows link the employer name when the employer has an organization row", () => {
    assert.match(String(jobRow({ ...DALLAS, topics: ["grc"], employer: "Example Co" })), /<p class="job-company"><a href="\/employers\/example-co">Example Co<\/a><\/p>/);
    assert.match(String(jobRow({ ...DALLAS, topics: ["grc"], employer: "Loose Inc", org_slug: null, organization_id: null })), /<p class="job-company">Loose Inc<\/p>/);
    assert.equal(employerPath("example-co"), "/employers/example-co");
  });
  test("the role page links the employer name in the heading and the facts", async () => {
    const db = fakeDb([{ match: /FROM jobs\b/, op: "first", reply: () => ({ ...DALLAS }) }]);
    const res = await jobPage({ params: { city: "dallas", job: "2-grc-analyst-at-example-co" }, request: new Request("https://bettersecurity.ai/dallas/jobs/2-grc-analyst-at-example-co"), env: { DB: db, SITE_URL: "https://bettersecurity.ai" } });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<p class="job-employer"><a href="\/employers\/example-co">Example Co<\/a><\/p>/);
    assert.match(body, /<dt>Employer<\/dt><dd><a href="\/employers\/example-co">Example Co<\/a><\/dd>/);
  });
});

describe("the sitemap", () => {
  test("carries the index and a page per employer with a live role, and nothing for employers without one", async () => {
    const db = fakeDb([{ match: /FROM jobs j/, op: "all", reply: () => ({ results: [
      { id: 1, city: "dallas", title: "Senior Security Engineer", employer_name: null, org_name: "Example Co", org_slug: "example-co", expires_at: "2099-01-01", updated_at: "2026-10-23T10:00:00.000Z" },
      { id: 3, city: "sandiego", title: "Security Engineer II", employer_name: null, org_name: "Example Co", org_slug: "example-co", expires_at: "2099-01-01", updated_at: "2026-10-24T10:00:00.000Z" },
      { id: 9, city: "dallas", title: "Loose Role", employer_name: "Loose Inc", org_name: null, org_slug: null, expires_at: "2099-01-01", updated_at: "2026-10-24T10:00:00.000Z" },
    ] }) }]);
    const xml = await (await sitemap({ env: { DB: db, SITE_URL: "https://bettersecurity.ai" } })).text();
    assert.match(xml, /<url><loc>https:\/\/bettersecurity\.ai\/employers<\/loc><lastmod>2026-10-24T10:00:00Z<\/lastmod><\/url>/);
    assert.match(xml, /<url><loc>https:\/\/bettersecurity\.ai\/employers\/example-co<\/loc><lastmod>2026-10-24T10:00:00Z<\/lastmod><\/url>/);
    assert.equal((xml.match(/\/employers\//g) || []).length, 1);
    const empty = await (await sitemap({ env: { DB: fakeDb(), SITE_URL: "https://bettersecurity.ai" } })).text();
    assert.doesNotMatch(empty, /\/employers/);
  });
});
