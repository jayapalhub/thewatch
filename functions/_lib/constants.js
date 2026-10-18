export const CITIES = {
  sandiego: { slug: "sandiego", name: "San Diego", title: "The Watch San Diego", region: "San Diego County" },
};

export const TOPICS = {
  grc: "GRC",
  ai: "AI security",
  cloud: "Cloud",
  appsec: "AppSec",
  privacy: "Privacy",
  audit: "Audit",
  identity: "Identity",
  network: "Network",
  threat_intel: "Threat intel",
  leadership: "Leadership",
  careers: "Careers",
  social: "Social",
};

export const FORMATS = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };
export const COST_TYPES = { free: "Free", paid: "Paid", members_free: "Free for members", donation: "Donation", unknown: "Cost not listed" };
export const AUDIENCE = { open: "Open to all", early_career: "Early career", practitioner: "Practitioners", senior: "Senior" };
export const ORG_TYPES = ["chapter", "meetup", "conference", "vendor", "university", "government", "community", "media"];
export const EVENT_STATUSES = ["draft", "pending_review", "published", "cancelled", "rejected"];
export const SENIORITY = { student: "Student", early_career: "Early career", practitioner: "Practitioner", manager: "Manager", director: "Director or VP", executive: "Executive" };

export const BS_EVENT_KEYS = {
  padel_2027: "Padel Social 2027",
  ai_security_conf_2027: "AI Security Conference 2027",
  dinner_series: "Sponsored dinner series",
  roundtables: "Executive roundtables",
};

export const CONSENT_VERSION = "2026-10";
export const CONSENT_TEXT = "By subscribing you agree to receive The Watch San Diego weekly email and occasional notes about Better Security events. Unsubscribe any time with one click.";

export const MAIL_ADDRESS = "Better Security, 17190 Bernardo Center Drive, Suite 200, San Diego, CA 92128";

// Bump on any CSS or JS change so browsers fetch the new file.
export const ASSET_VERSION = "2026-10-18b";
