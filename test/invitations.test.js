// The invitation request: the form, the validation, the stored row, the two emails and the admin list with its CSV.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as invitePage } from "../functions/invite.js";
import { onRequestPost as inviteApi, parseInvite, invitationConfirmationEmail } from "../functions/api/invite.js";
import { onRequestGet as adminList, onRequestPost as adminStatus } from "../functions/admin/invitations/index.js";
import { INVITE_AREAS, INVITE_SENIORITY } from "../functions/_lib/constants.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { rememberEnvironment } from "../functions/_lib/env.js";
import { fakeDb, insertRow } from "./helpers.js";

const good = { first_name: "Ada", last_name: "Lovelace", email: "Ada@Example.com", company: "Example Co", job_title: "Director of Security", seniority: "director", areas: ["identity", "cloud", "nope"], linkedin_url: "https://www.linkedin.com/in/adalovelace/?utm=x", vendor: "", notes: "Keen on identity conversations.", source: "home" };
const post = (body, db = fakeDb()) => inviteApi({ request: new Request("https://bettersecurity.ai/api/invite", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body) }), env: { DB: db, SITE_URL: "https://bettersecurity.ai", ENVIRONMENT: "production" }, waitUntil: null });

describe("the form", () => {
  test("asks for every required field, every area, the vendor flag and the optional note, and names no event", async () => {
    const body = await (await invitePage({ request: new Request("https://bettersecurity.ai/invite") })).text();
    for (const name of ["first_name", "last_name", "email", "company", "job_title", "seniority", "linkedin_url", "notes", "vendor"]) assert.match(body, new RegExp(`name="${name}"`), name);
    for (const [k, v] of Object.entries(INVITE_AREAS)) assert.match(body, new RegExp(`value="${k}"> ${v.replace(/[()]/g, "\\$&")}`), v);
    for (const v of Object.values(INVITE_SENIORITY)) assert.match(body, new RegExp(`>${v}<`), v);
    assert.match(body, /Request an invitation to small, invite only experiences for San Diego security and IT practitioners, starting in 2027\./);
    assert.match(body, /never shared with sponsors/);
    assert.doesNotMatch(body, /Padel|ISACA|dinner|GRC and audit/);
    assert.match(body, /action="\/api\/invite" data-ajax/);
  });
  test("the page is never cached and sits in the private list", async () => {
    const env = { ENVIRONMENT: "production", DB: fakeDb(), SITE_URL: "https://bettersecurity.ai" };
    rememberEnvironment(env);
    const res = await middleware({ request: new Request("https://bettersecurity.ai/invite", { headers: { accept: "text/html" } }), env, params: {}, waitUntil: () => {}, next: () => invitePage({ request: new Request("https://bettersecurity.ai/invite") }) });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

describe("validation", () => {
  test("a complete request parses: email lowercased, unknown areas dropped, the LinkedIn address trimmed of tracking and slash", () => {
    const { row, error } = parseInvite(good);
    assert.equal(error, undefined);
    assert.equal(row.email, "ada@example.com");
    assert.deepEqual(row.areas, ["identity", "cloud"]);
    assert.equal(row.linkedin_url, "https://www.linkedin.com/in/adalovelace");
    assert.equal(row.vendor, 0);
  });
  test("each required field is enforced with a short message", () => {
    assert.match(parseInvite({ ...good, company: "" }).error, /name, company and job title/);
    assert.match(parseInvite({ ...good, email: "ada at example" }).error, /valid work email/);
    assert.match(parseInvite({ ...good, seniority: "boss" }).error, /seniority/);
    assert.match(parseInvite({ ...good, areas: ["nope"] }).error, /at least one area/);
    assert.match(parseInvite({ ...good, linkedin_url: "https://example.com/me" }).error, /LinkedIn profile/);
    assert.equal(parseInvite({ ...good, vendor: "1" }).row.vendor, 1);
  });
});

describe("the endpoint", () => {
  test("stores a new row with source and a hashed IP, confirms to the requester and tells Jerome, and does not touch subscribers", async () => {
    const db = fakeDb();
    const res = await post(good, db);
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.success, true);
    assert.match(j.message, /confirmation is on its way/);
    const ins = db.find(/INSERT INTO invitation_requests/);
    assert.equal(ins.length, 1);
    const row = insertRow(ins[0]);
    assert.equal(row.email, "ada@example.com");
    assert.equal(row.seniority, "director");
    assert.equal(row.areas, JSON.stringify(["identity", "cloud"]));
    assert.equal(row.source, "home");
    assert.equal(row.status, "new");
    assert.equal(typeof row.ip_hash, "string");
    assert.equal(db.find(/subscribers/).length, 0);
  });
  test("the same email asking again refreshes the row instead of adding one", async () => {
    const db = fakeDb([{ match: /SELECT id, status FROM invitation_requests WHERE email=\?/, op: "first", reply: () => ({ id: 7, status: "new" }) }]);
    await post(good, db);
    assert.equal(db.find(/INSERT INTO invitation_requests/).length, 0);
    const up = db.find(/UPDATE invitation_requests SET first_name/);
    assert.equal(up.length, 1);
    assert.equal(up[0].args.at(-1), 7);
  });
  test("the honeypot answers success and writes nothing; a bad row answers 400", async () => {
    const db = fakeDb();
    assert.equal((await (await post({ ...good, website_hp: "x" }, db)).json()).success, true);
    assert.equal(db.find(/invitation_requests/).length, 0);
    assert.equal((await post({ ...good, email: "" }, db)).status, 400);
  });
  test("the confirmation email is short, names what happens next and nothing specific", () => {
    const html = invitationConfirmationEmail("Ada");
    assert.match(html, /Hi Ada,/);
    assert.match(html, /Your request is in\./);
    assert.match(html, /When there is a fit, you will hear from me directly/);
    assert.match(html, /Thank you,<br>Jerome Jayapal/);
    assert.doesNotMatch(html, /Padel|ISACA|dinner|2027|—|…|!/);
  });
});

describe("the admin list", () => {
  const rows = [
    { id: 1, created_at: "2026-10-25 20:00:00", status: "new", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", company: "Example Co", job_title: "Director of Security", seniority: "director", areas: '["identity","cloud"]', vendor: 0, linkedin_url: "https://www.linkedin.com/in/adalovelace", notes: "Keen on identity, \"the hard part\"", source: "home", confirmation_sent_at: "2026-10-25 20:00:02" },
    { id: 2, created_at: "2026-10-25 21:00:00", status: "declined", first_name: "Sam", last_name: "Seller", email: "sam@vendor.example", company: "Vendor Inc", job_title: "Account Executive", seniority: "ic", areas: '["secops"]', vendor: 1, linkedin_url: "https://www.linkedin.com/in/samseller", notes: null, source: "invite_page", confirmation_sent_at: null },
  ];
  const db = () => fakeDb([{ match: /SELECT \* FROM invitation_requests/, op: "all", reply: (args, sql) => ({ results: /vendor=\?/.test(sql) ? rows.filter((r) => r.vendor === args[args.length - 1]) : rows }) }]);
  const get = (qs = "") => adminList({ request: new Request("https://bettersecurity.ai/admin/invitations" + qs), env: { DB: db() }, data: { user: { email: "j@x" } } });
  test("lists every request with the vendor flag, the areas by name and a status control", async () => {
    const body = await (await get()).text();
    assert.match(body, /Ada Lovelace/);
    assert.match(body, /Identity and access, Cloud security/);
    assert.match(body, /Sam Seller.*Vendor/s);
    assert.match(body, /no confirmation/);
    assert.match(body, /<select name="status"/);
  });
  test("exports the filtered list as CSV with readable labels and quoted notes", async () => {
    const res = await get("?vendor=0&format=csv");
    assert.match(res.headers.get("content-type"), /text\/csv/);
    const csv = await res.text();
    const lines = csv.split("\n");
    assert.equal(lines[0], "id,created_at,status,first_name,last_name,email,company,job_title,seniority,areas,vendor,linkedin_url,notes,source,confirmation_sent_at,reviewer_notes");
    assert.equal(lines.length, 2, "the vendor filter left one row");
    assert.match(lines[1], /Director,Identity and access; Cloud security,no,https:\/\/www\.linkedin\.com\/in\/adalovelace,"Keen on identity, ""the hard part""",home/);
  });
  test("a status change writes the status and nothing else", async () => {
    const d = db();
    const res = await adminStatus({ request: new Request("https://bettersecurity.ai/admin/invitations", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=2&status=invited" }), env: { DB: d } });
    assert.equal(res.status, 303);
    const up = d.find(/UPDATE invitation_requests SET status/);
    assert.deepEqual(up[0].args, ["invited", 2]);
    const bad = fakeDb();
    await adminStatus({ request: new Request("https://bettersecurity.ai/admin/invitations", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=2&status=spam" }), env: { DB: bad } });
    assert.equal(bad.find(/UPDATE/).length, 0);
  });
});
