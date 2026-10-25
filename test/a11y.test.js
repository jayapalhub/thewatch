// Accessibility of the rendered HTML: heading order, landmarks, labels and alt text on the public pages, checked
// against a fake database so the structure is tested rather than the data. The browser side of the audit (contrast,
// tap targets, overflow) is run with Playwright against a preview deployment and is not repeated here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { onRequestGet as virtualPage } from "../functions/virtual/index.js";
import { onRequestGet as eventPage } from "../functions/[city]/events/[slug].js";
import { onRequestGet as subscribePage } from "../functions/subscribe.js";
import { onRequestGet as aboutPage } from "../functions/about.js";
import { onRequestGet as embedPage } from "../functions/embed/[city].js";

CITIES.dallas = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", description: "Every cybersecurity event in Dallas.", empty: "Nothing yet.", newsletter: "sunday", sort: 110 };

const EVENT = {
  id: 7, slug: "issa-north-texas-october", city: "dallas", title: "ISSA North Texas October Meeting", status: "published",
  start_at: "2099-10-28T18:00", end_at: "2099-10-28T20:00", start_utc: "2099-10-28T23:00:00.000Z", end_utc: "2099-10-29T01:00:00.000Z",
  timezone: "America/Chicago", format: "in_person", venue_display: "Example Hall", venue_address_display: "1 Main St, Dallas, TX",
  cost_type: "free", cpe_eligible: 1, cpe_hours: 1, description_short: "Monthly chapter meeting.", org_slug: "issa-north-texas", org_display: "ISSA North Texas", org_name: "ISSA North Texas", org_type: "chapter",
  registration_url: "https://example.test/register", topics: '["grc"]',
};
const JOB = { id: 42, city: "dallas", employer: "Example Corp", employer_name: "Example Corp", title: "Security Engineer", url: "https://careers.example.test/42", location: "Dallas, TX", remote: "hybrid", seniority: "practitioner", topics: ["cloud"], salary_text: null, posted_at: "2099-01-01", expires_at: "2099-02-01", status: "published" };

const withEvents = () => fakeDb([
  { match: /FROM events e/, op: "all", reply: () => ({ results: [{ ...EVENT }, { ...EVENT, id: 8, slug: "second", title: "Second Meeting", start_at: "2099-10-29T18:00", start_utc: "2099-10-29T23:00:00.000Z" }] }) },
  { match: /FROM events/, op: "first", reply: () => ({ ...EVENT }) },
  { match: /FROM jobs j/, op: "all", reply: () => ({ results: [{ ...JOB }] }) },
]);
async function render(handler, path, params = {}) {
  const res = await handler({ request: new Request("https://bettersecurity.ai" + path, { headers: { accept: "text/html" } }), env: { DB: withEvents(), SITE_URL: "https://bettersecurity.ai" }, params, waitUntil: () => {} });
  assert.equal(res.status, 200, `${path} status`);
  return res.text();
}
const headings = (body) => [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: +m[1], text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
function assertHeadingOrder(body, label) {
  const hs = headings(body);
  assert.equal(hs.filter((h) => h.level === 1).length, 1, `${label}: one h1, found ${hs.filter((h) => h.level === 1).map((h) => h.text).join(" | ")}`);
  for (let i = 1; i < hs.length; i++) assert.ok(hs[i].level <= hs[i - 1].level + 1, `${label}: h${hs[i - 1].level} "${hs[i - 1].text}" is followed by h${hs[i].level} "${hs[i].text}"`);
}
function assertLabels(body, label) {
  // Every visible field has a label: wrapped in <label>, pointed at by label[for], or aria labeled. Honeypots are aria-hidden.
  const fields = [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].filter((m) => !/type="(hidden|submit|button)"/.test(m[2]) && !/aria-hidden="true"/.test(m[2]));
  for (const f of fields) {
    const attrs = f[2];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const before = body.slice(0, f.index);
    const wrapped = (before.match(/<label\b/g) || []).length > (before.match(/<\/label>/g) || []).length;
    const pointed = id && new RegExp(`<label[^>]*for="${id}"`).test(body);
    assert.ok(wrapped || pointed || /aria-label(ledby)?="/.test(attrs), `${label}: unlabeled field ${f[0].slice(0, 120)}`);
  }
}
const assertAlt = (body, label) => { for (const m of body.matchAll(/<img\b([^>]*)>/g)) assert.match(m[1], /\balt="/, `${label}: image without alt ${m[0].slice(0, 120)}`); };

const PAGES = [
  ["city calendar", cityPage, "/dallas", { city: "dallas" }],
  ["city month view", cityPage, "/dallas?view=month", { city: "dallas" }],
  ["virtual calendar", virtualPage, "/virtual", {}],
  ["event page", eventPage, "/dallas/events/issa-north-texas-october", { city: "dallas", slug: "issa-north-texas-october" }],
  ["subscribe", subscribePage, "/subscribe", {}],
  ["about", aboutPage, "/about", {}],
];

describe("headings, labels and alt text on the public pages", () => {
  for (const [label, handler, path, params] of PAGES) {
    test(label, async () => {
      const body = await render(handler, path, params);
      assertHeadingOrder(body, label);
      assertLabels(body, label);
      assertAlt(body, label);
      assert.ok(body.includes('<main id="main"'), `${label}: main landmark`);
      assert.match(body, /<header class="site-header">\s*<a class="skip" href="#main">Skip to content<\/a>/, `${label}: the skip link sits inside the banner`);
    });
  }

  test("event rows sit under a day heading and the footer columns are level two", async () => {
    const body = await render(cityPage, "/dallas", { city: "dallas" });
    const hs = headings(body);
    const first = hs.findIndex((h) => h.text === "ISSA North Texas October Meeting");
    assert.ok(first > 0);
    assert.equal(hs[first].level, 3);
    assert.equal(hs[first - 1].level, 2, "the day label before the first event is an h2");
    assert.match(body, /<h2 class="day-head">/);
    assert.ok(hs.some((h) => h.level === 2 && h.text === "Fine print"));
    assert.ok(!/<h3>(Calendar|Better Security|Fine print)<\/h3>/.test(body));
  });

  test("the month grid is a plain grid of links, not an ARIA grid widget", async () => {
    const body = await render(cityPage, "/dallas?view=month", { city: "dallas" });
    assert.match(body, /class="month-grid"/);
    assert.doesNotMatch(body, /role="grid"/);
  });

  test("the embed widget has a main landmark and one level one heading", async () => {
    const body = await render(embedPage, "/embed/dallas", { city: "dallas" });
    assert.match(body, /<main class="w">/);
    assert.equal((body.match(/<h1>/g) || []).length, 1);
    assert.doesNotMatch(body, /preview-bar/);
  });
});
