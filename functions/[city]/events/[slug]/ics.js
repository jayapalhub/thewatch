import { eventBySlug } from "../../../_lib/events.js";
import { icsDocument } from "../../../_lib/calendar.js";

export async function onRequestGet({ params, env }) {
  const e = await eventBySlug(env.DB, params.slug);
  if (!e || e.status !== "published") return new Response("Not found", { status: 404 });
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  return new Response(icsDocument([e], siteUrl, e.title, e.timezone || "America/Los_Angeles"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${e.slug}.ics"` },
  });
}
