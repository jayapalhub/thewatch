import { notFound } from "../../_lib/html.js";
import { CITIES } from "../../_lib/constants.js";
import { speakersPage } from "../../_lib/speakers-page.js";

export async function onRequestGet({ params, env, request, waitUntil }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  return speakersPage(env, city, request, waitUntil);
}
