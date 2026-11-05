/**
 * §2.1 non-negotiable: all AI tasks use Gemini Flash. The Claude API is not used anywhere.
 *
 * The id is a const, not an env var — "pin" means pin. The guard runs on every resolution, so a
 * future edit that swaps in a non-Gemini model fails loudly at the first AI call instead of
 * quietly changing what the footer claims.
 */

// `gemini-2.0-flash` and `gemini-2.5-flash` are both retired — the API now answers 404 with
// "no longer available", naming gemini-3.8-flash as the replacement. A floating alias such as
// `gemini-flash-latest` would dodge the next retirement but would also make the footer a claim
// about whatever Google shipped that morning, which is the opposite of pinning.
export const PINNED_MODEL_ID = "gemini-3.8-flash" as const;

/** Same pinned model, reached through OpenRouter when the direct transport fails (§6). */
export const OPENROUTER_MODEL_SLUG = "google/gemini-3.8-flash" as const;

/** Bump when any prompt text changes — it is part of the cache key, so stale hits cannot occur. */
export const PROMPT_VERSION = "v1" as const;

export class ModelGuardError extends Error {
  constructor(id: string) {
    super(
      `Model guard: resolved model id "${id}" does not start with "gemini-". ` +
        `The brief requires every AI task to run on Gemini Flash and forbids the Claude API.`,
    );
    this.name = "ModelGuardError";
  }
}

function guard(id: string): string {
  if (!id.startsWith("gemini-")) throw new ModelGuardError(id);
  return id;
}

/** The model id rendered in the footer of every page and written to every cost_ledger row. */
export function resolveModelId(): string {
  return guard(PINNED_MODEL_ID);
}

/**
 * The OpenRouter slug, guarded by mapping it back to a bare model id first, so the fallback
 * transport cannot smuggle in a different vendor.
 */
export function resolveOpenRouterSlug(): string {
  const bare = OPENROUTER_MODEL_SLUG.split("/").pop() ?? "";
  guard(bare);
  return OPENROUTER_MODEL_SLUG;
}

/** Published Gemini 3.8 Flash rates, USD per 1M tokens. Used for the cost ledger. */
export const PRICING_USD_PER_MTOK = { input: 0.825, output: 4.125 } as const;

/** Display rate for the ₹ column on /health. Static so the ledger stays deterministic. */
export const USD_TO_INR = 84 as const;

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn / 1_000_000) * PRICING_USD_PER_MTOK.input +
    (tokensOut / 1_000_000) * PRICING_USD_PER_MTOK.output
  );
}
