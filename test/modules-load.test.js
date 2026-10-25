// Every function module must import cleanly, the way the Pages build bundles them. A page that still imports a
// removed export passes the unit tests that never load it and then fails the deploy; this catches it first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const SKIP = /_vendor\/|\/og\.js$|\/og\//; // the OG image renderer loads wasm, which Node cannot import here

test("every function module loads", async () => {
  const failures = [];
  for (const f of walk("functions")) {
    if (SKIP.test(f)) continue;
    try { await import(new URL(`../${f}`, import.meta.url)); } catch (e) { failures.push(`${f}: ${String(e.message).split("\n")[0]}`); }
  }
  assert.deepEqual(failures, []);
});
