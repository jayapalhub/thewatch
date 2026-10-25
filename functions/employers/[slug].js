import { notFound } from "../_lib/html.js";
import { employerBySlug, employerJobs, employerPage } from "../_lib/employers.js";

// /employers/<organization slug>: one employer's live roles across every board. An employer with nothing live gets a
// short page saying so (noindex), not a 404; an unknown slug is a 404.
export async function onRequestGet({ params, env }) {
  const o = await employerBySlug(env.DB, params.slug);
  if (!o) return notFound("Employer not found");
  return employerPage(o, await employerJobs(env.DB, o.id));
}
