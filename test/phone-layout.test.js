// Phone layout from the 2026-10-23 audit: filters fold behind one button unless a filter is active, and the Virtual
// calendar shows two weeks with the rest of the 60 days one tap away.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterBox } from "../functions/_lib/layout.js";
import { html } from "../functions/_lib/html.js";
import { onRequestGet as virtualPage } from "../functions/virtual/index.js";
import { onRequestGet as cityPage } from "../functions/[city]/index.js";
import { addDays, todayKey } from "../functions/_lib/dates.js";
import { fakeDb } from "./helpers.js";

describe("filterBox", () => {
  test("renders open with a Filters button, and closes itself on phones only when nothing is filtered", () => {
    const idle = String(filterBox(html`<form class="filters"></form>`, 0));
    assert.match(idle, /^<details class="filters-box" open data-filters><summary class="filters-toggle">Filters<\/summary><form class="filters"><\/form><\/details><script>/);
    assert.match(idle, /matchMedia\("\(max-width: 640px\)"\)\.matches\)d\.open=false/);
    const active = String(filterBox(html`<form class="filters"></form>`, 2));
    assert.match(active, /Filters <span class="filters-count">2<\/span>/);
    assert.doesNotMatch(active, /<script>/);
  });
  test("the city calendar wraps its filters, and an active filter keeps them open with a count", async () => {
    const run = async (path) => (await cityPage({ request: new Request("https://bettersecurity.ai" + path), env: { DB: fakeDb() }, params: { city: "sandiego" }, waitUntil: () => {} })).text();
    assert.match(await run("/sandiego"), /<details class="filters-box" open data-filters><summary class="filters-toggle">Filters<\/summary><form class="filters"/);
    assert.match(await run("/sandiego?cost=free&cpe=1"), /Filters <span class="filters-count">2<\/span>/);
  });
});

describe("Virtual calendar paging", () => {
  const today = todayKey();
  const ev = (id, day) => ({ id, slug: `s${id}`, city: "virtual", title: `Session ${id}`, status: "published", start_at: `${addDays(today, day)}T10:00`, end_at: `${addDays(today, day)}T11:00`,
    start_utc: `${addDays(today, day)}T17:00:00.000Z`, timezone: "America/Los_Angeles", format: "virtual", cost_type: "free", cpe_eligible: 1, cpe_hours: 1, topics: "[]", org_display: "ISACA", org_slug: "isaca", org_type: "association", registration_url: "https://example.test" });
  const db = () => fakeDb([{ match: /FROM events e/, op: "all", reply: () => ({ results: [ev(1, 1), ev(2, 5), ev(3, 20), ev(4, 40)] }) }]);
  const run = async (path) => (await virtualPage({ request: new Request("https://bettersecurity.ai" + path), env: { DB: db() }, waitUntil: () => {} })).text();
  test("two weeks by default, with a button for the rest of the 60 days", async () => {
    const body = await run("/virtual");
    assert.match(body, /Session 1/); assert.match(body, /Session 2/);
    assert.doesNotMatch(body, /Session 3/); assert.doesNotMatch(body, /Session 4/);
    assert.match(body, /href="\/virtual\?days=60">Show all 4 sessions in the next 60 days<\/a>/);
    assert.match(body, /4 sessions in the next 60 days/);
  });
  test("?days=60 shows everything, keeps the choice through the filters, and drops the button", async () => {
    const body = await run("/virtual?days=60");
    assert.match(body, /Session 4/);
    assert.match(body, /<input type="hidden" name="days" value="60">/);
    assert.doesNotMatch(body, /Show all \d+ sessions/);
  });
});
