import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { MAIL_ADDRESS } from "./_lib/constants.js";

export async function onRequestGet() {
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow"><p class="kicker">Last updated October 2026</p><h1>Privacy policy</h1>
  <p class="lede">This is the privacy policy for bettersecurity.ai and The Watch, published by Better Security. It's written in plain language because that's how we'd want to read it.</p></div></section>
  <section class="band"><div class="wrap narrow prose">
    <h2>Who we are</h2>
    <p>Better Security is a San Diego events business operated by Jerome Jayapal. Our mailing address is ${MAIL_ADDRESS}, and you can reach us at <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>. Better Security is in the process of being organized under a limited liability company; this policy will be updated when that happens and nothing about how your data is handled will change.</p>
    <h2>What we collect and why</h2>
    <p><strong>When you subscribe</strong>, we store your email address, the page you subscribed from, the date and time, the version of the consent text you saw, and a hashed version of your IP address, so we can prove consent and detect abuse. <strong>If you complete the optional profile</strong>, we store your name, company, role, seniority, areas of interest and LinkedIn URL. We use these for exactly one purpose beyond sending you the email: deciding which Better Security events, dinners and roundtables to invite you to. <strong>When you register interest in an event</strong>, we store that alongside your subscription. <strong>When you submit an event</strong>, we store the event details and your name and email so we can confirm the listing. <strong>When you ask about sponsoring</strong>, we store what you send us.</p>
    <p>Our website collects standard, privacy preserving analytics through Cloudflare Web Analytics, which does not use cookies or track you across sites. Links in the Sunday email pass through our own redirect so we can see which events readers click; that tells us which listings are useful and is not tied to your identity in the email itself beyond what Beehiiv reports (see below).</p>
    <h2>Who else sees it</h2>
    <p>We use <strong>Beehiiv</strong> to send the newsletter, so your email address and any profile answers are stored there too, and Beehiiv reports opens and clicks to us the way every email platform does. We use <strong>Resend</strong> to send one off emails such as submission confirmations. Our website and database run on <strong>Cloudflare</strong>. Each of these companies processes data on our behalf under their own privacy terms. Beyond those processors, we do not sell, rent or share your personal information with anyone, including event organizers and sponsors. Sponsors at our events run their own activations where you choose whether to give them your details directly.</p>
    <h2>Your choices</h2>
    <p>Every email has a one click unsubscribe link, and unsubscribing stops all mail from us. You can ask us to see, correct or delete anything we hold about you by writing to <a href="mailto:watch@bettersecurity.ai">watch@bettersecurity.ai</a>; we'll respond within thirty days. California residents have additional rights under the CCPA, including the right to know and the right to delete, and you can exercise them the same way. We don't discriminate against anyone for exercising their rights.</p>
    <h2>How long we keep it</h2>
    <p>Subscriber records are kept while you're subscribed and for up to twelve months after you unsubscribe, so we can honor the unsubscribe and show that we did. Event submissions and sponsor inquiries are kept as business records. Analytics are aggregate.</p>
    <h2>Children</h2>
    <p>The Watch is for working professionals and we don't knowingly collect information from anyone under 16.</p>
    <h2>Changes</h2>
    <p>If this policy changes in a way that matters, we'll say so in the Sunday email. The date at the top is the version you're reading.</p>
  </div></section>`;
  return page(shell({ title: "Privacy policy", body, path: "/privacy" }), 200, { "Cache-Control": "public, max-age=3600" });
}
