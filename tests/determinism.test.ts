import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectSignals } from "@/lib/rules/signals";
import { computeVerdict, compareForBoard } from "@/lib/rules/verdict";
import { selectContact } from "@/lib/rules/poc";
import {
  fittingEvidence,
  switches,
  weights,
  PAGE_CERT_IN_PROGRESS,
  PAGE_CAREERS_SECURITY_ROLE,
  PAGE_PRICING_ENTERPRISE,
  PAGE_ENTERPRISE_LOGOS,
  PAGE_REGULATED_VERTICAL,
  PAGE_FUNDING_ONLY,
} from "./helpers";

const RULES_DIR = path.resolve(__dirname, "../lib/rules");

describe("T-14 — the rules engine is deterministic by construction (§5.3)", () => {
  it("contains no Math.random and no Date.now anywhere under lib/rules", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(RULES_DIR)) {
      if (!file.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(RULES_DIR, file), "utf8");
      if (source.includes("Math.random(")) offenders.push(`${file}: Math.random`);
      if (source.includes("Date.now(")) offenders.push(`${file}: Date.now`);
      if (/new Date\(\s*\)/.test(source)) offenders.push(`${file}: new Date()`);
    }
    expect(offenders).toEqual([]);
  });

  it("yields byte-identical verdicts, scores and rule IDs across two runs of frozen input", () => {
    const pages = [
      PAGE_CERT_IN_PROGRESS,
      PAGE_CAREERS_SECURITY_ROLE,
      PAGE_PRICING_ENTERPRISE,
      PAGE_ENTERPRISE_LOGOS,
      PAGE_REGULATED_VERTICAL,
      PAGE_FUNDING_ONLY,
    ];
    const evidence = fittingEvidence({ size_band: "11-50", cert_status: "in_progress" });

    const run = () => {
      const fired = detectSignals({ evidence, pages }, weights());
      const verdict = computeVerdict(evidence, fired, weights(), switches());
      return JSON.stringify(verdict);
    };

    const first = run();
    const second = run();
    expect(first).toBe(second);

    const parsed = JSON.parse(first);
    expect(parsed.verdict).toBe("SEND");
    expect(typeof parsed.timing_score).toBe("number");
    expect(parsed.rule_fired).toBe("R-20");
  });

  it("produces the same signal order regardless of the order pages were fetched in", () => {
    const evidence = fittingEvidence({ size_band: "11-50" });
    const pages = [PAGE_CAREERS_SECURITY_ROLE, PAGE_PRICING_ENTERPRISE, PAGE_ENTERPRISE_LOGOS];

    const forward = detectSignals({ evidence, pages }, weights()).map((s) => s.signal_id);
    const reversed = detectSignals({ evidence, pages: [...pages].reverse() }, weights()).map(
      (s) => s.signal_id,
    );
    expect(forward).toEqual(reversed);
  });

  it("sorts the board identically no matter how the rows arrive", () => {
    const rows = [
      { domain: "d.com", timing_score: 55, independent_signals: 2 },
      { domain: "a.com", timing_score: 55, independent_signals: 2 },
      { domain: "c.com", timing_score: 70, independent_signals: 2 },
      { domain: "b.com", timing_score: 55, independent_signals: 3 },
    ];
    const forward = [...rows].sort(compareForBoard).map((r) => r.domain);
    const reversed = [...rows].reverse().sort(compareForBoard).map((r) => r.domain);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(["c.com", "b.com", "a.com", "d.com"]);
  });

  it("selects the same contact from the same candidate pool every time", () => {
    const pool = [
      { first_name: "A", last_name: "X", position: "CTO", seniority: "executive", department: "it", email: "a@e.com", confidence: 90, type: "personal" },
      { first_name: "B", last_name: "Y", position: "Head of Security", seniority: "senior", department: "it", email: "b@e.com", confidence: 90, type: "personal" },
    ];
    const first = selectContact(pool, "51-200");
    const second = selectContact(pool, "51-200");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
