// The city chooser: compact tiles in alphabetical order, counts from one grouped query, and no "0 events" lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers.js";
import { CITIES } from "../functions/_lib/constants.js";
import { onRequestGet as home } from "../functions/index.js";

CITIES.dallas = { slug: "dallas", name: "Dallas", title: "The Watch Dallas", region: "Dallas, Fort Worth and North Texas", timezone: "America/Chicago", newsletter: "sunday", sort: 110 };
CITIES.austin = { slug: "austin", name: "Austin", title: "The Watch Austin", region: "Austin and Central Texas", timezone: "America/Chicago", newsletter: "sunday", sort: 120 };

test("home: alphabetical tiles, one grouped count query, Virtual first, new calendars say so", async () => {
  const db = fakeDb([{ match: /GROUP BY city/, op: "all", reply: () => ({ results: [{ city: "dallas", n: 6 }, { city: "sandiego", n: 1 }] }) }]);
  const res = await home({ request: new Request("https://bettersecurity.ai/?choose=1"), env: { DB: db } });
  const body = await res.text();
  const names = [...body.matchAll(/<span class="city-tile-name">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.equal(names[0], "Virtual");
  const rest = names.slice(1);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b)));
  assert.ok(rest.indexOf("Austin") < rest.indexOf("Dallas"));
  assert.match(body, /href="\/dallas">[\s\S]*?6 events</);
  assert.match(body, /href="\/sandiego">[\s\S]*?1 event</);
  assert.match(body, /href="\/austin">[\s\S]*?New calendar</);
  assert.doesNotMatch(body, /\b0 upcoming|\b0 events/);
  const perCity = db.calls.filter((c) => /FROM events WHERE status='published' AND city=\?/.test(c.sql));
  assert.equal(perCity.length, 0);
});
