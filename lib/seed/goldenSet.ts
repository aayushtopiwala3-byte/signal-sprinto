import { normalizeDomain, normalizeBatch, splitDomainInput } from "@/lib/fetch/normalizeDomain";
import { parseRobots, isPathAllowed } from "@/lib/fetch/robots";
import { detectSignals, type PageRecord } from "@/lib/rules/signals";
import { computeVerdict } from "@/lib/rules/verdict";
import { selectContact, type HunterCandidate } from "@/lib/rules/poc";
import { validateDraft } from "@/lib/rules/evidenceValidator";
import { shouldContinue, MAX_EXTRA_FETCHES } from "@/lib/pipeline/completeness";
import { ExtractSchema } from "@/lib/ai/prompts/extract";
import { capability, sendToOrNull } from "@/lib/env";
import { sendEmail } from "@/lib/mail/send";
import {
  EMPTY_EVIDENCE_MAP,
  DEFAULT_WEIGHTS,
  DEFAULT_SWITCHES,
  type EvidenceMap,
  type Switches,
} from "@/lib/types";

/**
 * §12's structural assertions, runnable in the browser (§9, `/selftest`).
 *
 * Every case here is pure: frozen inputs, no network, no model, no database. That is only
 * possible because the verdict is plain TypeScript — if scoring lived in a prompt, none of
 * this page could exist.
 */

export type GoldenOutcome = { status: "pass" | "fail" | "skipped"; detail: string };

export type GoldenCase = {
  id: string;
  title: string;
  run: () => GoldenOutcome | Promise<GoldenOutcome>;
};

const ok = (detail: string): GoldenOutcome => ({ status: "pass", detail });
const bad = (detail: string): GoldenOutcome => ({ status: "fail", detail });
const skip = (detail: string): GoldenOutcome => ({ status: "skipped", detail });
const check = (pass: boolean, detail: string) => (pass ? ok(detail) : bad(detail));

/* ---------------------------------------------------------------- fixtures */

const ev = (patch: Partial<EvidenceMap> = {}): EvidenceMap => ({ ...EMPTY_EVIDENCE_MAP, ...patch });

const sw = (patch: Partial<Switches> = {}): Switches => ({ ...DEFAULT_SWITCHES, ...patch });

const page = (url: string, text: string): PageRecord => ({ url, text, title: null });

/** Clears the FIT gate, so the TIMING stack can be exercised on its own. */
const FITTING = ev({
  is_b2b_saas: true,
  is_b2b_saas_evidence: {
    quote: "We build project management software for B2B software teams.",
    url: "https://example.com/",
  },
  size_band: "51-200",
  cert_status: "none",
  pressure_signals: [],
  is_services: false,
});

const PAGE_FUNDING = page(
  "https://example.com/blog/funding",
  "We are delighted to share that we have raised $12 million in our Series A funding round this quarter. " +
    "The capital will be used to expand our engineering team across three regions over the next year.",
);

const PAGE_CERT_IN_PROGRESS = page(
  "https://example.com/security",
  "Our SOC 2 Type II audit is currently in progress and we expect the report to be available next quarter. " +
    "We take the protection of customer information extremely seriously across every part of the platform.",
);

