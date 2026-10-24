// Roles people post about (the standing rule in CLAUDE.md): the admin form rules, the person highlight and its 21 day
// window, labels on rows and pages, board order and filter, the two From the people hiring pages, the email block,
// the sitemap, the match from a board run, and no JobPosting markup for an announced role.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, insertRow, recordingFetcher } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { postedHighlight, postedLabel, announcedExpiry, titlesMatch, sortJobs, jobRow, jobJsonLd, liveJobs, postedJobs, POSTED_DAYS, removalLink } from "../functions/_lib/jobs.js";
import { parsePostedForm, parseJobForm, postedForm } from "../functions/_lib/admin-jobs.js";
import { jobsBlock } from "../functions/_lib/newsletter.js";
import { runJobSource } from "../functions/_lib/job-sources.js";
import { onRequestGet as jobPage } from "../functions/[city]/jobs/[job].js";
import { onRequestGet as jobsBoard } from "../functions/[city]/jobs/index.js";
import { onRequestGet as cityPosted } from "../functions/[city]/jobs/posted.js";
import { onRequestGet as allPosted } from "../functions/jobs/posted.js";
import { onRequestPost as addPosted } from "../functions/admin/jobs/posted.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";

CITIES.dallas = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "Every cybersecurity event in Dallas.", empty: "Nothing yet.", newsletter: "sunday", sort: 110 };

const TODAY = "2026-10-24";
const base = { city: "dallas", org_name: "Example Co", employer: "Example Co", employer_name: null, location: "Plano, TX", remote: "hybrid", seniority: "practitioner", topics: ["grc"], salary_text: null, status: "published", featured_until: null, created_at: "2026-10-01T08:00:00.000Z", expires_at: "2099-01-01", posted_at: "2026-10-20" };
const POSTED = { ...base, id: 1, title: "Senior Security Engineer", url: "https://careers.example.com/jobs/1", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_kind: "employer", posted_by_url: "https://www.linkedin.com/posts/janedoe-1", posted_by_date: "2026-10-22", announced: 0 };
const LEADER = { ...POSTED, id: 2, title: "GRC Analyst", url: "https://careers.example.com/jobs/2", posted_by_name: "Sam Lee", posted_by_title: "CISO", posted_by_role: "leader", posted_by_date: "2026-10-23", posted_by_url: "https://www.linkedin.com/posts/samlee-2" };
const RECRUITER = { ...POSTED, id: 3, title: "SOC Analyst", url: "https://careers.example.com/jobs/3", posted_by_name: "Ana Ruiz", posted_by_title: "Senior Talent Partner", posted_by_role: "recruiter", posted_by_date: "2026-10-10" };
const ANNOUNCED = { ...POSTED, id: 4, title: "Cloud Security Architect", url: "https://www.linkedin.com/posts/janedoe-4", posted_by_url: "https://www.linkedin.com/posts/janedoe-4", posted_by_date: "2026-10-21", announced: 1, expires_at: "2026-11-11" };
const OLD = { ...POSTED, id: 5, title: "Privacy Analyst", url: "https://careers.example.com/jobs/5", posted_by_date: "2026-09-20" };
const PLAIN = { ...base, id: 6, title: "Security Engineer II", url: "https://careers.example.com/jobs/6", posted_at: "2026-10-23", posted_by_name: null };
const LEGACY = { ...base, id: 7, title: "IT Auditor", url: "https://careers.example.com/jobs/7", posted_by_name: "Pat Old", posted_by_title: "Recruiter", posted_by_kind: "employer", posted_by_role: null, posted_by_date: "2026-10-23", posted_by_url: "https://www.linkedin.com/posts/patold-7" };
const STAFFING = { ...POSTED, id: 8, title: "Security Analyst", posted_by_kind: "staffing", posted_by_role: "recruiter" };
const rowsDb = (rows) => fakeDb([{ match: /FROM jobs j/, op: "all", reply: () => ({ results: rows.map((r) => ({ ...r, topics: JSON.stringify(r.topics) })) }) }]);
const env = (db) => ({ DB: db, SITE_URL: "https://bettersecurity.ai", ENVIRONMENT: "production" });

