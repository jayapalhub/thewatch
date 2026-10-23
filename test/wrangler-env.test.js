// wrangler.toml: preview deployments must never reach the production database, and the preview environment must
// restate every variable, since Pages does not inherit vars or bindings into an environment that defines its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const PRODUCTION_DB = "1239087e-c235-43d1-b760-bb5723e358b9";
const STAGING_DB = "f4236033-993f-4427-945b-e7b9eaa4777d";

// A minimal reader for the shapes this file uses: [section] and [[section]] headers with key = "value" lines.
function sections(text) {
  const out = []; let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const h = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (h) { cur = { name: h[1], values: {} }; out.push(cur); continue; }
    const kv = /^([A-Za-z_][\w]*)\s*=\s*"([^"]*)"$/.exec(line);
    if (kv) { if (!cur) { cur = { name: "", values: {} }; out.push(cur); } cur.values[kv[1]] = kv[2]; }
  }
  return out;
}
const all = sections(toml);
const only = (name) => all.filter((s) => s.name === name);

test("the preview D1 binding points at thewatch-staging, not production", () => {
  const [prod] = only("d1_databases");
  assert.equal(prod.values.binding, "DB");
  assert.equal(prod.values.database_id, PRODUCTION_DB);
  const previews = only("env.preview.d1_databases");
  assert.equal(previews.length, 1, "exactly one preview D1 binding");
  const [pre] = previews;
  assert.equal(pre.values.binding, "DB");
  assert.equal(pre.values.database_name, "thewatch-staging");
  assert.equal(pre.values.database_id, STAGING_DB);
  assert.notEqual(pre.values.database_id, PRODUCTION_DB);
  assert.equal(pre.values.migrations_dir, prod.values.migrations_dir);
});

test("no preview section anywhere names the production database id", () => {
  const previewPart = toml.slice(toml.indexOf("[env.preview"));
  assert.ok(previewPart.length > 0, "an [env.preview...] section exists");
  assert.ok(!previewPart.includes(PRODUCTION_DB), "production id inside the preview sections");
});

test("preview vars restate every production var, and the two environments name themselves", () => {
  const [prod] = only("vars"); const [pre] = only("env.preview.vars");
  assert.ok(prod && pre, "both [vars] and [env.preview.vars] exist");
  for (const k of Object.keys(prod.values)) assert.ok(k in pre.values, `env.preview.vars is missing ${k}`);
  assert.equal(prod.values.ENVIRONMENT, "production");
  assert.equal(pre.values.ENVIRONMENT, "preview");
  assert.equal(prod.values.DEV_MODE, "0");
  assert.equal(pre.values.DEV_MODE, "1");
  for (const k of ["SITE_URL", "FROM_EMAIL", "NOTIFY_EMAIL", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD"]) assert.equal(pre.values[k], prod.values[k], k);
});

test("no secrets are written into wrangler.toml", () => {
  for (const s of all) for (const k of Object.keys(s.values)) assert.ok(!/KEY|SECRET|TOKEN|PASSWORD/i.test(k), `${k} looks like a secret`);
});
