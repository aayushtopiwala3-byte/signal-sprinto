import {
  EMPTY_EVIDENCE_MAP,
  DEFAULT_SWITCHES,
  DEFAULT_WEIGHTS,
  type EvidenceMap,
  type Switches,
  type Weights,
} from "@/lib/types";
import type { PageRecord } from "@/lib/rules/signals";

export function evidence(patch: Partial<EvidenceMap> = {}): EvidenceMap {
  return { ...EMPTY_EVIDENCE_MAP, ...patch };
}

/** A company that clears the FIT gate, so tests can isolate the TIMING stack. */
export function fittingEvidence(patch: Partial<EvidenceMap> = {}): EvidenceMap {
  return evidence({
    is_b2b_saas: true,
    is_b2b_saas_evidence: {
      quote: "We build project management software for B2B software teams.",
      url: "https://example.com/",
    },
    size_band: "51-200",
    cert_status: "none",
    pressure_signals: [],
    is_services: false,
    ...patch,
  });
}

export function switches(patch: Partial<Switches> = {}): Switches {
  return { ...DEFAULT_SWITCHES, ...patch };
}

export function weights(patch: Partial<Weights> = {}): Weights {
  return { ...DEFAULT_WEIGHTS, ...patch };
}

export function page(url: string, text: string, title: string | null = null): PageRecord {
  return { url, text, title };
}

/* ---- Page text fixtures. Hand-built so the rules engine is tested against known input. ---- */

export const PAGE_FUNDING_ONLY = page(
  "https://example.com/blog/funding",
  "We are delighted to share that we have raised $12 million in our Series A funding round this quarter. " +
    "The capital will be used to expand our engineering team across three regions over the next year.",
);

export const PAGE_CERT_IN_PROGRESS = page(
  "https://example.com/security",
  "Our SOC 2 Type II audit is currently in progress and we expect the report to be available next quarter. " +
    "We take the protection of customer information extremely seriously across every part of the platform.",
);

export const PAGE_SECURITY_NO_BADGE = page(
  "https://example.com/security",
  "Security is a core part of how we build and operate the product for every customer we serve. " +
    "All customer information is encrypted at rest and in transit using industry standard algorithms.",
);

export const PAGE_CAREERS_SECURITY_ROLE = page(
  "https://example.com/careers",
  "We are hiring a Security Engineer to establish our compliance programme from the ground up here. " +
    "You will be the first dedicated security hire and will report directly to the Chief Technology Officer.",
);

export const PAGE_PRICING_ENTERPRISE = page(
  "https://example.com/pricing",
  "The Enterprise plan includes SOC 2 reports, a signed DPA, custom security review support and SSO. " +
    "Teams on the Growth plan can upgrade at any time to unlock advanced permissions and audit logs.",
);

export const PAGE_ENTERPRISE_LOGOS = page(
  "https://example.com/customers",
  "Trusted by enterprise customers including several Fortune 500 organisations across four continents. " +
    "Our platform supports the largest deployments in the industry without any loss of responsiveness.",
);

export const PAGE_REGULATED_VERTICAL = page(
  "https://example.com/product",
  "We serve healthcare providers and fintech companies who need to move patient and payments data safely. " +
    "Clinical teams rely on the platform every day to coordinate care across large hospital networks.",
);
