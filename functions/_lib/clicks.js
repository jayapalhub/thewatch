// Per subscriber click attribution for the Sunday email.
// Each subscriber has a click_token that is separate from the profile and unsubscribe tokens, so a link that leaves
// the site never carries anything that could open the profile or the CPE log. The token goes on email links as &s=...
// only when the subscriber has personalization on; the /go redirects resolve it here and store the subscriber id
// on the click row. Anyone with personalization off gets plain links and is never resolved, even if an old token
// is still in a forwarded email.

export const CLICK_PARAM = "s";

// Append the token to every /go/ link in a rendered email. Links are rebuilt per subscriber anyway (jobs, picks,
// unsubscribe), so this runs on the final HTML for one person. A link with a query string gets &s=, one without gets ?s=.
export function tagLinks(html, siteUrl, sub) {
  if (!sub || !sub.click_token || Number(sub.personalize === undefined ? 1 : sub.personalize) === 0) return html;
  const base = `${siteUrl}/go/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(href="${base}[^"]*)"`, "g");
  const tok = encodeURIComponent(sub.click_token);
  return html.replace(re, (m, pre) => `${pre}${pre.includes("?") ? "&" : "?"}${CLICK_PARAM}=${tok}"`);
}

// From a /go request, the subscriber id the click belongs to, or null.
export async function clickSubscriberId(db, request) {
  let tok = "";
  try { tok = new URL(request.url).searchParams.get(CLICK_PARAM) || ""; } catch { return null; }
  tok = String(tok).replace(/[^a-z0-9]/gi, "").slice(0, 40);
  if (!tok) return null;
  try {
    const row = await db.prepare("SELECT id FROM subscribers WHERE click_token=? AND personalize=1 AND status='active'").bind(tok).first();
    return row ? row.id : null;
  } catch { return null; }
}
