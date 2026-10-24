import { postedJobs } from "../_lib/jobs.js";
import { postedPage } from "../_lib/posted.js";

export async function onRequestGet({ env }) {
  return postedPage(null, await postedJobs(env.DB, null), { siteUrl: env.SITE_URL });
}
