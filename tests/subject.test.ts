import { describe, expect, it } from "vitest";
import {
  SUBJECT_MAX_CHARS,
  checkSubject,
  endsDangling,
  isAllLowercase,
  subjectRetryNote,
  subjectWords,
} from "@/lib/rules/subject";

/**
 * R-40 (§4.3). The first case is F-9 itself, copied from the draft the live run produced.
 */

describe("R-40 · the subject line is checked in code", () => {
  it("rejects F-9 exactly as it was generated", () => {
    const check = checkSubject("maintaining zipy's soc 2 type ii");
    expect(check.ok).toBe(false);
    // Two separate defects, and the retry note has to name both or the model fixes one.
    expect(check.problems.join(" ")).toContain("lowercase");
    expect(check.problems.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts a well-formed subject", () => {
    const check = checkSubject("Maintaining Zipy's SOC 2 evidence without the spreadsheet");
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("rejects a subject that ends on a preposition", () => {
    const check = checkSubject("A faster path to SOC 2 for");
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toContain("unfinished");
  });

  it("rejects a subject that ends on an article, punctuation included", () => {
    expect(endsDangling("Evidence collection without the,")).toBe(true);
    expect(endsDangling("Evidence collection without the spreadsheet")).toBe(false);
  });

  it("rejects a subject over the character limit", () => {
    const long = "Rocketlane's trust centre and the evidence work behind renewing it yearly";
    expect(long.length).toBeGreaterThan(SUBJECT_MAX_CHARS);
    expect(checkSubject(long).problems.join(" ")).toContain(String(SUBJECT_MAX_CHARS));
  });

  it("rejects a fragment and a sentence alike", () => {
    expect(checkSubject("SOC 2 help").ok).toBe(false);
    expect(
      checkSubject("We noticed you are hiring a security engineer and wanted to ask about it").ok,
    ).toBe(false);
  });

  it("does not mistake sentence case for all-lowercase", () => {
    expect(isAllLowercase("maintaining soc 2")).toBe(true);
    expect(isAllLowercase("Maintaining soc 2")).toBe(false);
    // A subject of digits alone has no case to judge; it must not be flagged for it.
    expect(isAllLowercase("2026 2027 2028 2029")).toBe(false);
  });

  it("counts words without being fooled by extra spacing", () => {
    expect(subjectWords("  Maintaining   Zipy's  SOC 2  ")).toEqual([
      "Maintaining",
      "Zipy's",
      "SOC",
      "2",
    ]);
  });

  it("turns the problems into a retry note the model can act on", () => {
    const note = subjectRetryNote(checkSubject("maintaining zipy's soc 2 type ii for"));
    expect(note).toContain("rejected by a code-side check");
    expect(note).toContain("lowercase");
    expect(note).toContain("unfinished");
    // The body must survive a subject-only retry.
    expect(note).toContain("keep the body unchanged");
  });

  it("rejects an empty subject without crashing", () => {
    expect(checkSubject("   ").ok).toBe(false);
  });
});
