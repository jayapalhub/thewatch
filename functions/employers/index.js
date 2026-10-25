import { employerIndex, employerIndexPage } from "../_lib/employers.js";

// /employers?q=<name>: every employer with a live role, most roles first. The filter is a plain query parameter.
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams.get("q") || "";
  return employerIndexPage(await employerIndex(env.DB, q));
}
