import { describe, it, expect } from "vitest";
import { selectContact, isGeneric, ladderFor, type HunterCandidate } from "@/lib/rules/poc";

const candidate = (patch: Partial<HunterCandidate>): HunterCandidate => ({
  first_name: "Ada",
  last_name: "Lovelace",
  position: "Engineer",
  seniority: "senior",
  department: "it",
  email: "ada@example.com",
  confidence: 80,
  type: "personal",
  ...patch,
});

describe("T-11 — generic contacts are never selected (§5.4)", () => {
  it("holds when every Hunter candidate is generic", () => {
    const result = selectContact(
      [
        candidate({ email: "info@example.com", type: "generic", first_name: null, last_name: null }),
        candidate({ email: "hello@example.com", type: "generic", first_name: null, last_name: null }),
        candidate({ email: "sales@example.com", type: "generic", first_name: null, last_name: null }),
      ],
      "51-200",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.verdict).toBe("HOLD");
      expect(result.reason).toContain("no named contact available");
      expect(result.rejectedGeneric).toBe(3);
    }
  });

  it("holds when Hunter returns nothing at all", () => {
    const result = selectContact([], "51-200");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no results");
  });

  it("excludes generics but still selects from the remaining named candidates", () => {
    const result = selectContact(
      [
        candidate({ email: "info@example.com", type: "generic" }),
        candidate({ email: "priya@example.com", position: "Head of Security", confidence: 70 }),
      ],
      "51-200",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selected.email).toBe("priya@example.com");
  });

  it("catches a role mailbox that Hunter mistyped as personal", () => {
    expect(isGeneric(candidate({ email: "hello@example.com", type: "personal" }))).toBe(true);
    expect(isGeneric(candidate({ email: "ada@example.com", type: "personal" }))).toBe(false);
  });
});

describe("R-30 — the ladder is headcount-conditional (§5.4)", () => {
  const cto = candidate({ email: "cto@example.com", position: "CTO", confidence: 60 });
  const security = candidate({
    email: "sec@example.com",
    position: "Head of Security",
    confidence: 60,
  });

  it("prefers the CTO at 11-50", () => {
    const result = selectContact([security, cto], "11-50");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selected.email).toBe("cto@example.com");
  });

  it("prefers Head of Security at 51-200", () => {
    const result = selectContact([cto, security], "51-200");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selected.email).toBe("sec@example.com");
  });

  it("prefers Head of Security at 201-500 and ranks Legal third", () => {
    const legal = candidate({ email: "gc@example.com", position: "General Counsel" });
    const result = selectContact([legal, security], "201-500");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selected.email).toBe("sec@example.com");
      expect(result.runnerUp?.email).toBe("gc@example.com");
    }
  });

  it("falls back to the 51-200 ladder on an unknown headcount (D-15)", () => {
    expect(ladderFor(null)).toEqual(ladderFor("51-200"));
  });
});

describe("the runner-up and why it lost (§5.4)", () => {
  it("reports a ladder-rank loss", () => {
    const result = selectContact(
      [
        candidate({ email: "sec@example.com", position: "Head of GRC", confidence: 50 }),
        candidate({ email: "cto@example.com", position: "CTO", confidence: 99 }),
      ],
      "51-200",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selected.email).toBe("sec@example.com");
      expect(result.runnerUpLostReason).toBe("ladder rank 2 vs 1");
    }
  });

  it("reports a confidence loss when both sit on the same rung", () => {
    const result = selectContact(
      [
        candidate({ email: "a@example.com", position: "Head of Security", confidence: 72 }),
        candidate({ email: "b@example.com", position: "Head of Compliance", confidence: 91 }),
      ],
      "51-200",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selected.email).toBe("b@example.com");
      expect(result.runnerUpLostReason).toBe("confidence 72 vs 91");
    }
  });

  it("returns a null runner-up when only one named candidate exists", () => {
    const result = selectContact([candidate({ position: "CTO" })], "11-50");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runnerUp).toBeNull();
      expect(result.runnerUpLostReason).toBeNull();
    }
  });

  it("is a total ordering, so the same response always selects the same person", () => {
    const pool = [
      candidate({ email: "b@example.com", position: "CTO", confidence: 80 }),
      candidate({ email: "a@example.com", position: "CTO", confidence: 80 }),
    ];
    const first = selectContact(pool, "11-50");
    const second = selectContact([...pool].reverse(), "11-50");
    expect(first.ok && second.ok && first.selected.email === second.selected.email).toBe(true);
  });
});
