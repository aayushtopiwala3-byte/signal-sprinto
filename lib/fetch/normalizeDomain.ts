/**
 * §4.1 — normalise aggressively before anything else, so that
 * `  HTTPS://Rocketlane.com/pricing?utm_source=x  ` and `rocketlane.com` are one company and
 * cost one Hunter credit (T-01, T-02).
 */

export const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/;

export type NormalizeResult =
  | { ok: true; domain: string; raw: string }
  | { ok: false; raw: string; reason_code: "invalid_domain"; reason_text: string };

export function normalizeDomain(input: string): NormalizeResult {
  const raw = input;
  let s = input.trim().toLowerCase();

  // Strip scheme, including protocol-relative forms.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");

  // Strip userinfo (user:pass@host) before anything host-shaped is parsed.
  const at = s.indexOf("@");
  if (at !== -1) s = s.slice(at + 1);

  // Strip fragment, then query, then path — in that order, so `?a=b#c` cannot leak a slash.
  s = s.split("#")[0];
  s = s.split("?")[0];
  s = s.split("/")[0];

  // Strip port.
  s = s.split(":")[0];

  // Strip a leading `www.` and any trailing dot (the DNS root).
  s = s.replace(/^www\./, "").replace(/\.$/, "");

  s = s.trim();

  if (s.length === 0) {
    return {
      ok: false,
      raw,
      reason_code: "invalid_domain",
      reason_text: `"${raw.trim()}" is empty after normalisation.`,
    };
  }

  if (!DOMAIN_RE.test(s)) {
    return {
      ok: false,
      raw,
      reason_code: "invalid_domain",
      reason_text: `"${raw.trim()}" normalises to "${s}", which does not match the required domain shape.`,
    };
  }

  return { ok: true, domain: s, raw };
}

/** Accepts one-per-line or comma-separated input, mixed freely. */
export function splitDomainInput(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type NormalizedBatch = {
  /** Unique normalised domains, in first-seen order. */
  domains: { domain: string; raw: string }[];
  /** Entries that collapsed onto an already-seen domain. Counted, never silently dropped. */
  duplicates_removed: number;
  /** Entries that failed the shape check, bound for quarantine. */
  invalid: { raw: string; reason_code: "invalid_domain"; reason_text: string }[];
  /** How many entries the user actually submitted, before any collapsing. */
  submitted: number;
};

/**
 * Normalise, reject, then de-duplicate — in that order, because duplicates are only knowable
 * after normalisation (§4.1).
 */
export function normalizeBatch(entries: string[]): NormalizedBatch {
  const seen = new Set<string>();
  const domains: { domain: string; raw: string }[] = [];
  const invalid: NormalizedBatch["invalid"] = [];
  let duplicates = 0;

  for (const entry of entries) {
    const result = normalizeDomain(entry);
    if (!result.ok) {
      invalid.push({
        raw: result.raw,
        reason_code: result.reason_code,
        reason_text: result.reason_text,
      });
      continue;
    }
    if (seen.has(result.domain)) {
      duplicates++;
      continue;
    }
    seen.add(result.domain);
    domains.push({ domain: result.domain, raw: result.raw.trim() });
  }

  return {
    domains,
    duplicates_removed: duplicates,
    invalid,
    submitted: entries.length,
  };
}
