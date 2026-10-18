import { html, page } from "./_lib/html.js";
import { shell, signupForm } from "./_lib/layout.js";

export async function onRequestGet() {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">About</p>
    <h1>The newspaper for San Diego security.</h1>
    <p class="lede">The Watch San Diego is a calendar and a Sunday email that cover every cybersecurity, AI security, privacy and audit event in San Diego County, published by Better Security.</p>
  </div></section>
  <section class="band"><div class="wrap narrow prose">
    <h2>Why it exists</h2>
    <p>San Diego has a dense security community spread across a dozen chapters, meetups, universities and conference producers, and no single place to see what's on. The general tech calendars list a security event or two among forty startup happy hours, and the chapter emails only cover the chapter. If you're a practitioner trying to decide what to do with a Tuesday evening, you end up checking six sites or missing things. The Watch fixes that by covering everyone, with the filters a security person wants: topic, CPE credit, cost, format and organizer.</p>
    <h2>How the calendar is curated</h2>
    <p>Events come from three places: our own research of every San Diego organizer, organizers submitting directly, and feeds where organizers publish them. Every listing is reviewed by a person before it's published and links to the organizer's own registration page, which remains the authoritative source for times and prices. CPE information is as reported by the organizer; we show it but don't certify it. We list events from groups we might be said to compete with, because a calendar that leaves things out isn't a calendar.</p>
    <h2>Who writes it</h2>
    <p>Jerome Jayapal has spent more than a decade in enterprise security, most recently in governance, risk and third party risk at Verizon, and serves on the board of the ISACA San Diego chapter as Community Director, where he runs the chapter's community events. He founded Better Security to run the kind of events he wanted to attend: smaller, more senior, and more fun than the usual. He also coaches padel's cousin, pickleball, which explains the first event.</p>
    <h2>Better Security</h2>
    <p>Better Security is a San Diego events company. It publishes The Watch and runs a small number of events each year for the security community, funded by sponsors who want to meet practitioners rather than buy their contact details. It does not offer consulting or advisory services.</p>
    <h2>Get in touch</h2>
    <p>Corrections, event tips, sponsorship and everything else: <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>. Organizers can <a href="/submit">submit an event</a> directly.</p>
  </div></section>
  <section class="band band-navy band-tight"><div class="wrap split-center"><div><h2>Read it this Sunday.</h2></div>${signupForm({ source: "about" })}</div></section>`;
  return page(shell({ title: "About", body, path: "/about" }), 200, { "Cache-Control": "public, max-age=3600" });
}
