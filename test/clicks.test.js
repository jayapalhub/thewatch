// Trustworthy click counts: which requests are filtered, how the trap link marks a scanner, and the one per listing per
// person per day rule. Everything runs against the fake database; every request is still redirected.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, insertRow } from "./helpers.js";
import { classifyRequest, recordClick, recordTrap, trapLink, ipHash, BOT_UA } from "../functions/_lib/clicks.js";
import { onRequestGet as goEvent } from "../functions/go/[id].js";
import { onRequestGet as goJob, onRequestPost as pingJob } from "../functions/go/j/[id].js";
import { onRequestGet as goTrap } from "../functions/go/trap.js";
import { renderIssueHtml } from "../functions/_lib/newsletter.js";
import { CITIES } from "../functions/_lib/constants.js";

CITIES.dallas = CITIES.dallas || { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "", empty: "", newsletter: "sunday", sort: 110 };
const HUMAN_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const req = (url, { method = "GET", ua = HUMAN_UA, ip = "203.0.113.7", headers = {} } = {}) => new Request(url, { method, headers: { "user-agent": ua, "cf-connecting-ip": ip, ...headers } });
const env = { SITE_URL: "https://bettersecurity.ai", CLICK_SALT: "test-salt" };
const inserts = (db) => db.find(/INSERT INTO link_clicks/).map(insertRow);

