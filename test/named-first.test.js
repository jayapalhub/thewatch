// City jobs page: roles someone at the employer posted about come first, in their own section, then the remote section,
// then every other role under More roles in <City>. With no named roles the page is laid out as before. The Sunday email
// shows named roles before unnamed ones within its block.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { pickJobsFor, jobsEmailBlock, isNamed } from "../functions/_lib/jobs.js";
import { jobsBlock } from "../functions/_lib/newsletter.js";
import { onRequestGet as jobsBoard } from "../functions/[city]/jobs/index.js";

CITIES.dallas = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "Every cybersecurity event in Dallas.", empty: "Nothing yet.", newsletter: "sunday", sort: 110 };

const base = { city: "dallas", org_name: "Example Co", employer_name: null, location: "Plano, TX", remote: "hybrid", seniority: "practitioner", topics: '["grc"]', salary_text: null, status: "published", featured_until: null, created_at: "2026-10-01T08:00:00.000Z", expires_at: "2099-01-01", posted_at: "2026-10-20", announced: 0 };
const NAMED = { ...base, id: 1, title: "Senior Security Engineer", url: "https://careers.example.com/jobs/1", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_kind: "employer", posted_by_url: "https://www.linkedin.com/posts/janedoe-1", posted_by_date: "2026-10-22" };
const NAMED_OLD = { ...base, id: 2, title: "IT Auditor", url: "https://careers.example.com/jobs/2", posted_by_name: "Pat Old", posted_by_title: "Recruiter", posted_by_kind: "employer", posted_by_role: null, posted_by_date: "2026-08-01", posted_by_url: "https://www.linkedin.com/posts/patold-2" };
const PLAIN = { ...base, id: 3, title: "Security Engineer II", url: "https://careers.example.com/jobs/3", posted_at: "2026-10-23", posted_by_name: null };
const PLAIN_FEATURED = { ...base, id: 4, title: "GRC Analyst", url: "https://careers.example.com/jobs/4", posted_by_name: "", featured_until: "2099-01-01" };
const REMOTE_NAMED = { ...NAMED, id: 5, city: "remote", title: "Remote Detection Engineer", url: "https://careers.example.com/jobs/5", location: "United States (Remote)", remote: "remote", posted_by_date: "2026-10-23" };

// liveJobs binds the city first; postedJobs for the remote section binds "remote" last.
const board = (cityRows, remoteRows = []) => fakeDb([{ match: /FROM jobs j/, op: "all", reply: (args) => ({ results: (args[0] === "dallas" ? cityRows : args.at(-2) === "remote" || args.includes("remote") ? remoteRows : []).map((r) => ({ ...r })) }) }]);
async function render(db, path = "/dallas/jobs") {
  const res = await jobsBoard({ params: { city: "dallas" }, request: new Request("https://bettersecurity.ai" + path), env: { DB: db, SITE_URL: "https://bettersecurity.ai" }, waitUntil: () => {} });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
  return res.text();
}
const at = (body, s) => { const i = body.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); return i; };

