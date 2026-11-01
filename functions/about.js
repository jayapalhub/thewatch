import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";
import { preferredCity } from "./_lib/constants.js";

export async function onRequestGet({ request }) {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">About</p>
    <h1>One place for San Diego's security and tech community.</h1>
    <p class="lede">The Watch is San Diego's most complete security and technology events calendar, with a Sunday email that puts the week in order. It is free, open to everyone, and published by Better Security, which also hosts small, invite only experiences for San Diego security and IT practitioners starting in 2027.</p>
  </div></section>
  <section class="band"><div class="wrap narrow prose">
    <h2>Why it exists</h2>
    <p>San Diego has a dense security and technology community spread across a dozen chapters, meetups, universities and conference producers, and no single place to see what's on. The general tech calendars list a security event or two among forty startup happy hours, and the chapter emails only cover the chapter. If you're a practitioner trying to decide what to do with a Tuesday evening, you end up checking six sites or missing things. The Watch fixes that by covering everyone, with the filters a practitioner wants: topic, CPE credit, cost, format and organizer.</p>
    <h2>How the calendar is curated</h2>
    <p>Events come from three places: our own research of every organizer in San Diego County, organizers submitting directly, and feeds where organizers publish them. Every listing is reviewed by a person before it's published and links to the organizer's own registration page, which remains the authoritative source for times and prices. CPE information is as reported by the organizer; we show it but don't certify it. We list events from groups we might be said to compete with, because a calendar that leaves things out isn't a calendar.</p>
    <h2>Who writes it</h2>
    <p>Jerome Jayapal has spent more than a decade in enterprise security, including governance and risk work at Verizon, and is active across San Diego's security community, where he organizes community events for practitioners. He founded Better Security to make it easy to find the events worth your time, and to host a few of his own.</p>
    <h2>Better Security</h2>
    <p>Better Security is a San Diego events company. It publishes The Watch and, starting in 2027, hosts a small number of invite only experiences each year for San Diego security and IT practitioners, some over a meal and some around an activity. They are funded by sponsors who want to meet practitioners rather than buy their contact details, and attendee details are never shared with sponsors. If you would like to be considered, <a href="/invite">request an invitation</a>. Better Security does not offer consulting or advisory services.</p>
    <h2>Get in touch</h2>
    <p>Corrections, event tips, sponsorship and everything else: <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>. Organizers can <a href="/submit">submit an event</a> directly.</p>
  </div></section>
  <section class="band band-navy band-tight"><div class="wrap split-center"><div><h2>Read it this Sunday.</h2></div>${signupForm({ source: "about", chooseCity: true, city: preferredCity(request) })}</div></section>`;
  return page(shell({ title: "About", description: "The Watch is San Diego's free security and technology events calendar and Sunday email, published by Better Security.", body, path: "/about" }), 200, { "Cache-Control": "private, max-age=600" });
}
