// Shared test helpers: fixture loading, a fixture backed fetcher for the ATS adapters, and a small fake D1 binding
// that records every statement so a test can check what the runners wrote.
import { readFileSync } from "node:fs";

const FIXTURES = new URL("./fixtures/", import.meta.url);

export function fixtureText(name) { return readFileSync(new URL(name, FIXTURES), "utf8"); }
export function fixtureJson(name) { return JSON.parse(fixtureText(name)); }

// A fetcher with the same signature as getJson in job-sources.js. route(url, init) returns the parsed body, or throws
// to stand in for an HTTP error. Every call is recorded so pagination tests can count requests.
export function recordingFetcher(route) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, init, body });
    return route(url, init, body);
  };
  fetcher.calls = calls;
  return fetcher;
}

// Fake D1. handlers: [{ match: RegExp on the SQL, op: "first" | "run" | "all" (optional), reply: (args) => value }].
// Unmatched statements answer null for first, { results: [] } for all and a meta object for run.
export function fakeDb(handlers = []) {
  const calls = [];
  const answer = (sql, args, op) => {
    for (const h of handlers) if (h.match.test(sql) && (!h.op || h.op === op)) return h.reply(args, sql);
    return undefined;
  };
  const db = {
    calls,
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() { calls.push({ op: "first", sql, args: stmt.args }); return answer(sql, stmt.args, "first") ?? null; },
        async run() { calls.push({ op: "run", sql, args: stmt.args }); return answer(sql, stmt.args, "run") ?? { meta: { last_row_id: 1, changes: 1 } }; },
        async all() { calls.push({ op: "all", sql, args: stmt.args }); return answer(sql, stmt.args, "all") ?? { results: [] }; },
      };
      return stmt;
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    find(re) { return calls.filter((c) => re.test(c.sql)); },
  };
  return db;
}

// Turn a recorded INSERT into { column: value }, reading literals in VALUES as they are written in the SQL.
export function insertRow(call) {
  const m = call.sql.match(/INSERT INTO \w+ \(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*$/);
  if (!m) throw new Error("not a single row INSERT: " + call.sql);
  const cols = m[1].split(",").map((c) => c.trim());
  const vals = m[2].split(",").map((v) => v.trim());
  let i = 0; const row = {};
  cols.forEach((c, k) => {
    const v = vals[k];
    row[c] = v === "?" ? call.args[i++] : /^'.*'$/.test(v) ? v.slice(1, -1) : Number(v);
  });
  return row;
}

// Replace globalThis.fetch for one test; returns a restore function. route(url, init) returns { status, body }.
export function stubGlobalFetch(route) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body = "" } = await route(String(url), init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { calls, restore() { globalThis.fetch = original; } };
}
