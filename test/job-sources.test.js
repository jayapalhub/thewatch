// ATS adapters in functions/_lib/job-sources.js. Each adapter takes an injectable fetcher, so these tests hand it a
// fixture backed one and check the common role shape, the title filter, location handling and when paging stops.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isOurRole, inCity, parseTerms, inferTopics, inferSeniority, inferRemote,
  pullWorkday, pullGreenhouse, pullLever, pullAshby, pullEightfold, pullSmartRecruiters, pullRadancy, pullPhenom, pullIcims, pullSuccessFactors,
} from "../functions/_lib/job-sources.js";
import { fixtureJson, fixtureText, recordingFetcher } from "./helpers.js";

const ROLE_KEYS = ["key", "title", "url", "location", "posted_at", "salary_text", "remote"];
function assertRoleShape(r) {
  assert.deepEqual(Object.keys(r).sort(), [...ROLE_KEYS].sort());
  assert.equal(typeof r.key, "string");
  assert.ok(isOurRole(r.title), `title passed the filter: ${r.title}`);
  assert.match(r.url, /^https:\/\//);
  assert.equal(typeof r.location, "string");
  assert.ok(r.posted_at === null || /^\d{4}-\d{2}-\d{2}$/.test(r.posted_at), `posted_at ${r.posted_at}`);
  assert.ok(["onsite", "hybrid", "remote"].includes(r.remote));
}
const fixed = (file) => recordingFetcher(() => fixtureJson(`jobs/${file}.json`));

describe("isOurRole title filter", () => {
  const ours = ["Senior Security Engineer", "Cyber Threat Analyst", "GRC Analyst", "Privacy Counsel", "IT Audit Manager", "Information Security Officer",
    "Third-Party Risk Analyst", "SOC Analyst II", "Identity and Access Engineer", "Application Security Engineer", "DevSecOps Engineer", "CISO",
    "Risk Analyst (IT)", "Cryptography Engineer", "Applied Cryptographer", "Penetration Tester", "Detection Engineering Manager", "Compliance Analyst",
    "Information System Security Officer", "Information System Security Officer (ISSO)"];
  const notOurs = ["Security Guard", "Security Officer", "Security Officer, Night Shift", "Physical Security Manager", "Account Executive, Security", "Sales Engineer, Security",
    "Customer Success Manager, Security", "Security Intern", "Social Security Specialist", "Securities Analyst", "Trade Compliance Manager",
    "Marketing Manager, Cybersecurity", "Recruiter, Security", "Software Engineer", "Office Manager", "", null];
  for (const t of ours) test(`keeps ${t}`, () => assert.equal(isOurRole(t), true));
  for (const t of notOurs) test(`drops ${JSON.stringify(t)}`, () => assert.equal(isOurRole(t), false));
});

describe("location and inference helpers", () => {
  test("inCity matches any term, case insensitive, and nothing when terms are empty", () => {
    assert.equal(inCity("San Diego, CA", ["san diego"]), true);
    assert.equal(inCity("Remote, US; SAN DIEGO", ["La Jolla", "San Diego"]), true);
    assert.equal(inCity("Austin, TX", ["San Diego"]), false);
    assert.equal(inCity("", ["San Diego"]), false);
    assert.equal(inCity("San Diego", []), false);
  });

  test("inCity matches terms as whole words only", () => {
    assert.equal(inCity("Colorado Springs, CO", ["Spring"]), false);
    assert.equal(inCity("Spring, TX", ["Spring"]), true);
    assert.equal(inCity("Springfield, VA", ["Spring"]), false);
    assert.equal(inCity("San Diego-CA", ["San Diego"]), true); // punctuation is a word edge
    assert.equal(inCity("Fort Worth, TX", ["Worth"]), true);
    assert.equal(inCity("Ventura, CA", ["Vent"]), false);
  });

  test("inCity skips foreign locations that share a name with a US city", () => {
    assert.equal(inCity("Melbourne, Victoria, Australia", ["Melbourne"]), false);
    assert.equal(inCity("Melbourne, AU", ["Melbourne"]), false);
    assert.equal(inCity("Melbourne, FL", ["Melbourne"]), true);
    assert.equal(inCity("Novi Sad, RS", ["Novi"]), false);
    assert.equal(inCity("Novi Sad, Serbia", ["Novi"]), false);
    assert.equal(inCity("Novi, MI", ["Novi"]), true);
    assert.equal(inCity("London, England, United Kingdom", ["London"]), false);
  });

  test("inCity checks each listed location on its own", () => {
    // A US location listed beside a foreign one still counts, whatever the separator.
    assert.equal(inCity("Melbourne, Victoria, Australia; Melbourne, FL", ["Melbourne"]), true);
    assert.equal(inCity("Novi Sad, RS | Novi, MI", ["Novi"]), true);
    assert.equal(inCity("Melbourne, Victoria, Australia<br/>Melbourne, FL", ["Melbourne"]), true);
    assert.equal(inCity("Melbourne, Victoria, Australia\nMelbourne, FL", ["Melbourne"]), true);
    // The foreign marker only rules out its own location, not the whole list.
    assert.equal(inCity("San Diego, CA; Sydney, Australia", ["San Diego"]), true);
    assert.equal(inCity("Melbourne, Victoria, Australia; Sydney, Australia", ["Melbourne"]), false);
  });

  test("inCity escapes terms, so punctuation in a term is literal", () => {
    assert.equal(inCity("St. Louis, MO", ["St. Louis"]), true);
    assert.equal(inCity("Stx Louis, MO", ["St. Louis"]), false);
  });

  test("parseTerms splits the location_terms column", () => {
    assert.deepEqual(parseTerms(" San Diego, La Jolla ,,Carlsbad "), ["San Diego", "La Jolla", "Carlsbad"]);
    assert.deepEqual(parseTerms(null), []);
  });

  test("inferRemote", () => {
    assert.equal(inferRemote("San Diego, CA"), "onsite");
    assert.equal(inferRemote("Remote"), "remote");
    assert.equal(inferRemote("Hybrid - San Diego"), "hybrid");
    assert.equal(inferRemote("San Diego or Remote / US"), "hybrid");
    assert.equal(inferRemote(""), "onsite");
  });

  test("inferSeniority", () => {
    assert.equal(inferSeniority("Chief Information Security Officer"), "executive");
    assert.equal(inferSeniority("Director, Security Engineering"), "director");
    assert.equal(inferSeniority("Security Engineering Manager"), "manager");
    assert.equal(inferSeniority("Security Analyst I"), "early_career");
    assert.equal(inferSeniority("Staff Security Engineer"), "practitioner");
  });

  test("inferTopics caps at three and defaults to grc", () => {
    assert.deepEqual(inferTopics("Cloud Security Engineer"), ["cloud"]);
    assert.deepEqual(inferTopics("Privacy Program Manager"), ["privacy"]);
    assert.deepEqual(inferTopics("Security Engineer"), ["grc"]);
    assert.equal(inferTopics("Director, Cloud Identity and Threat Detection, AppSec").length, 3);
  });
});

describe("pullWorkday", () => {
  const wd = fixtureJson("jobs/workday.json");
  const cfg = { tenant: "examplecorp", host: "wd5", site: "External" };
  const route = (url, init, body) => {
    if (body) return wd.pages[body.offset / 20];
    const d = wd.details[url.split("/wday/cxs/examplecorp/External")[1]];
    if (d === undefined || typeof d === "string") throw new Error(d || "HTTP 404");
    return d;
  };

  test("pages until the total is reached and opens only matching, possibly local postings", async () => {
    const f = recordingFetcher(route);
    const out = await pullWorkday(cfg, "security", f, ["San Diego"]);
    const posts = f.calls.filter((c) => c.body);
    assert.deepEqual(posts.map((c) => c.body.offset), [0, 20]);
    assert.equal(posts[0].url, "https://examplecorp.wd5.myworkdayjobs.com/wday/cxs/examplecorp/External/jobs");
    assert.equal(posts[0].body.searchText, "security");
    const opened = f.calls.filter((c) => !c.body).map((c) => c.url.split("/job/")[1]);
    // Austin is skipped without a detail fetch; "3 Locations" is opened; non security titles are never opened.
    assert.deepEqual(opened, ["San-Diego-CA/Senior-Security-Engineer_R100", "San-Diego-CA/GRC-Manager_R102", "San-Diego-CA/Incident-Response-Lead_R103", "San-Diego-CA/Cyber-Threat-Analyst_R104"]);
    assert.deepEqual(out.map((r) => r.key), ["R100", "R102", "R103"]); // R104's detail fetch failed and is skipped
    out.forEach(assertRoleShape);
    assert.equal(out.partial, undefined);
  });

  test("reads pay, dates and every location from the detail record", async () => {
    const [a, b, c] = await pullWorkday(cfg, "security", recordingFetcher(route), ["San Diego"]);
    assert.equal(a.salary_text, "$140,000 - $180,000");
    assert.equal(a.posted_at, "2026-10-01");
    assert.equal(a.url, "https://examplecorp.wd5.myworkdayjobs.com/External/job/San-Diego-CA/Senior-Security-Engineer_R100");
    assert.equal(b.location, "Remote, US; San Diego, CA; Denver, CO");
    assert.equal(b.posted_at, null);
    assert.equal(b.remote, "hybrid");
    assert.equal(c.key, "R103"); // no jobReqId: the list's bullet field
    assert.equal(c.url, "https://examplecorp.wd5.myworkdayjobs.com/External/job/San-Diego-CA/Incident-Response-Lead_R103");
  });

  test("without location terms every matching posting is opened", async () => {
    const f = recordingFetcher(route);
    await pullWorkday(cfg, "security", f);
    assert.ok(f.calls.some((c) => /Security-Analyst_R101$/.test(c.url)));
  });

  test("stops after a short page even when the total says more", async () => {
    const f = recordingFetcher((url, init, body) => (body ? { total: 500, jobPostings: [{ title: "Office Manager", externalPath: "/job/x/y_R1" }] } : null));
    assert.deepEqual(await pullWorkday(cfg, "security", f, ["San Diego"]), []);
    assert.equal(f.calls.length, 1);
  });

  test("caps detail fetches at 25 and marks the result partial", async () => {
    const page = (offset) => ({ total: 100, jobPostings: Array.from({ length: 20 }, (_, i) => ({ title: "Security Engineer", externalPath: `/job/San-Diego-CA/Security-Engineer_R${offset + i}`, locationsText: "San Diego, CA" })) });
    const f = recordingFetcher((url, init, body) => (body ? page(body.offset) : { jobPostingInfo: { title: "Security Engineer", location: "San Diego, CA" } }));
    const out = await pullWorkday(cfg, "security", f, ["San Diego"]);
    assert.equal(out.length, 25);
    assert.equal(out.partial, true);
    assert.equal(f.calls.filter((c) => !c.body).length, 25);
    assert.equal(f.calls.filter((c) => c.body).length, 2);
  });
});

describe("pullGreenhouse", () => {
  test("filters titles and reads the common shape", async () => {
    const f = fixed("greenhouse");
    const out = await pullGreenhouse({ board: "examplecorp" }, "security", f);
    assert.equal(f.calls[0].url, "https://boards-api.greenhouse.io/v1/boards/examplecorp/jobs?content=true");
    assert.deepEqual(out.map((r) => r.key), ["1001", "1003", "1005"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].salary_text, "$150,000 - $190,000");
    assert.equal(out[0].posted_at, "2026-10-01");
    assert.equal(out[1].location, "Remote - US; New York"); // offices when there is no location
    assert.equal(out[1].posted_at, null);
    assert.equal(out[1].remote, "remote");
  });

  test("throws on an unexpected response", async () => {
    await assert.rejects(pullGreenhouse({ board: "x" }, "", recordingFetcher(() => ({}))), /unexpected response from Greenhouse/);
  });
});

describe("pullLever", () => {
  test("strips requisition codes and honors workplaceType", async () => {
    const f = fixed("lever");
    const out = await pullLever({ company: "examplecorp" }, "security", f);
    assert.equal(f.calls[0].url, "https://api.lever.co/v0/postings/examplecorp?mode=json");
    assert.deepEqual(out.map((r) => r.key), ["a1b2c3d4-0001", "a1b2c3d4-0003", "a1b2c3d4-0004"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].title, "Application Security Engineer");
    assert.equal(out[0].location, "San Diego, CA; Remote");
    assert.equal(out[0].remote, "hybrid");
    assert.equal(out[0].posted_at, "2026-09-30");
    assert.equal(out[0].salary_text, "$120,000 to $150,000");
    assert.equal(out[1].remote, "remote");
  });

  test("uses the EU API for EU boards and rejects non array answers", async () => {
    const f = recordingFetcher(() => []);
    await pullLever({ company: "examplecorp", region: "eu" }, "", f);
    assert.equal(f.calls[0].url, "https://api.eu.lever.co/v0/postings/examplecorp?mode=json");
    await assert.rejects(pullLever({ company: "x" }, "", recordingFetcher(() => ({ ok: false }))), /unexpected response from Lever/);
  });
});

describe("pullAshby", () => {
  test("joins secondary locations and prefers the compensation summary when it has a dollar figure", async () => {
    const f = fixed("ashby");
    const out = await pullAshby({ board: "examplecorp" }, "security", f);
    assert.equal(f.calls[0].url, "https://api.ashbyhq.com/posting-api/job-board/examplecorp?includeCompensation=true");
    assert.deepEqual(out.map((r) => r.key), ["ash-1", "ash-2", "ash-4"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].location, "San Diego; Irvine");
    assert.equal(out[0].remote, "hybrid"); // remote flag with an office location
    assert.equal(out[0].salary_text, "$110K – $140K");
    assert.equal(out[1].remote, "remote");
    assert.equal(out[1].salary_text, "$160,000 - $200,000"); // from the description
    assert.equal(out[2].salary_text, null); // "Competitive" is not a figure
  });

  test("throws on an unexpected response", async () => {
    await assert.rejects(pullAshby({ board: "x" }, "", recordingFetcher(() => null)), /unexpected response from Ashby/);
  });
});

describe("pullEightfold", () => {
  const ef = fixtureJson("jobs/eightfold.json");
  const route = (url) => ef.pages[Number(new URL(url).searchParams.get("start")) / 10] || { data: { count: 12, positions: [] } };

  test("pages ten at a time until the count is reached and passes the first term as the location", async () => {
    const f = recordingFetcher(route);
    const out = await pullEightfold({ host: "careers.example.test", company: "example.test" }, "security", f, ["San Diego", "La Jolla"]);
    assert.equal(f.calls.length, 2);
    const q = new URL(f.calls[0].url).searchParams;
    assert.equal(q.get("domain"), "example.test");
    assert.equal(q.get("location"), "San Diego");
    assert.equal(q.get("query"), "security");
    assert.deepEqual(out.map((r) => r.key), ["9001", "9003", "9011"]);
    out.forEach(assertRoleShape);
    assert.equal(out[1].remote, "hybrid");
    assert.equal(out[2].remote, "remote");
    assert.equal(out[2].location, "Remote, United States");
    assert.equal(out[2].url, "https://careers.example.test/careers/job/9011");
    assert.equal(out[2].posted_at, null);
  });

  test("stops on an empty page and throws on a malformed one", async () => {
    const f = recordingFetcher(() => ({ data: { count: 99, positions: [] } }));
    assert.deepEqual(await pullEightfold({ host: "h.test", company: "c" }, "", f), []);
    assert.equal(f.calls.length, 1);
    await assert.rejects(pullEightfold({ host: "h.test", company: "c" }, "", recordingFetcher(() => ({ data: {} }))), /unexpected response from Eightfold/);
  });
});

describe("pullSmartRecruiters", () => {
  test("builds posting URLs and reads the remote flag", async () => {
    const f = fixed("smartrecruiters");
    const out = await pullSmartRecruiters({ company: "examplecorp" }, "cyber", f);
    assert.match(f.calls[0].url, /^https:\/\/api\.smartrecruiters\.com\/v1\/companies\/examplecorp\/postings\?q=cyber&limit=100$/);
    assert.deepEqual(out.map((r) => r.key), ["744000001", "744000003"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].url, "https://jobs.smartrecruiters.com/examplecorp/744000001");
    assert.equal(out[0].location, "San Diego, CA, us");
    assert.equal(out[0].posted_at, "2026-10-05");
    assert.equal(out[1].remote, "remote");
  });

  test("throws on an unexpected response", async () => {
    await assert.rejects(pullSmartRecruiters({ company: "x" }, "", recordingFetcher(() => ({}))), /unexpected response from SmartRecruiters/);
  });
});

describe("pullRadancy", () => {
  const rd = fixtureJson("jobs/radancy.json");

  test("reads titles, locations and links from the results HTML and stops when a page adds nothing new", async () => {
    const f = recordingFetcher((url) => rd.pages[Math.min(Number(new URL(url).searchParams.get("CurrentPage")) - 1, 1)]);
    const out = await pullRadancy({ host: "jobs.example.test" }, "security", f);
    assert.equal(f.calls.length, 2);
    assert.equal(new URL(f.calls[1].url).searchParams.get("IsPagination"), "True");
    assert.deepEqual(out.map((r) => r.key), ["5001", "5003"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].title, "Security Analyst & Responder");
    assert.equal(out[0].location, "San Diego, California");
    assert.equal(out[0].url, "https://jobs.example.test/job/san-diego/security-analyst-amp-responder/1234/5001"); // query string dropped
  });

  test("reads the newer layout, where the job link sits inside the h2", async () => {
    const rd2 = fixtureJson("jobs/radancy-h2.json");
    const f = recordingFetcher((url) => rd2.pages[Math.min(Number(new URL(url).searchParams.get("CurrentPage")) - 1, 1)]);
    const out = await pullRadancy({ host: "jobs.example.test" }, "security", f);
    assert.equal(f.calls.length, 2); // page two only repeats 6001, so paging stops
    assert.deepEqual(out.map((r) => r.key), ["6001", "6003", "6004"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].title, "Senior Security Engineer & Architect"); // the link text is the title
    assert.equal(out[0].location, "San Diego, California"); // the span after the link, in the same list item
    assert.equal(out[0].url, "https://jobs.example.test/job/san-diego/senior-security-engineer-amp-architect/1234/6001");
    assert.equal(out[1].location, ""); // no span in its own item; the next item's location is not borrowed
    assert.equal(out[2].location, "Austin, Texas");
  });

  test("reads at most five pages", async () => {
    let n = 0;
    const f = recordingFetcher(() => ({ results: `<a href="/job/x/${++n}" data-job-id="${n}"><h2>Security Engineer</h2></a>` }));
    const out = await pullRadancy({ host: "jobs.example.test" }, "", f);
    assert.equal(f.calls.length, 5);
    assert.equal(out.length, 5);
  });

  test("throws when results is not an HTML string", async () => {
    await assert.rejects(pullRadancy({ host: "h.test" }, "", recordingFetcher(() => ({ results: [] }))), /unexpected response from Radancy/);
  });
});

describe("pullPhenom", () => {
  test("dedupes job ids, joins multiple locations and treats a remote flag with a location as hybrid", async () => {
    const f = fixed("phenom");
    const out = await pullPhenom({ host: "careers.example.test", path: "/us/en/", state: "California" }, "security", f);
    assert.equal(f.calls.length, 1); // fewer than 50 jobs on the first page
    assert.equal(f.calls[0].url, "https://careers.example.test/widgets");
    assert.deepEqual(f.calls[0].body.selected_fields, { state: ["California"] });
    assert.equal(f.calls[0].body.lang, "en_us");
    assert.deepEqual(out.map((r) => r.key), ["PH-1", "PH-2"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].url, "https://careers.example.test/us/en/job/PH-1");
    assert.equal(out[0].salary_text, "$95,000 - $120,000");
    assert.equal(out[0].posted_at, "2026-10-07");
    assert.equal(out[1].location, "San Diego, California, United States; Irvine, California, United States");
    assert.equal(out[1].remote, "hybrid");
  });

  test("pages by 50 until totalHits", async () => {
    const page = (from) => ({ refineSearch: { totalHits: 100, data: { jobs: Array.from({ length: 50 }, (_, i) => ({ jobId: `J${from + i}`, title: "Security Engineer", location: "San Diego" })) } } });
    const f = recordingFetcher((url, init, body) => page(body.from));
    const out = await pullPhenom({ host: "h.test" }, "", f);
    assert.deepEqual(f.calls.map((c) => c.body.from), [0, 50]);
    assert.equal(out.length, 100);
  });

  test("throws without a refineSearch block", async () => {
    await assert.rejects(pullPhenom({ host: "h.test" }, "", recordingFetcher(() => ({}))), /unexpected response from Phenom/);
  });
});

describe("pullIcims", () => {
  test("reads data rows, dedupes and uses the canonical URL without its query", async () => {
    const f = fixed("icims");
    const out = await pullIcims({ host: "careers.example.test" }, "security", f);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(out.map((r) => r.key), ["IC-100", "IC-101"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].url, "https://careers.example.test/careers-home/jobs/IC-100");
    assert.equal(out[0].salary_text, "$85,000 - $105,000");
    assert.equal(out[1].url, "https://careers.example.test/jobs/IC-101");
    assert.equal(out[1].location, "San Diego, CA");
  });

  test("reads a second page only after a full page of 100, and never a third", async () => {
    const page = (p) => ({ jobs: Array.from({ length: 100 }, (_, i) => ({ data: { req_id: `R${p}-${i}`, title: "Security Analyst", full_location: "San Diego" } })) });
    const f = recordingFetcher((url) => page(new URL(url).searchParams.get("page")));
    const out = await pullIcims({ host: "h.test" }, "", f);
    assert.equal(f.calls.length, 2);
    assert.equal(out.length, 200);
  });

  test("throws on an unexpected response", async () => {
    await assert.rejects(pullIcims({ host: "h.test" }, "", recordingFetcher(() => ({}))), /unexpected response from iCIMS/);
  });
});

describe("pullSuccessFactors", () => {
  test("JSON sites: pages until totalJobs, dedupes and parses MM/DD/YY dates", async () => {
    const sf = fixtureJson("jobs/successfactors.json");
    const f = recordingFetcher((url, init, body) => sf.pages[body.pageNumber]);
    const out = await pullSuccessFactors({ host: "careers.example.test" }, "security", f);
    assert.deepEqual(f.calls.map((c) => c.body.pageNumber), [0, 1]);
    assert.equal(f.calls[0].url, "https://careers.example.test/services/recruiting/v1/jobs");
    assert.deepEqual(out.map((r) => r.key), ["70001", "70003", "70004"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].url, "https://careers.example.test/job/Product-Security-Engineer/70001-en_US");
    assert.equal(out[0].location, "San Diego, CA, US");
    assert.equal(out[0].posted_at, "2026-10-05");
    assert.equal(out[1].location, "Irvine, CA, US; San Diego, CA, US");
    assert.equal(out[1].posted_at, "2026-01-02");
    assert.equal(out[2].posted_at, null);
  });

  test("classic sites: falls back to the HTML table when the JSON endpoint answers 404", async () => {
    const f = recordingFetcher((url, init) => { if (init.method === "POST") throw new Error("HTTP 404"); return fixtureText("jobs/successfactors-classic.html"); });
    const out = await pullSuccessFactors({ host: "careers.example.test", base: "/kus/" }, "security", f);
    assert.equal(f.calls.length, 2); // the JSON probe, then one HTML page with no pager
    assert.equal(f.calls[0].url, "https://careers.example.test/kus/services/recruiting/v1/jobs");
    assert.equal(f.calls[1].url, "https://careers.example.test/kus/search/?q=security&sortColumn=referencedate&sortDirection=desc&startrow=0");
    assert.equal(f.calls[1].init.text, true);
    assert.deepEqual(out.map((r) => r.key), ["1234567", "1234569"]);
    out.forEach(assertRoleShape);
    assert.equal(out[0].title, "Security Analyst & Engineer");
    assert.equal(out[0].url, "https://careers.example.test/kus/job/San-Diego-Security-Analyst-CA-92101/1234567/");
    assert.equal(out[0].location, "San Diego, CA, US");
    assert.equal(out[0].posted_at, "2026-09-25");
    assert.equal(out[1].posted_at, "2026-09-03");
  });

  test("classic sites: steps startrow by the rows that came back and stops when nothing new arrives", async () => {
    const row = (id) => `<tr class="data-row"><a href="/job/x/${id}/" class="jobTitle-link">Security Analyst ${id}</a><span class="jobLocation">San Diego</span></tr>`;
    const f = recordingFetcher((url, init) => {
      if (init.method === "POST") throw new Error("Unexpected token < in JSON");
      const start = Number(new URL(url).searchParams.get("startrow"));
      const ids = start < 20 ? Array.from({ length: 10 }, (_, i) => start + i + 1) : [1]; // third page repeats a known row
      return `<div class="pagination"><a href="?startrow=${start + 10}">next</a></div><table>${ids.map(row).join("")}</table>`;
    });
    const out = await pullSuccessFactors({ host: "h.test" }, "", f);
    assert.deepEqual(f.calls.slice(1).map((c) => new URL(c.url).searchParams.get("startrow")), ["0", "10", "20"]);
    assert.equal(out.length, 20);
  });

  test("a real server error from the JSON endpoint is not mistaken for a classic site", async () => {
    await assert.rejects(pullSuccessFactors({ host: "h.test" }, "", recordingFetcher(() => { throw new Error("HTTP 500"); })), /HTTP 500/);
  });

  test("a classic page with no job table is an error", async () => {
    const f = recordingFetcher((url, init) => { if (init.method === "POST") throw new Error("HTTP 403"); return "<html><body>Access denied</body></html>"; });
    await assert.rejects(pullSuccessFactors({ host: "h.test" }, "", f), /no job table/);
  });
});
