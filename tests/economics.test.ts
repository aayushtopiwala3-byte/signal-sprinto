import { describe, expect, it } from "vitest";
import { DEFAULT_BASELINE_MINUTES, ESTIMATE_DISCLAIMER } from "@/components/Economics";

/**
 * §6.4. The panel's arithmetic is trivial; what is worth protecting is the line between what
 * was measured and what was assumed, because that line is the only thing separating this from
 * a ROI claim.
 */

describe("§6.4 · the estimate is labelled as one", () => {
  it("carries the required sentence verbatim", () => {
    expect(ESTIMATE_DISCLAIMER).toBe(
      "The measured numbers above come from the run's own ledger. The saved-time figure is an estimate built on the baseline you can edit — it is an assumption, not a measurement.",
    );
  });

  it("names the ledger as the source of the measured half", () => {
    expect(ESTIMATE_DISCLAIMER).toContain("run's own ledger");
  });

  it("says plainly that the saved-time number is not a measurement", () => {
    expect(ESTIMATE_DISCLAIMER).toContain("an assumption, not a measurement");
  });

  it("defaults the manual baseline to the 15 minutes §6.4 specifies", () => {
    expect(DEFAULT_BASELINE_MINUTES).toBe(15);
  });
});
