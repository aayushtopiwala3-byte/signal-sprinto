import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractSchema, NOT_STATED_LITERAL } from "@/lib/ai/prompts/extract";
import { MIN_QUOTE_CHARS } from "@/lib/rules/evidenceValidator";

/**
 * T-15 — a populated Evidence Map field with no quote fails Zod and triggers exactly one retry.
 *
 * The HTTP layer is stubbed, so the test measures the retry policy rather than Gemini's mood.
 * The grounding rule itself is asserted directly against the schema first: if it only held
 * because of a prompt instruction, the retry would be papering over a convention.
 */

const GOOD_QUOTE = "We build compliance automation software for other software businesses.";

function geminiResponse(payload: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const UNQUOTED = {
  is_b2b_saas: { value: "true", quote: "" },
  cert_status: { value: NOT_STATED_LITERAL, quote: "" },
  size_band: { value: NOT_STATED_LITERAL, quote: "" },
  is_services: { value: "false", quote: GOOD_QUOTE },
  pressure_signals: [],
};

const QUOTED = { ...UNQUOTED, is_b2b_saas: { value: "true", quote: GOOD_QUOTE } };

describe("T-15 · grounding is enforced by the schema, not by the prompt", () => {
  it("rejects a populated field whose quote is missing", () => {
    const parsed = ExtractSchema.safeParse(UNQUOTED);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("without a verbatim quote");
  });

  it("rejects a quote shorter than the minimum, so a one-word alibi does not count", () => {
    const parsed = ExtractSchema.safeParse({
      ...UNQUOTED,
      is_b2b_saas: { value: "true", quote: "x".repeat(MIN_QUOTE_CHARS - 1) },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts `not stated` with no quote — absence needs no evidence", () => {
    expect(ExtractSchema.safeParse({ ...UNQUOTED, is_b2b_saas: { value: NOT_STATED_LITERAL, quote: "" } }).success).toBe(true);
  });

  it("accepts a populated field that carries its quote", () => {
    expect(ExtractSchema.safeParse(QUOTED).success).toBe(true);
  });

  // Both of these came off the live model and cost a retry each before being normalised.
  it("reads a null quote as absent rather than as a type error", () => {
    const parsed = ExtractSchema.safeParse({
      ...UNQUOTED,
      is_b2b_saas: { value: NOT_STATED_LITERAL, quote: null },
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a null quote on a populated field — notation changed, the rule did not", () => {
    const parsed = ExtractSchema.safeParse({
      ...UNQUOTED,
      is_b2b_saas: { value: "true", quote: null },
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("without a verbatim quote");
  });

  it("accepts a JSON boolean where the shape asked for a quoted string", () => {
    const parsed = ExtractSchema.safeParse({
      ...UNQUOTED,
      is_b2b_saas: { value: true, quote: GOOD_QUOTE },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.is_b2b_saas.value).toBe("true");
  });
});

describe("T-15 · exactly one retry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.OPENROUTER_API_KEY;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("retries once when the first response is unquoted, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(geminiResponse(UNQUOTED))
      .mockResolvedValueOnce(geminiResponse(QUOTED));

    const { aiCall } = await import("@/lib/ai/call");
    const result = await aiCall({
      callName: "AI-1 extract",
      prompt: `T-15 retry fixture ${Date.now()}`,
      schema: ExtractSchema,
      runId: null,
      companyId: null,
      aiEnabled: true,
      budgetExhausted: false,
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("feeds the rejection reason back into the retry rather than re-asking blind", async () => {
    fetchMock
      .mockResolvedValueOnce(geminiResponse(UNQUOTED))
      .mockResolvedValueOnce(geminiResponse(QUOTED));

    const { aiCall } = await import("@/lib/ai/call");
    await aiCall({
      callName: "AI-1 extract",
      prompt: `T-15 feedback fixture ${Date.now()}`,
      schema: ExtractSchema,
      runId: null,
      companyId: null,
      aiEnabled: true,
      budgetExhausted: false,
    });

    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as {
      contents: { parts: { text: string }[] }[];
    };
    expect(retryBody.contents[0].parts[0].text).toContain("without a verbatim quote");
  });

  it("gives up after the retry instead of looping, and says so", async () => {
    fetchMock
      .mockResolvedValueOnce(geminiResponse(UNQUOTED))
      .mockResolvedValueOnce(geminiResponse(UNQUOTED));

    const { aiCall } = await import("@/lib/ai/call");
    const result = await aiCall({
      callName: "AI-1 extract",
      prompt: `T-15 giveup fixture ${Date.now()}`,
      schema: ExtractSchema,
      runId: null,
      companyId: null,
      aiEnabled: true,
      budgetExhausted: false,
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(!result.ok && result.reason).toContain("rules-only");
  });
});
