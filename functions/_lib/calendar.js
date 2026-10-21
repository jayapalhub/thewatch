import { eventPath, cityOf } from "./constants.js";
import { toUtc, icsStamp } from "./dates.js";

function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function fold(line) { // RFC 5545 line folding at 75 octets (approximate by chars)
  const out = []; let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = " " + s.slice(73); }
  out.push(s); return out.join("\r\n");
}

export function eventToVevent(e, siteUrl) {
  const start = toUtc(e.start_at, e.timezone);
  const end = e.end_at ? toUtc(e.end_at, e.timezone) : new Date(start.getTime() + 2 * 3600 * 1000);
  const url = `${siteUrl}${eventPath(e)}`;
  const loc = e.format === "virtual" ? "Online" : [e.venue_display, e.venue_address_display].filter(Boolean).join(", ");
  const desc = [e.description_short, e.registration_url ? `Register: ${e.registration_url}` : "", `Details: ${url}`].filter(Boolean).join("\n\n");
  return [
    "BEGIN:VEVENT",
    `UID:event-${e.id}@bettersecurity.ai`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    fold(`SUMMARY:${icsEscape(e.title)}`),
    fold(`DESCRIPTION:${icsEscape(desc)}`),
    fold(`LOCATION:${icsEscape(loc)}`),
    fold(`URL:${url}`),
    e.org_name ? fold(`ORGANIZER;CN=${icsEscape(e.org_name)}:mailto:watch@bettersecurity.ai`) : null,
    "END:VEVENT",
  ].filter(Boolean).join("\r\n");
}

export function icsDocument(events, siteUrl, name = "The Watch San Diego") {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Better Security//The Watch San Diego//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`, "X-WR-TIMEZONE:America/Los_Angeles",
    ...events.map((e) => eventToVevent(e, siteUrl)),
    "END:VCALENDAR", "",
  ].join("\r\n");
}

export function googleCalendarUrl(e, siteUrl) {
  const start = toUtc(e.start_at, e.timezone);
  const end = e.end_at ? toUtc(e.end_at, e.timezone) : new Date(start.getTime() + 2 * 3600 * 1000);
  const loc = e.format === "virtual" ? "Online" : [e.venue_display, e.venue_address_display].filter(Boolean).join(", ");
  const p = new URLSearchParams({
    action: "TEMPLATE", text: e.title,
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    details: [e.description_short, e.registration_url ? `Register: ${e.registration_url}` : "", `Via ${(cityOf(e.city) || {}).title || "The Watch"}: ${siteUrl}${eventPath(e)}`].filter(Boolean).join("\n\n"),
    location: loc,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function outlookUrl(e, siteUrl) {
  const start = toUtc(e.start_at, e.timezone);
  const end = e.end_at ? toUtc(e.end_at, e.timezone) : new Date(start.getTime() + 2 * 3600 * 1000);
  const loc = e.format === "virtual" ? "Online" : [e.venue_display, e.venue_address_display].filter(Boolean).join(", ");
  const p = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent", subject: e.title,
    startdt: start.toISOString(), enddt: end.toISOString(),
    body: `${e.description_short || ""}\n\n${siteUrl}${eventPath(e)}`, location: loc,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}
