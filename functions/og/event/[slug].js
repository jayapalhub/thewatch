import { eventBySlug } from "../../_lib/events.js";
import { cityOf, DEFAULT_CITY, CITIES } from "../../_lib/constants.js";
import { eventCard, render } from "../../_lib/og.js";

export async function onRequestGet({ params, env, request, waitUntil }) {
  const slug = String(params.slug).replace(/\.png$/, "");
  const e = await eventBySlug(env.DB, slug);
  if (!e || !["published", "cancelled"].includes(e.status)) return new Response("Not found", { status: 404 });
  const city = cityOf(e.city) || CITIES[DEFAULT_CITY];
  return render(request, await eventCard(e, city), waitUntil);
}