describe("the person highlight", () => {
  test("lasts 21 days from the post, for a named hiring manager, leader or in house recruiter", () => {
    assert.equal(postedHighlight(POSTED, TODAY), true);
    assert.equal(postedHighlight({ ...POSTED, posted_by_date: "2026-10-03" }, TODAY), true); // day 21
    assert.equal(postedHighlight({ ...POSTED, posted_by_date: "2026-10-02" }, TODAY), false); // day 22
    assert.equal(postedHighlight(OLD, TODAY), false);
    assert.equal(postedHighlight(STAFFING, TODAY), false);
    assert.equal(postedHighlight(LEGACY, TODAY), false);
    assert.equal(postedHighlight({ ...POSTED, posted_by_name: "" }, TODAY), false);
    assert.equal(postedHighlight({ ...POSTED, posted_by_date: null }, TODAY), false);
  });
  test("labels say who posted", () => {
    assert.equal(postedLabel(POSTED), "Hiring manager posted");
    assert.equal(postedLabel(LEADER), "Security leader posted");
    assert.equal(postedLabel(RECRUITER), "Recruiter posted");
    for (const j of [POSTED, LEADER, RECRUITER]) assert.ok(!/[-!]/.test(postedLabel(j)));
  });
  test("an announced role comes down 21 days after the post", () => {
    assert.equal(announcedExpiry("2026-10-21", TODAY), "2026-11-11");
    assert.equal(POSTED_DAYS, 21);
  });
  test("the removal link names the role", () => {
    assert.equal(removalLink(POSTED), "mailto:watch@bettersecurity.ai?subject=Please%20remove%20my%20name%3A%20Senior%20Security%20Engineer%20at%20Example%20Co");
  });
});

describe("title matching for announced roles", () => {
  test("close titles match across grades, punctuation and work model words", () => {
    assert.equal(titlesMatch("Sr. Security Engineer (Remote)", "Senior Security Engineer"), true);
    assert.equal(titlesMatch("Cloud Security Architect", "Cloud Security Architect, Payments"), true);
    assert.equal(titlesMatch("Cybersecurity Analyst II", "Cyber Security Analyst"), true);
    assert.equal(titlesMatch("Detection Engineering Lead", "Lead, Detection Engineering"), true);
  });
  test("different roles do not", () => {
    assert.equal(titlesMatch("Security Engineer", "Privacy Analyst"), false);
    assert.equal(titlesMatch("GRC Analyst", "GRC Manager"), false);
    assert.equal(titlesMatch("Security Engineer", "Security Awareness Program Manager"), false);
    assert.equal(titlesMatch("", "Security Engineer"), false);
  });
});

describe("board order and filter", () => {
  test("highlighted roles sort to the top, newest post first, then other named roles, then the rest", () => {
    const out = sortJobs([PLAIN, OLD, RECRUITER, LEGACY, POSTED, LEADER, ANNOUNCED], TODAY).map((j) => j.id);
    assert.deepEqual(out, [2, 1, 4, 3, 5, 7, 6]); // 5 and 7 share a posting date and keep their order
    const featured = { ...PLAIN, id: 9, featured_until: "2099-01-01" };
    assert.equal(sortJobs([POSTED, featured], TODAY)[0].id, 9);
  });
  test("liveJobs with posted asks only for highlighted roles, and the page offers the filter", async () => {
    const db = rowsDb([POSTED]);
    await liveJobs(db, "dallas", { posted: "1" });
    const sql = db.calls[0].sql;
    assert.match(sql, /posted_by_role IN \('hiring_manager','leader','recruiter'\)/);
    assert.match(sql, /COALESCE\(j\.posted_by_kind,''\) != 'staffing'/);
    assert.match(sql, /j\.posted_by_date >= \?/);
    const res = await jobsBoard({ params: { city: "dallas" }, request: new Request("https://bettersecurity.ai/dallas/jobs?posted=1"), env: env(rowsDb([POSTED, PLAIN])), waitUntil: () => {} });
    const body = await res.text();
    assert.match(body, /<option value="1" selected>Posted by the people hiring<\/option>/);
    assert.match(body, /<a href="\/dallas\/jobs\/posted">1 of them was posted about by the people hiring<\/a>/);
  });
});