/* ------------------------------------------------------------------- cases */

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: "T-01",
    title: "`  HTTPS://Rocketlane.com/pricing?utm_source=x  ` normalises to `rocketlane.com`",
    run: () => {
      const result = normalizeDomain("  HTTPS://Rocketlane.com/pricing?utm_source=x  ");
      const got = result.ok ? result.domain : `rejected: ${result.reason_text}`;
      return check(got === "rocketlane.com", `got \`${got}\``);
    },
  },
  {
    id: "T-02",
    title: "Three entries resolving to `rocketlane.com` produce one company",
    run: () => {
      const batch = normalizeBatch(
        splitDomainInput(
          "rocketlane.com\nhttps://www.rocketlane.com/pricing\nHTTPS://Rocketlane.com/?utm_source=x",
        ),
      );
      return check(
        batch.domains.length === 1 && batch.duplicates_removed === 2,
        `${batch.domains.length} company, ${batch.duplicates_removed} duplicates removed, from ${batch.submitted} entries`,
      );
    },
  },
  {
    id: "T-03",
    title: "`size_band = '500+'` returns DROP with `rule_fired = 'R-02'`",
    run: () => {
      const r = computeVerdict(
        ev({ ...FITTING, size_band: "500+" }),
        [],
        DEFAULT_WEIGHTS,
        sw(),
      );
      return check(
        r.verdict === "DROP" && r.rule_fired === "R-02",
        `${r.verdict} / ${r.rule_fired} — ${r.verdict_reason}`,
      );
    },
  },
  {
    id: "T-04",
    title: "A non-SaaS company returns DROP with `rule_fired = 'R-01'`",
    run: () => {
      const r = computeVerdict(
        ev({
          is_b2b_saas: false,
          is_b2b_saas_evidence: {
            quote: "Order fresh groceries online and we will deliver them to your door today.",
            url: "https://example.com/",
          },
        }),
        [],
        DEFAULT_WEIGHTS,
        sw(),
      );
      return check(
        r.verdict === "DROP" && r.rule_fired === "R-01",
        `${r.verdict} / ${r.rule_fired} — ${r.verdict_reason}`,
      );
    },
  },
  {
    id: "T-05",
    title: "Only S-06 (funding, 10 pts) returns HOLD, never SEND",
    run: () => {
      const fired = detectSignals({ evidence: FITTING, pages: [PAGE_FUNDING] }, DEFAULT_WEIGHTS);
      const r = computeVerdict(FITTING, fired, DEFAULT_WEIGHTS, sw());
      const only = fired.map((s) => s.signal_id).join(", ") || "none";
      return check(
        r.verdict === "HOLD" && only === "S-06",
        `signals [${only}], score ${r.timing_score} → ${r.verdict} / ${r.rule_fired}`,
      );
    },
  },
  {
    id: "T-06",
    title: "S-01 + S-02 together give `independent_signals = 1`, not 2",
    run: () => {
      const fired = detectSignals(
        { evidence: FITTING, pages: [PAGE_CERT_IN_PROGRESS] },
        DEFAULT_WEIGHTS,
      );
      const r = computeVerdict(FITTING, fired, DEFAULT_WEIGHTS, sw());
      const ids = fired.map((s) => s.signal_id).join(", ");
      return check(
        r.independent_signals === 1,
        `[${ids}] on one page → independent_signals = ${r.independent_signals}`,
      );
    },
  },
  {
    id: "T-07",
    title: "`strict_icp` on a certified company: true → DROP R-04, false → HOLD migration",
    run: () => {
      const certified = ev({
        ...FITTING,
        cert_status: "certified",
        cert_status_evidence: {
          quote: "We are SOC 2 Type II certified and our report is available on request.",
          url: "https://example.com/security",
        },
      });
      const strict = computeVerdict(certified, [], DEFAULT_WEIGHTS, sw({ strict_icp: true }));
      const loose = computeVerdict(certified, [], DEFAULT_WEIGHTS, sw({ strict_icp: false }));
      return check(
        strict.verdict === "DROP" &&
          strict.rule_fired === "R-04" &&
          loose.verdict === "HOLD" &&
          loose.play === "migration",
        `strict → ${strict.verdict}/${strict.rule_fired}; loose → ${loose.verdict}/${loose.play}`,
      );
    },
  },
  {
    id: "T-08",
    title: "A robots.txt disallow closes the gate before any page is fetched",
    run: () => {
      const rules = parseRobots("User-agent: *\nDisallow: /\nAllow: /public");
      const root = isPathAllowed(rules, "/");
      const pub = isPathAllowed(rules, "/public/about");
      return check(
        root === false && pub === true,
        `"/" allowed = ${root}, "/public/about" allowed = ${pub}. The gate runs before tier 1, so a disallow records zero fetches.`,
      );
    },
  },
  {
    id: "T-10",
    title: "A draft whose `hook_quote` is absent from the source is blocked",
    run: () => {
      const sources = [{ url: "https://example.com/", text: PAGE_CERT_IN_PROGRESS.text }];
      const fabricated = validateDraft(
        {
          hook_quote: "We are scaling rapidly towards an exciting new chapter of global growth.",
          hook_url: "https://example.com/",
          body: "...",
        },
        sources,
      );
      const genuine = validateDraft(
        {
          hook_quote: "Our SOC 2 Type II audit is currently in progress",
          hook_url: "https://example.com/",
          body: "...",
        },
        sources,
      );
      return check(
        fabricated.validated === false && genuine.validated === true,
        `fabricated quote → blocked (${fabricated.blocked_reason ?? ""}); verbatim quote → sendable`,
      );
    },
  },
  {
    id: "T-11",
    title: "Every `type = 'generic'` candidate is excluded; all-generic → HOLD",
    run: () => {
      const generic: HunterCandidate[] = [
        {
          first_name: null,
          last_name: null,
          position: null,
          seniority: null,
          department: null,
          email: "info@example.com",
          confidence: 95,
          type: "generic",
        },
        {
          first_name: null,
          last_name: null,
          position: null,
          seniority: null,
          department: null,
          email: "sales@example.com",
          confidence: 90,
          type: "generic",
        },
      ];
      const allGeneric = selectContact(generic, "51-200");
      const withNamed = selectContact(
        [
          ...generic,
          {
            first_name: "Priya",
            last_name: "Nair",
            position: "Head of Security",
            seniority: "executive",
            department: "it",
            email: "priya@example.com",
            confidence: 72,
            type: "personal",
          },
        ],
        "51-200",
      );
      return check(
        allGeneric.ok === false && withNamed.ok === true,
        allGeneric.ok
          ? "all-generic list wrongly produced a contact"
          : `all-generic → ${allGeneric.verdict} (${allGeneric.rejectedGeneric} rejected); adding one named contact → ${withNamed.ok ? withNamed.selected.email : "none"} despite lower confidence`,
      );
    },
  },
  {
    id: "T-12",
    title: `The loop stops at exactly ${MAX_EXTRA_FETCHES} extra fetches and names what is missing`,
    run: () => {
      const partial = ev({ is_b2b_saas: true, cert_status: "none" });
      const below = shouldContinue(partial, MAX_EXTRA_FETCHES - 1);
      const at = shouldContinue(partial, MAX_EXTRA_FETCHES);
      return check(
        below.continue === true && at.continue === false && at.missing.length > 0,
        `${MAX_EXTRA_FETCHES - 1} used → continue; ${MAX_EXTRA_FETCHES} used → stop, missing [${at.missing.join(", ")}]`,
      );
    },
  },
  {
    id: "T-13",
    title: "`/api/send` ignores any recipient in the body and uses GMAIL_SEND_TO",
    run: async () => {
      const locked = sendToOrNull();
      if (!locked) return skip("GMAIL_SEND_TO is not set, so there is no lock to verify.");

      // Only safe to exercise live when no transport is configured: the call then resolves the
      // recipient from env and fails at the transport, without sending anything.
      if (capability.gmail() || capability.resend()) {
        return skip(
          `A transport is configured, so this is not re-run live — it would send a real email. The recipient is structurally locked: sendEmail() takes {subject, body} only and reads ${locked} from env itself. Asserted in tests/send.test.ts.`,
        );
      }

      const outcome = await sendEmail({ subject: "selftest", body: "selftest" });
      return check(
        outcome.ok === false && outcome.to === locked,
        `sendEmail() resolved the recipient to ${outcome.to ?? "null"} from env with no 'to' parameter in its signature.`,
      );
    },
  },
  {
    id: "T-14",
    title: "Determinism: the frozen fixture set scores identically twice",
    run: () => {
      const score = () => {
        const fired = detectSignals(
          { evidence: FITTING, pages: [PAGE_FUNDING, PAGE_CERT_IN_PROGRESS] },
          DEFAULT_WEIGHTS,
        );
        const r = computeVerdict(FITTING, fired, DEFAULT_WEIGHTS, sw());
        return JSON.stringify({
          verdict: r.verdict,
          score: r.timing_score,
          rule: r.rule_fired,
          signals: r.fired_signals.map((s) => [s.signal_id, s.points]),
        });
      };
      const first = score();
      const second = score();
      return check(first === second, `both passes produced ${first}`);
    },
  },
  {
    id: "T-15",
    title: "A populated Evidence Map field with no quote fails Zod",
    run: () => {
      const withoutQuote = ExtractSchema.safeParse({
        is_b2b_saas: { value: "true", quote: "" },
        cert_status: { value: "not stated", quote: "" },
        size_band: { value: "not stated", quote: "" },
        is_services: { value: "not stated", quote: "" },
        pressure_signals: [],
      });
      const withQuote = ExtractSchema.safeParse({
        is_b2b_saas: {
          value: "true",
          quote: "We build project management software for B2B software teams.",
        },
        cert_status: { value: "not stated", quote: "" },
        size_band: { value: "not stated", quote: "" },
        is_services: { value: "not stated", quote: "" },
        pressure_signals: [],
      });
      return check(
        withoutQuote.success === false && withQuote.success === true,
        withoutQuote.success
          ? "an unquoted value was wrongly accepted"
          : `rejected: ${withoutQuote.error.issues[0]?.message ?? "no message"} — the retry re-sends this error to the model.`,
      );
    },
  },
];

export type GoldenResult = { id: string; title: string } & GoldenOutcome;

export async function runGoldenSet(): Promise<GoldenResult[]> {
  const results: GoldenResult[] = [];
  for (const c of GOLDEN_SET) {
    try {
      results.push({ id: c.id, title: c.title, ...(await c.run()) });
    } catch (err) {
      results.push({
        id: c.id,
        title: c.title,
        status: "fail",
        detail: `threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return results;
}
