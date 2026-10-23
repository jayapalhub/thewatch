import { test } from "node:test";
import assert from "node:assert/strict";
import { jobRegion, jobsJsonLd } from "../functions/_lib/jobs.js";

test("jobRegion reads the state from the posting's location", () => {
  assert.equal(jobRegion("Dallas, TX"), "TX");
  assert.equal(jobRegion("Austin, Texas, United States"), "TX");
  assert.equal(jobRegion("Boston, MA 02110"), "MA");
  assert.equal(jobRegion("Washington, District of Columbia"), "DC");
  assert.equal(jobRegion("Irvine, CA; Dallas, TX"), "CA");
});

test("jobRegion leaves the state out when the location does not give one", () => {
  assert.equal(jobRegion("San Diego"), undefined);
  assert.equal(jobRegion("Remote, US"), undefined);
  assert.equal(jobRegion(""), undefined);
  assert.equal(jobRegion(null), undefined);
});

test("a Dallas role is no longer marked as California", () => {
  const out = String(jobsJsonLd([{ id: 1, title: "Security Engineer", employer: "Example Co", location: "Plano, TX", remote: "onsite" }], { slug: "dallas", name: "Dallas", region: "Dallas, Fort Worth and North Texas" }, "https://bettersecurity.ai", "2026-10-23"));
  const [job] = JSON.parse(out.replace(/^<script[^>]*>|<\/script>$/g, ""));
  assert.equal(job.jobLocation.address.addressLocality, "Plano");
  assert.equal(job.jobLocation.address.addressRegion, "TX");
});
