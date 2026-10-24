import { notFound } from "../../_lib/html.js";
import { CITIES } from "../../_lib/constants.js";
import { postedJobs, lazyJobs } from "../../_lib/jobs.js";
import { postedPage } from "../../_lib/posted.js";

export async function onRequestGet({ params, env, waitUntil }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  lazyJobs(env.DB, waitUntil, env);
  return postedPage(city, await postedJobs(env.DB, city.slug), { siteUrl: env.SITE_URL });
}