describe("city jobs page", () => {
  test("named roles come first in their own section, then the remote section, then More roles in Dallas", async () => {
    const body = await render(board([NAMED, PLAIN, NAMED_OLD, PLAIN_FEATURED], [REMOTE_NAMED]));
    assert.match(body, /<section class="jobs-named" id="named-roles"><h2>From the people hiring<\/h2><p class="jobs-fine">Roles someone at the employer posted about publicly, with a link to their post\.<\/p>/);
    const named = at(body, 'id="named-roles"'), remote = at(body, 'id="remote-roles"'), more = at(body, 'id="more-roles"');
    assert.ok(named < remote && remote < more, "sections in order");
    assert.match(body, /<section class="jobs-more" id="more-roles"><h2>More roles in Dallas<\/h2>/);
    // Both named roles sit in the first section, including the one whose highlight has lapsed; the rest sit under More roles.
    const namedSection = body.slice(named, remote), moreSection = body.slice(more);
    assert.match(namedSection, /Senior Security Engineer/); assert.match(namedSection, /IT Auditor/);
    assert.doesNotMatch(namedSection, /Security Engineer II|GRC Analyst/);
    assert.match(moreSection, /GRC Analyst[\s\S]*Security Engineer II/, "featured first among the unnamed");
    assert.doesNotMatch(moreSection, /Senior Security Engineer|IT Auditor/);
    // The person label and the link to the post are as they were.
    assert.match(namedSection, /Jane Doe, Director of Security, is hiring/);
    assert.match(body, /4 open roles\./);
    assert.equal((body.match(/id="job-1"/g) || []).length, 1, "each role appears once");
  });

  test("with no named roles the page is laid out as before", async () => {
    const body = await render(board([PLAIN, PLAIN_FEATURED]));
    assert.doesNotMatch(body, /From the people hiring/);
    assert.doesNotMatch(body, /More roles in Dallas/);
    assert.doesNotMatch(body, /jobs-named|jobs-more/);
    assert.match(body, /<p class="jobs-count">2 open roles\.<\/p>\s*<ul class="job-list">/);
    assert.match(body, /GRC Analyst[\s\S]*Security Engineer II/);
  });

  test("with only named roles there is no empty More roles section", async () => {
    const body = await render(board([NAMED]));
    assert.match(body, /id="named-roles"/);
    assert.doesNotMatch(body, /More roles in Dallas|id="more-roles"/);
  });

  test("the remote section is unchanged, with or without named roles", async () => {
    const remoteSection = (body) => (body.match(/<section class="jobs-remote" id="remote-roles">[\s\S]*?<\/section>/) || [])[0];
    const a = remoteSection(await render(board([NAMED, PLAIN], [REMOTE_NAMED])));
    const b = remoteSection(await render(board([PLAIN], [REMOTE_NAMED])));
    assert.ok(a && b, "the section renders in both layouts");
    assert.equal(a, b);
    assert.match(a, /<h2>Remote across the US<\/h2><p class="jobs-fine">Open anywhere in the United States, posted by someone at the employer\. <a href="\/remote\/jobs">The remote board<\/a> has them all\.<\/p>/);
    assert.match(a, /Remote Detection Engineer/);
    const none = await render(board([NAMED, PLAIN], []));
    assert.doesNotMatch(none, /id="remote-roles"/);
  });

  test("the query asks for named roles first and nothing extra is queried", async () => {
    const db = board([NAMED, PLAIN], []);
    await render(db);
    const lists = db.calls.filter((c) => /FROM jobs j/.test(c.sql));
    assert.equal(lists.length, 2, "one query for the board and one for the remote section, as before");
    assert.match(lists[0].sql, /ORDER BY \(CASE WHEN \(j\.posted_by_name IS NOT NULL AND j\.posted_by_name != ''\) THEN 0 ELSE 1 END\), \(CASE WHEN j\.featured_until >= \? THEN 0 ELSE 1 END\)/);
  });
});

describe("Sunday email", () => {
  const styles = { INK: "#000", MUTED: "#555", SHIELD: "#124", MIST: "#ddd", esc: (s) => String(s) };
  test("named roles come before unnamed ones within the block, and the same three are chosen", () => {
    const picks = pickJobsFor([PLAIN_FEATURED, PLAIN, NAMED_OLD, NAMED].map((j) => ({ ...j, employer: "Example Co" })), "practitioner", 3);
    assert.deepEqual(picks.map((j) => j.id), [2, 1, 4]);
    assert.deepEqual(picks.map(isNamed), [true, true, false]);
    const html = jobsEmailBlock("https://bettersecurity.ai", CITIES.dallas, picks, 4, 9, styles);
    assert.ok(html.indexOf("IT Auditor") < html.indexOf("GRC Analyst"));
    assert.match(html, /Hiring this week/);
    assert.match(html, /Posted by Pat Old, Recruiter/);
  });
  test("the whole block keeps From the people hiring first and then the ordinary picks, named before unnamed", () => {
    const html = jobsBlock("https://bettersecurity.ai", CITIES.dallas, [PLAIN_FEATURED, PLAIN, NAMED_OLD, NAMED].map((j) => ({ ...j, employer: "Example Co" })), "practitioner", 9);
    assert.ok(html.indexOf("From the people hiring") < html.indexOf("Hiring this week"));
    const rest = html.slice(html.indexOf("Hiring this week"));
    assert.ok(rest.indexOf("IT Auditor") < rest.indexOf("GRC Analyst") && rest.indexOf("GRC Analyst") < rest.indexOf("Security Engineer II"));
  });
});