describe("rows and pages", () => {
  test("a highlighted row carries the label, the person, how long ago, the post link and a removal link", () => {
    const row = String(jobRow(POSTED, TODAY));
    assert.match(row, /class="job-row  is-posted "/);
    assert.match(row, /<span class="job-by-label">Hiring manager posted<\/span> <span class="person-badge" style="--hue:\d+" aria-hidden="true">JD<\/span><span class="job-by-name">Jane Doe<\/span>, Director of Security <span class="job-when">2 days ago<\/span> <a class="job-post-link" href="https:\/\/www\.linkedin\.com\/posts\/janedoe-1" rel="noopener nofollow" target="_blank">Read their post<\/a> <a class="job-remove" href="mailto:watch@bettersecurity\.ai\?subject=Please%20remove%20my%20name/);
    assert.match(row, />Apply<\/a>/);
    assert.doesNotMatch(row, /Announced/);
  });
  test("an announced row says so and its button reads the post", () => {
    const row = String(jobRow(ANNOUNCED, TODAY));
    assert.match(row, /<p class="job-announced">Announced, not yet on Example Co's site\.<\/p>/);
    assert.match(row, /href="\/go\/j\/4" rel="noopener" target="_blank">Read the post<\/a>/);
  });
  test("after 21 days the role is an ordinary listing; rows without a role keep the plain byline", () => {
    const old = String(jobRow(OLD, TODAY));
    assert.doesNotMatch(old, /job-by/);
    assert.doesNotMatch(old, /Jane Doe/);
    const legacy = String(jobRow(LEGACY, TODAY));
    assert.match(legacy, /Posted by Pat Old<\/a>, Recruiter/);
    assert.match(legacy, /Ask to be removed/);
    assert.doesNotMatch(legacy, /job-by-label/);
  });
  test("the role page: label and post link for a highlighted role, no JobPosting and a read the post button when announced", async () => {
    const render = async (j) => { const res = await jobPage({ params: { city: "dallas", job: `${j.id}-x` }, request: new Request(`https://bettersecurity.ai/dallas/jobs/${j.id}-x`), env: env(fakeDb([{ match: /FROM jobs\b/, op: "first", reply: () => ({ ...j, topics: JSON.stringify(j.topics) }) }])) }); return { res, body: await res.text() }; };
    let { res, body } = await render(POSTED);
    assert.equal(res.status, 301); // the slug is normalized first
    ({ res, body } = await (async () => { const r = await jobPage({ params: { city: "dallas", job: "1-senior-security-engineer-at-example-co" }, request: new Request("https://bettersecurity.ai/dallas/jobs/1-senior-security-engineer-at-example-co"), env: env(fakeDb([{ match: /FROM jobs\b/, op: "first", reply: () => ({ ...POSTED, topics: '["grc"]' }) }])) }); return { res: r, body: await r.text() }; })());
    assert.equal(res.status, 200);
    assert.match(body, /<dt>Who posted<\/dt><dd><span class="job-by-label">Hiring manager posted<\/span><br><span class="person-badge" style="--hue:\d+" aria-hidden="true">JD<\/span>Jane Doe, Director of Security<br><small>(yesterday|2 days ago) · <a href="https:\/\/www\.linkedin\.com\/posts\/janedoe-1"[^>]*>Read their post<\/a> · <a class="job-remove"/); // the page counts days in Dallas time
    assert.match(body, /"@type":"JobPosting"/);
    assert.match(body, />Apply on the employer's site<\/a>/);
    assert.match(body, /read their post, apply through the official link once it exists, then send a brief note that mentions their post/);
    const a = await jobPage({ params: { city: "dallas", job: "4-cloud-security-architect-at-example-co" }, request: new Request("https://bettersecurity.ai/dallas/jobs/4-cloud-security-architect-at-example-co"), env: env(fakeDb([{ match: /FROM jobs\b/, op: "first", reply: () => ({ ...ANNOUNCED, topics: '["grc"]' }) }])) });
    const ab = await a.text();
    assert.equal(a.status, 200);
    assert.doesNotMatch(ab, /JobPosting/);
    assert.doesNotMatch(ab, /application\/ld\+json/);
    assert.match(ab, /Announced, not yet on Example Co's site\./);
    assert.match(ab, /href="https:\/\/www\.linkedin\.com\/posts\/janedoe-4" rel="noopener nofollow" target="_blank" ping="\/go\/j\/4">Read the post<\/a>/);
    assert.equal(String(jobJsonLd(ANNOUNCED, CITIES.dallas, "https://bettersecurity.ai", TODAY)), "");
  });
  test("the city page From the people hiring lists highlighted roles newest first with the approach note", async () => {
    const res = await cityPosted({ params: { city: "dallas" }, env: env(rowsDb([POSTED, LEADER, ANNOUNCED])), waitUntil: () => {} });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<h1>From the people hiring in Dallas<\/h1>/);
    assert.match(body, /3 roles posted about in the last 21 days, newest post first\./);
    assert.ok(body.indexOf("GRC Analyst") < body.indexOf("Senior Security Engineer"), "newest post first");
    assert.match(body, /<h2>How to approach<\/h2>/);
    assert.match(body, /Read their post first\./);
    assert.match(body, /Apply through the official link once it exists\./);
    assert.match(body, /send a brief note that mentions their post/);
    assert.match(body, /<link rel="canonical" href="https:\/\/bettersecurity\.ai\/dallas\/jobs\/posted">/);
    assert.doesNotMatch(body, /name="robots" content="noindex"/);
    assert.ok((body.match(/Ask to be removed/g) || []).length >= 3, "every person shown has a removal link");
    const empty = await cityPosted({ params: { city: "dallas" }, env: env(rowsDb([])), waitUntil: () => {} });
    const eb = await empty.text();
    assert.match(eb, /Nobody has posted about an open role in Dallas in the last 21 days\./);
    assert.match(eb, /name="robots" content="noindex"/);
  });
  test("the nationwide page groups by city and the filter rejects staffing and old posts in SQL and in code", async () => {
    const db = rowsDb([POSTED, STAFFING, OLD]);
    const res = await allPosted({ env: env(db) });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<h1>From the people hiring<\/h1>/);
    assert.match(body, /<h2 class="posted-city">Dallas<\/h2>/);
    assert.match(body, /1 role posted about in the last 21 days/);
    assert.doesNotMatch(body, /Security Analyst<\/a>/); // staffing, filtered in code too
    assert.doesNotMatch(body, /Privacy Analyst/);
    const jobs = await postedJobs(db, null);
    assert.deepEqual(jobs.map((j) => j.id), [1]);
  });
  test("the sitemap lists the posted pages only while someone is on them", async () => {
    const live = { ...POSTED, employer_name: null, updated_at: "2026-10-23T10:00:00.000Z" };
    const out = async (rows) => (await (await sitemap({ env: env(fakeDb([{ match: /FROM jobs j/, op: "all", reply: () => ({ results: rows }) }])) })).text());
    const withPosted = await out([live]);
    assert.match(withPosted, /<loc>https:\/\/bettersecurity\.ai\/jobs\/posted<\/loc>/);
    assert.match(withPosted, /<loc>https:\/\/bettersecurity\.ai\/dallas\/jobs\/posted<\/loc>/);
    const without = await out([{ ...live, posted_by_date: "2026-01-01" }]);
    assert.doesNotMatch(without, /jobs\/posted/);
  });
});

describe("Sunday email", () => {
  const styles = null;
  test("From the people hiring comes before Hiring this week, holds at most three, and those roles are not repeated", () => {
    const html = jobsBlock("https://bettersecurity.ai", CITIES.dallas, [POSTED, LEADER, RECRUITER, ANNOUNCED, PLAIN, LEGACY], "practitioner", 12);
    assert.ok(html.indexOf("From the people hiring") < html.indexOf("Hiring this week"));
    assert.equal((html.match(/Read their post/g) || []).length, 3);
    assert.match(html, /HIRING MANAGER POSTED|Hiring manager posted/);
    assert.match(html, /Security leader posted/);
    assert.match(html, /Recruiter posted/);
    assert.equal((html.match(/Cloud Security Architect/g) || []).length, 1, "the fourth highlighted role falls through to the ordinary picks, once");
    assert.ok(html.indexOf("Cloud Security Architect") > html.indexOf("Hiring this week"));
    assert.match(html, /href="https:\/\/bettersecurity\.ai\/dallas\/jobs\/posted"/);
    assert.ok(!/[!]|—|–/.test(html.replace(/<[^>]+>/g, "")));
  });
  test("with nobody posting, only the ordinary block renders", () => {
    const html = jobsBlock("https://bettersecurity.ai", CITIES.dallas, [PLAIN, OLD], null, 12);
    assert.doesNotMatch(html, /From the people hiring/);
    assert.match(html, /Hiring this week/);
  });
});

describe("admin form rules", () => {
  const good = { posted_by_url: "https://www.linkedin.com/posts/janedoe-9", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_date: "2026-10-22", employer: "Example Co", title: "Security Engineer", city: "dallas", url: "https://careers.example.com/jobs/9" };
  test("a staffing agency is refused with a short message", () => {
    const { error } = parsePostedForm({ ...good, posted_by_role: "staffing" }, TODAY);
    assert.match(error, /^Staffing agency posts stay out/);
    assert.ok(!/[-!]/.test(error));
  });
  test("the person, their role, the post link, the employer and the title are required", () => {
    assert.match(parsePostedForm({ ...good, posted_by_role: "" }, TODAY).error, /who the person is/);
    assert.match(parsePostedForm({ ...good, posted_by_url: "linkedin.com/x" }, TODAY).error, /post URL/);
    assert.match(parsePostedForm({ ...good, posted_by_name: "" }, TODAY).error, /name and title/);
    assert.match(parsePostedForm({ ...good, employer: "" }, TODAY).error, /Employer and job title/);
    assert.match(parsePostedForm({ ...good, posted_by_date: "2027-01-01" }, TODAY).error, /future/);
    assert.match(parsePostedForm({ ...good, url: "https://www.indeed.com/viewjob?jk=1" }, TODAY).error, /not a job board/);
  });
  test("with the employer's posting the row links to it; without one it is announced and links to the post for 21 days", () => {
    const a = parsePostedForm(good, TODAY).row;
    assert.equal(a.announced, 0);
    assert.equal(a.url, "https://careers.example.com/jobs/9");
    assert.equal(a.expires_at, null);
    assert.equal(a.posted_by_kind, "employer");
    const b = parsePostedForm({ ...good, url: "" }, TODAY).row;
    assert.equal(b.announced, 1);
    assert.equal(b.url, "https://www.linkedin.com/posts/janedoe-9");
    assert.equal(b.expires_at, "2026-11-12");
    const c = parsePostedForm({ ...good, posted_by_date: "" }, TODAY).row;
    assert.equal(c.posted_by_date, TODAY);
  });
  test("the edit form: a blank employer URL with a post keeps the role announced, and adding the URL ends it", () => {
    const common = { title: "Security Engineer", employer: "Example Co", posted_by_url: "https://www.linkedin.com/posts/x-1", posted_by_name: "Jane Doe", posted_by_role: "leader", city: "dallas", status: "published" };
    const announced = parseJobForm({ ...common, url: "" }).row;
    assert.equal(announced.announced, 1);
    assert.equal(announced.url, "https://www.linkedin.com/posts/x-1");
    assert.equal(announced.posted_by_role, "leader");
    const live = parseJobForm({ ...common, url: "https://careers.example.com/jobs/1" }).row;
    assert.equal(live.announced, 0);
    assert.equal(live.url, "https://careers.example.com/jobs/1");
    assert.match(parseJobForm({ ...common, url: "", posted_by_url: "" }).error, /leave it blank and give the link to the post/);
    assert.match(parseJobForm({ ...common, url: "https://www.linkedin.com/jobs/view/1" }).error, /not a job board/);
  });
  test("the form offers the three roles and the refused staffing option, and asks for every field", () => {
    const f = String(postedForm({}, []));
    for (const name of ["posted_by_url", "posted_by_name", "posted_by_title", "posted_by_role", "posted_by_date", "employer", "title", "city", "url"]) assert.match(f, new RegExp(`name="${name}"`), name);
    assert.match(f, /<option value="hiring_manager" >Hiring manager<\/option>/);
    assert.match(f, /<option value="recruiter" >In house recruiter<\/option>/);
    assert.match(f, /<option value="staffing" >Staffing agency recruiter<\/option>/);
  });
});

describe("admin entry", () => {
  const form = (o) => new Request("https://bettersecurity.ai/admin/jobs/posted", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
  const fields = { posted_by_url: "https://www.linkedin.com/posts/janedoe-9", posted_by_name: "Jane Doe", posted_by_title: "Director of Security", posted_by_role: "hiring_manager", posted_by_date: "2026-10-22", employer: "Example Co", title: "Security Engineer", city: "dallas" };
  test("a new announced role publishes at once with no hold and the post as its link", async () => {
    const db = fakeDb([{ match: /FROM organizations WHERE slug/, reply: () => ({ id: 3, trusted: 1 }) }]);
    const res = await addPosted({ request: form(fields), env: { DB: db }, data: { user: "t" } });
    assert.equal(res.status, 302);
    const ins = db.find(/INSERT INTO jobs/);
    assert.equal(ins.length, 1);
    const row = insertRow(ins[0]);
    assert.equal(row.status, "published");
    assert.equal(row.hold, 0);
    assert.match(ins[0].sql, /,0,NULL,\?,'manual'/, "no hold, no auto publish time");
    assert.match(row.published_at, /^\d{4}-\d{2}-\d{2}T/, "published now");
    assert.equal(row.announced, 1);
    assert.equal(row.url, "https://www.linkedin.com/posts/janedoe-9");
    assert.equal(row.expires_at, "2026-11-12");
    assert.equal(row.posted_by_role, "hiring_manager");
    assert.equal(row.posted_by_kind, "employer");
    assert.match(res.headers.get("location"), /live%20as%20announced/);
  });
  test("when the employer's posting is already listed the person is attached to it, and a waiting row goes live", async () => {
    const db = fakeDb([{ match: /SELECT id, status FROM jobs WHERE url=\?/, reply: () => ({ id: 77, status: "pending_review" }) }]);
    const res = await addPosted({ request: form({ ...fields, url: "https://careers.example.com/jobs/9" }), env: { DB: db }, data: { user: "t" } });
    assert.equal(db.find(/INSERT INTO jobs/).length, 0);
    const up = db.find(/UPDATE jobs SET posted_by_name/)[0];
    assert.match(up.sql, /announced=0/);
    assert.match(up.sql, /status='published', hold=0, auto_publish_at=NULL/);
    assert.equal(up.args[0], "Jane Doe");
    assert.equal(up.args.at(-1), 77);
    assert.match(res.headers.get("location"), /\/admin\/jobs\/77\?msg=.*attached/);
  });
  test("a staffing agency is refused and nothing is written", async () => {
    const db = fakeDb();
    const res = await addPosted({ request: form({ ...fields, posted_by_role: "staffing" }), env: { DB: db }, data: { user: "t" } });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Staffing agency posts stay out/);
    assert.equal(db.find(/INSERT INTO jobs|UPDATE jobs/).length, 0);
  });
  test("one post can name several roles: a second title from the same post is added, the same title again is not", async () => {
    // The fake database answers the post check only when the title matches the role already entered from this post.
    const db = fakeDb([{ match: /WHERE posted_by_url=\? AND lower\(title\)=lower\(\?\)/, reply: (args) => (String(args[1]).toLowerCase() === "security engineer" ? { id: 90 } : null) },
      { match: /FROM organizations WHERE slug/, reply: () => ({ id: 3, trusted: 1 }) }]);
    const again = await addPosted({ request: form(fields), env: { DB: db }, data: { user: "t" } });
    assert.match(again.headers.get("location"), /\/admin\/jobs\/90\?msg=/);
    assert.equal(db.find(/INSERT INTO jobs/).length, 0);
    const second = await addPosted({ request: form({ ...fields, title: "GRC Analyst" }), env: { DB: db }, data: { user: "t" } });
    assert.equal(second.status, 302);
    assert.equal(db.find(/INSERT INTO jobs/).length, 1);
    assert.equal(insertRow(db.find(/INSERT INTO jobs/)[0]).title, "GRC Analyst");
  });
});

describe("matching a board run to an announced role", () => {
  const src = { id: 7, kind: "greenhouse", employer_name: "Example Co", organization_id: 3, config: '{"board":"example"}', search_text: "security", location_terms: "Dallas, Plano", city: "dallas" };
  const board = (title) => recordingFetcher(() => ({ jobs: [{ id: 9001, title, absolute_url: "https://careers.example.com/jobs/9001", location: { name: "Plano, TX" }, updated_at: "2026-10-23T12:00:00Z", content: "<p>$150,000 - $180,000</p>" }] }));
  const dbWith = (announcedRows) => fakeDb([
    { match: /SELECT id, status FROM jobs WHERE/, reply: () => null },
    { match: /lower\(title\)=lower\(\?\)/, reply: () => null },
    { match: /WHERE announced=1 AND status='published' AND city=\?/, op: "all", reply: () => ({ results: announcedRows }) },
    { match: /SELECT id, source_key, url, title FROM jobs/, reply: () => ({ results: [] }) },
  ]);
  test("a close title at the same employer and city updates the announced row instead of adding one", async () => {
    const db = dbWith([{ id: 4, title: "Cloud Security Architect" }]);
    const run = await runJobSource(db, src, { fetcher: board("Cloud Security Architect, Payments"), now: new Date("2026-10-24T00:00:00Z") });
    assert.equal(run.added, 0);
    assert.equal(run.matched, 1);
    assert.equal(db.find(/INSERT INTO jobs/).length, 0);
    const up = db.find(/UPDATE jobs SET url=\?, announced=0, source='sweep'/)[0];
    assert.ok(up, "the announced row was updated");
    assert.equal(up.args[0], "https://careers.example.com/jobs/9001");
    assert.equal(up.args[1], 7);
    assert.equal(up.args[2], "9001");
    assert.equal(up.args.at(-1), 4);
    assert.match(up.sql, /expires_at=MAX\(COALESCE\(expires_at, ''\), date\('now', '\+30 days'\)\)/);
    assert.match(up.sql, /Matched to the employer posting from the Greenhouse board on 2026-10-24/);
  });
  test("a different title at the same employer is a new role as before", async () => {
    const db = dbWith([{ id: 4, title: "Cloud Security Architect" }]);
    const run = await runJobSource(db, src, { fetcher: board("Privacy Analyst"), now: new Date("2026-10-24T00:00:00Z") });
    assert.equal(run.added, 1);
    assert.equal(run.matched, undefined);
    assert.equal(db.find(/UPDATE jobs SET url=\?, announced=0/).length, 0);
  });
});
