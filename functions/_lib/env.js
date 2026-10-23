// Which environment this code is running in. wrangler.toml sets ENVIRONMENT to "production" at the top level and to
// "preview" under [env.preview], where Pages deploys every pull request against the staging database. A preview must
// never send email, post anywhere or run the background jobs that pages trigger on visit, so those paths ask here first.
export function isPreview(env) { return String((env && env.ENVIRONMENT) || "").toLowerCase() === "preview"; }

// One line in the deployment log for each thing a preview would have sent, with no recipients or bodies.
export function previewSkip(what, detail = "") {
  console.log(`preview: skipped ${what}${detail ? ` (${detail})` : ""}`);
  return { ok: true, skipped: "preview" };
}