describe("classifyRequest", () => {
  test("a person on a phone or a desktop browser is not filtered", () => {
    assert.equal(classifyRequest(req("https://x/go/1")), null);
    assert.equal(classifyRequest(req("https://x/go/1", { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" })), null);
  });
  test("HEAD requests and prefetches are filtered", () => {
    assert.equal(classifyRequest(req("https://x/go/1", { method: "HEAD" })), "head");
    assert.equal(classifyRequest(req("https://x/go/1", { headers: { Purpose: "prefetch" } })), "prefetch");
    assert.equal(classifyRequest(req("https://x/go/1", { headers: { "Sec-Purpose": "prefetch;prerender" } })), "prefetch");
    assert.equal(classifyRequest(req("https://x/go/1", { headers: { "X-Moz": "prefetch" } })), "prefetch");
  });
  test("link scanners, preview bots and script clients are filtered", () => {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246 Microsoft Office SafeLinks",
      "Mozilla/5.0 (compatible; Proofpoint URL Defense)", "Mozilla/5.0 Mimecast Link Checker", "Barracuda Link Protection",
      "Mozilla/5.0 (Windows NT 10.0) GoogleImageProxy", "Mozilla/5.0 (compatible; Google-Safety; +http://www.google.com/bot.html)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Twitterbot/1.0", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "python-requests/2.32.0", "curl/8.4.0", "Go-http-client/2.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    ];
    for (const ua of agents) assert.equal(classifyRequest(req("https://x/go/1", { ua })), "agent", ua);
    assert.ok(BOT_UA.test("Microsoft Office SafeLinks"));
  });
});

describe("recordClick", () => {
  const EVENT = { listing: "event:12", target: "register", targetUrl: "https://example.test/register", eventId: 12, issueId: 9, city: "dallas" };
  test("a person's first click on a listing counts and is stored with a salted address hash, never the address", async () => {
    const db = fakeDb();
    const r = await recordClick(db, env, req("https://bettersecurity.ai/go/12?t=register&i=9"), EVENT);
    assert.deepEqual(r, { counted: true, reason: null });
    const [row] = inserts(db);
    assert.equal(row.is_bot, 0); assert.equal(row.is_dup, 0); assert.equal(row.listing, "event:12"); assert.equal(row.city, "dallas"); assert.equal(row.event_id, 12); assert.equal(row.issue_id, 9);
    assert.match(row.ip_hash, /^[0-9a-f]{16}$/);
    assert.equal(await ipHash(req("https://x", { ip: "203.0.113.7" }), env), row.ip_hash);
    assert.notEqual(await ipHash(req("https://x", { ip: "203.0.113.7" }), { CLICK_SALT: "other" }), row.ip_hash, "the salt changes the hash");
    assert.ok(!JSON.stringify(db.calls).includes("203.0.113.7"), "the raw address is nowhere in what was written");
  });
  test("a filtered request is stored with the reason and does not count", async () => {
    const db = fakeDb();
    const r = await recordClick(db, env, req("https://x/go/12", { ua: "Slackbot-LinkExpanding 1.0" }), EVENT);
    assert.deepEqual(r, { counted: false, reason: "agent" });
    const [row] = inserts(db);
    assert.equal(row.is_bot, 1); assert.equal(row.bot_reason, "agent");
    assert.equal(db.find(/SELECT id FROM link_clicks WHERE listing/).length, 0, "no duplicate check for a bot");
  });
  test("a click within two seconds of the send is filtered as fresh", async () => {
    const now = new Date(Date.now() - 1000).toISOString().replace("T", " ").slice(0, 19);
    const db = fakeDb([{ match: /SELECT dispatched_at FROM issues/, reply: () => ({ dispatched_at: now }) }]);
    assert.deepEqual(await recordClick(db, env, req("https://x/go/12?i=9"), EVENT), { counted: false, reason: "fresh" });
    const old = fakeDb([{ match: /SELECT dispatched_at FROM issues/, reply: () => ({ dispatched_at: "2026-10-20 15:00:00" }) }]);
    assert.equal((await recordClick(old, env, req("https://x/go/12?i=9"), EVENT)).counted, true);
  });
  test("a client that opened the trap link in the issue is filtered on its other clicks", async () => {
    const db = fakeDb([{ match: /target='trap' AND ua_hash=\? AND ip_hash=\?/, reply: () => ({ id: 5 }) }]);
    assert.deepEqual(await recordClick(db, env, req("https://x/go/12?i=9"), EVENT), { counted: false, reason: "trap" });
  });
  test("one click per listing per subscriber per day; a second one is a duplicate", async () => {
    const db = fakeDb([
      { match: /FROM subscribers WHERE click_token/, reply: () => ({ id: 44 }) },
      { match: /SELECT id FROM link_clicks WHERE listing=\? AND is_bot=0 AND is_dup=0 AND subscriber_id=\?/, reply: (args) => (args[1] === 44 ? { id: 1 } : null) },
    ]);
    const r = await recordClick(db, env, req("https://x/go/12?i=9&s=abc123"), EVENT);
    assert.deepEqual(r, { counted: false, reason: "duplicate" });
    const [row] = inserts(db);
    assert.equal(row.is_dup, 1); assert.equal(row.is_bot, 0); assert.equal(row.subscriber_id, 44);
  });
  test("with no subscriber, one click per listing per address hash per day", async () => {
    const seen = [];
    const db = fakeDb([{ match: /subscriber_id IS NULL AND ip_hash=\?/, reply: (args) => { seen.push(args[1]); return seen.filter((s) => s === args[1]).length > 1 && args[0] === "event:12" ? { id: 1 } : null; } }]);
    assert.equal((await recordClick(db, env, req("https://x/go/12"), EVENT)).counted, true);
    assert.equal((await recordClick(db, env, req("https://x/go/12"), EVENT)).reason, "duplicate");
    assert.equal((await recordClick(db, env, req("https://x/go/12"), { ...EVENT, listing: "event:13" })).counted, true, "a different listing counts");
    assert.equal(seen[0], seen[1]);
  });
});

describe("the trap link", () => {
  test("is in every rendered issue and invisible", () => {
    const html = renderIssueHtml({ id: 9, city: "sandiego", week_start: "2026-10-26", week_end: "2026-11-01", issue_number: 1 }, { events: [], soon: [], bs: [], featured: [], virt: [], sponsor: null, jobs: [] }, "https://bettersecurity.ai", CITIES.sandiego);
    assert.match(html, /<a href="https:\/\/bettersecurity\.ai\/go\/trap\?i=9" style="display:none!important;[^"]*" aria-hidden="true" tabindex="-1"><\/a>/);
    assert.equal(trapLink("https://x", 3), '<a href="https://x/go/trap?i=3" style="display:none!important;visibility:hidden;opacity:0;font-size:0;line-height:0;max-height:0;overflow:hidden" aria-hidden="true" tabindex="-1"></a>');
  });
  test("a request to it is stored as a bot, flags the client's other clicks in the issue, and still redirects", async () => {
    const db = fakeDb();
    const res = await goTrap({ request: req("https://bettersecurity.ai/go/trap?i=9"), env: { ...env, DB: db } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://bettersecurity.ai/");
    const [row] = inserts(db);
    assert.equal(row.target, "trap"); assert.equal(row.is_bot, 1); assert.equal(row.bot_reason, "trap"); assert.equal(row.issue_id, 9);
    const flag = db.find(/UPDATE link_clicks SET is_bot=1, bot_reason='trap' WHERE issue_id=\? AND ua_hash=\? AND ip_hash=\? AND is_bot=0/)[0];
    assert.ok(flag); assert.equal(flag.args[0], 9); assert.equal(flag.args[2], row.ip_hash);
  });
});

describe("the /go handlers", () => {
  const EVT = { id: 12, city: "dallas", slug: "x", registration_url: "https://example.test/register", title: "T" };
  test("an event link redirects a scanner like anyone else, and stores the request as a bot", async () => {
    const db = fakeDb([{ match: /FROM events/, op: "first", reply: () => ({ ...EVT }) }]);
    const res = await goEvent({ params: { id: "12" }, request: req("https://bettersecurity.ai/go/12?t=register&i=9", { ua: "Mozilla/5.0 Mimecast" }), env: { ...env, DB: db } });
    assert.equal(res.status, 302); assert.equal(res.headers.get("location"), "https://example.test/register");
    const [row] = inserts(db); assert.equal(row.is_bot, 1); assert.equal(row.listing, "event:12"); assert.equal(row.city, "dallas");
  });
  test("a HEAD request on an event link is stored as a bot and redirected", async () => {
    const db = fakeDb([{ match: /FROM events/, op: "first", reply: () => ({ ...EVT }) }]);
    const res = await goEvent({ params: { id: "12" }, request: req("https://bettersecurity.ai/go/12", { method: "HEAD" }), env: { ...env, DB: db } });
    assert.equal(res.status, 302);
    assert.equal(inserts(db)[0].bot_reason, "head");
  });
  test("a job's apply count moves only for a counted click", async () => {
    const job = { match: /FROM jobs WHERE id/, op: "first", reply: () => ({ id: 5, url: "https://careers.example.test/5", city: "dallas", status: "published" }) };
    const human = fakeDb([job]);
    await goJob({ params: { id: "5" }, request: req("https://bettersecurity.ai/go/j/5"), env: { ...env, DB: human } });
    assert.equal(human.find(/apply_clicks = apply_clicks \+ 1/).length, 1);
    assert.equal(inserts(human)[0].listing, "job:5"); assert.equal(inserts(human)[0].job_id, 5);
    const bot = fakeDb([job]);
    await goJob({ params: { id: "5" }, request: req("https://bettersecurity.ai/go/j/5", { ua: "python-requests/2.32.0" }), env: { ...env, DB: bot } });
    assert.equal(bot.find(/apply_clicks/).length, 0);
    const again = fakeDb([job, { match: /subscriber_id IS NULL AND ip_hash=\?/, reply: () => ({ id: 1 }) }]);
    await pingJob({ params: { id: "5" }, request: req("https://bettersecurity.ai/go/j/5", { method: "POST" }), env: { ...env, DB: again } });
    assert.equal(again.find(/apply_clicks/).length, 0, "a repeat on the same day does not add to the count");
    assert.equal(inserts(again)[0].is_dup, 1);
  });
});

describe("the admin clicks page", () => {
  test("counts people only, groups by city and type, lists the top listings and the filtered requests", async () => {
    const { onRequestGet } = await import("../functions/admin/clicks.js");
    const db = fakeDb([
      { match: /GROUP BY COALESCE\(city, ''\), target/, op: "all", reply: () => ({ results: [{ city: "dallas", target: "register", n: 7 }, { city: "dallas", target: "job", n: 3 }, { city: "", target: "page", n: 2 }] }) },
      { match: /GROUP BY c\.listing ORDER BY n DESC/, op: "all", reply: () => ({ results: [{ listing: "event:12", city: "dallas", target: "register", target_url: "https://example.test/r", n: 7, label: "ISSA October Meeting" }] }) },
      { match: /is_bot=1 GROUP BY/, op: "all", reply: () => ({ results: [{ reason: "agent", n: 40 }, { reason: "trap", n: 6 }] }) },
      { match: /is_bot=0 AND is_dup=1/, op: "all", reply: () => ({ results: [{ n: 4 }] }) },
      { match: /COUNT\(\*\) n FROM link_clicks WHERE clicked_at >= \? AND is_bot=0 AND is_dup=0$/, op: "all", reply: () => ({ results: [{ n: 12 }] }) },
    ]);
    const res = await onRequestGet({ env: { DB: db }, data: { user: "t" } });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal((body.match(/<h2>Last (7|30) days/g) || []).length, 2);
    assert.match(body, /<span class="a-num">12<\/span>clicks by people/);
    assert.match(body, /<span class="a-num">46<\/span>requests filtered as bots/);
    assert.match(body, /<span class="a-num">4<\/span>repeat clicks folded in/);
    assert.match(body, /<td>Dallas<\/td><td>7<\/td><td>3<\/td><td>0<\/td><td>0<\/td><td><strong>10<\/strong><\/td>/);
    assert.match(body, /\(before tracking\)/);
    assert.match(body, /ISSA October Meeting/);
    assert.match(body, /Opened the hidden trap link<\/td><td>6<\/td>/);
    for (const c of db.calls) if (/COUNT\(\*\)/.test(c.sql) && !/is_bot=1/.test(c.sql) && !/is_dup=1/.test(c.sql)) assert.match(c.sql, /is_bot=0 AND is_dup=0/, c.sql.slice(0, 80));
  });
});
