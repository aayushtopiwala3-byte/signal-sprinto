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

/**
 * G6 §2 A.3 — found by executing R-52 on real data, not by reading the code.
 *
 * zipy.ai's `size_band` is unknown, so the null band uses the 51–200 ladder, on which neither
 * "Founder" nor "Software Engineer" appears. Both candidates landed off-ladder at rank 99 with
 * confidence 70, and the tiebreak fell through to alphabetical email order — promoting the
 * Software Engineer. The figures below are the real Hunter rows from that run.
 */
describe("R-30 · seniority breaks a ladder tie before confidence does", () => {
  const sandesh = {
    first_name: "Sandesh",
    last_name: "Murdia",
    position: "Software Engineer",
    seniority: null,
    department: "it",
    email: "sandesh.murdia@zipy.ai",
    confidence: 70,
    type: "personal",
  };
  const vishalini = {
    first_name: "Vishalini",
    last_name: "Paliwal",
    position: "Founder",
    seniority: "executive",
    department: "executive",
    email: "vishalini.paliwal@zipy.ai",
    confidence: 70,
    type: "personal",
  };

  it("promotes the Founder over the Software Engineer when both are off-ladder", () => {
    const poc = selectContact([sandesh, vishalini], null);
    expect(poc.ok).toBe(true);
    if (poc.ok) {
      expect(poc.selected.email).toBe("vishalini.paliwal@zipy.ai");
      expect(poc.selected.ladder_rank).toBe(99);
      // Alphabetical order would have picked the other one, which is what it used to do.
      expect(poc.selected.email.localeCompare(sandesh.email)).toBeGreaterThan(0);
    }
  });

  it("an unknown seniority sorts last, not first", () => {
    const unknown = { ...sandesh, email: "aaa@zipy.ai" };
    const poc = selectContact([unknown, vishalini], null);
    // `aaa@` wins on alphabetical order and ties on confidence; seniority is what decides.
    if (poc.ok) expect(poc.selected.email).toBe("vishalini.paliwal@zipy.ai");
  });

  it("the ladder still outranks seniority — relevance before title", () => {
    const cto = {
      first_name: "Anchal",
      last_name: "Rastogi",
      position: "Chief Technology Officer",
      seniority: "executive",
      department: "it",
      email: "anchal.rastogi@zipy.ai",
      confidence: 67,
      type: "personal",
    };
    // The CTO is on the 51–200 ladder at rank 2; the Founder is off it at 99.
    const poc = selectContact([vishalini, cto], null);
    if (poc.ok) {
      expect(poc.selected.email).toBe("anchal.rastogi@zipy.ai");
      expect(poc.selected.ladder_rank).toBeLessThan(99);
    }
  });

  it("seniority never rescues a generic mailbox", () => {
    const poc = selectContact(
      [
        { first_name: null, last_name: null, position: null, seniority: "executive", department: null, email: "info@zipy.ai", confidence: 99, type: "generic" },
      ],
      null,
    );
    expect(poc.ok).toBe(false);
  });
});
