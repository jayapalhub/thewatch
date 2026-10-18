import { html } from "./html.js";
import { CONSENT_TEXT } from "./constants.js";

// Interest form for Better Security events that don't have registration open yet.
export function interestForm({ key, cta = "Keep me posted", compact = true }) {
  return html`
  <form class="signup ${compact ? "signup-compact" : ""}" method="post" action="/api/interest" data-signup>
    <input type="hidden" name="event_key" value="${key}">
    <input type="hidden" name="source" value="interest:${key}">
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="sr-only" for="int-${key}">Email address</label>
    <div class="signup-row">
      <input id="int-${key}" type="email" name="email" placeholder="you@company.com" required autocomplete="email" inputmode="email">
      <button type="submit" class="btn btn-primary">${cta}</button>
    </div>
    <p class="consent">${CONSENT_TEXT} <a href="/privacy">Privacy policy</a>.</p>
    <p class="signup-msg" role="status" aria-live="polite"></p>
  </form>`;
}
