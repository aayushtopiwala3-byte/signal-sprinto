import crypto from "node:crypto";
import type { z } from "zod";
import {
  PROMPT_VERSION,
  estimateCostUsd,
  resolveModelId,
  resolveOpenRouterSlug,
} from "@/lib/ai/model";
import { env, capability } from "@/lib/env";
import { sql, newId } from "@/lib/db/client";
import { withValidationError } from "@/lib/ai/prompts/shared";

/**
 * The single AI entry point (§6).
 *
 * Contract: cleaned text in, strict JSON out, validated with Zod. On invalid JSON or a 5xx —
 * one retry with the validation error appended, then switch transport to OpenRouter, then fall
 * back to rules-only. Never silently default. Every call is cached by
 * sha256(model + promptVersion + inputText) and written to the cost ledger.
 */

export type Transport = "gemini" | "openrouter" | "cache" | "none";

export type AiOk<T> = {
  ok: true;
  data: T;
  transport: Transport;
  cacheHit: boolean;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** How many model round-trips this took, so T-15 can assert "exactly one retry". */
  attempts: number;
};

export type AiFail = {
  ok: false;
  /** Named, never silent. Rendered on the card and written to the ledger. */
  reason: string;
  transport: Transport;
  attempts: number;
};

export type AiResult<T> = AiOk<T> | AiFail;

export type AiCallOptions<T> = {
  callName: string;
  prompt: string;
  // Input is `unknown` on purpose: we parse untrusted JSON, and binding input to T would make
  // T resolve to the pre-`.default()` shape, silently reintroducing optionality downstream.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  runId?: string | null;
  companyId?: string | null;
  /** The `ai_enabled` switch (§5.5). False short-circuits to rules-only without a request. */
  aiEnabled?: boolean;
  /** Set by the run when the cost ceiling has been reached. */
  budgetExhausted?: boolean;
};

export function cacheKey(prompt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${resolveModelId()}::${PROMPT_VERSION}::${prompt}`)
    .digest("hex");
}

/* ------------------------------------------------------------------ parsing */

/** Models wrap JSON in fences even when told not to. Recover rather than fail the call. */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("response contained no parseable JSON object");
  }
}

function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/* ---------------------------------------------------------------- transports */

type RawResponse = { text: string; tokensIn: number; tokensOut: number };

async function callGemini(prompt: string, apiKey: string): Promise<RawResponse> {
  const model = resolveModelId();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          // Temperature 0: the same page must always yield the same extraction (T-14).
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
          // Gemini 3 thinks by default, and thinking tokens are drawn from the same output
          // budget as the answer. On real page text that silently ate the whole allowance and
          // returned JSON cut off mid-object — which surfaced as a parse error rather than as
          // "you ran out of room". Extraction here is copying stated facts and their quotes,
          // so a reasoning budget buys nothing and costs both money and headroom.
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 300)}`), {
      status: response.status,
    });
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  // Say "the answer was cut off" rather than letting it reach the parser as a syntax error at
  // some character offset, which says nothing about the cause.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini hit maxOutputTokens before finishing the JSON object");
  }
  if (text.trim().length === 0) throw new Error("Gemini returned an empty candidate");

  return {
    text,
    tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
    // Thinking tokens bill at the output rate, so the ledger counts them. Leaving them out
    // would make the reported ₹ figure quietly lower than the real one.
    tokensOut:
      (json.usageMetadata?.candidatesTokenCount ?? 0) +
      (json.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function callOpenRouter(prompt: string, apiKey: string): Promise<RawResponse> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      // Still Gemini Flash — OpenRouter is a transport fallback, not a model fallback.
      model: resolveOpenRouterSlug(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 300)}`), {
      status: response.status,
    });
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = json.choices?.[0]?.message?.content ?? "";
  if (text.trim().length === 0) throw new Error("OpenRouter returned an empty choice");

  return {
    text,
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  };
}

/* ------------------------------------------------------------------- ledger */

async function ledger(entry: {
  runId: string | null;
  companyId: string | null;
  callName: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cacheHit: boolean;
  transport: Transport;
  ok: boolean;
  error: string | null;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO cost_ledger
        (id, run_id, company_id, call_name, model_id, tokens_in, tokens_out,
         cost_usd, cache_hit, transport, ok, error)
      VALUES (${newId("cost")}, ${entry.runId}, ${entry.companyId}, ${entry.callName},
              ${resolveModelId()}, ${entry.tokensIn}, ${entry.tokensOut}, ${entry.costUsd},
              ${entry.cacheHit}, ${entry.transport}, ${entry.ok}, ${entry.error})`;
  } catch {
    // A ledger write must never take down a run. The page still renders; the row is missing.
  }
}

export async function runCostUsd(runId: string): Promise<number> {
  const rows = await sql<{ total: string | number | null }>`
    SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_ledger WHERE run_id = ${runId}`;
  return Number(rows[0]?.total ?? 0);
}

/* --------------------------------------------------------------------- call */

export async function aiCall<T>(opts: AiCallOptions<T>): Promise<AiResult<T>> {
  const { callName, prompt, schema, runId = null, companyId = null } = opts;

  if (opts.aiEnabled === false) {
    return {
      ok: false,
      reason: "ai_enabled is off — running in rules-only mode.",
      transport: "none",
      attempts: 0,
    };
  }

  if (opts.budgetExhausted) {
    return {
      ok: false,
      reason: `AI_COST_CEILING_USD of $${env.costCeilingUsd().toFixed(2)} reached for this run. Stopping cleanly; completed companies are kept.`,
      transport: "none",
      attempts: 0,
    };
  }

  if (!capability.ai()) {
    return {
      ok: false,
      reason: "No GEMINI_API_KEY and no OPENROUTER_API_KEY — running in rules-only mode.",
      transport: "none",
      attempts: 0,
    };
  }

  // --- Cache --------------------------------------------------------------
  const key = cacheKey(prompt);
  try {
    const cached = await sql<{ response: string; tokens_in: number; tokens_out: number }>`
      SELECT response, tokens_in, tokens_out FROM ai_cache WHERE cache_key = ${key}`;
    if (cached.length > 0) {
      const parsed = schema.safeParse(extractJson(cached[0].response));
      if (parsed.success) {
        await ledger({
          runId,
          companyId,
          callName,
          tokensIn: cached[0].tokens_in,
          tokensOut: cached[0].tokens_out,
          costUsd: 0,
          cacheHit: true,
          transport: "cache",
          ok: true,
          error: null,
        });
        return {
          ok: true,
          data: parsed.data,
          transport: "cache",
          cacheHit: true,
          tokensIn: cached[0].tokens_in,
          tokensOut: cached[0].tokens_out,
          costUsd: 0,
          attempts: 0,
        };
      }
    }
  } catch {
    // A cache miss and a cache failure are the same thing: do the work.
  }

  // --- Attempt ladder -----------------------------------------------------
  const geminiKey = env.geminiApiKey();
  const openRouterKey = env.openRouterApiKey();

  type Attempt = { transport: Transport; prompt: string };
  const plan: Attempt[] = [];
  if (geminiKey) {
    plan.push({ transport: "gemini", prompt });
    // One retry on the same transport, with the rejection reason appended (§6).
    plan.push({ transport: "gemini", prompt: "" });
  }
  if (openRouterKey) plan.push({ transport: "openrouter", prompt: "" });

  let lastError = "no transport was available";
  let attempts = 0;

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const body = i === 0 ? prompt : withValidationError(prompt, lastError);
    attempts++;

    try {
      const raw =
        step.transport === "gemini"
          ? await callGemini(body, geminiKey!)
          : await callOpenRouter(body, openRouterKey!);

      const parsed = schema.safeParse(extractJson(raw.text));
      if (!parsed.success) {
        lastError = zodMessage(parsed.error);
        await ledger({
          runId,
          companyId,
          callName,
          tokensIn: raw.tokensIn,
          tokensOut: raw.tokensOut,
          costUsd: estimateCostUsd(raw.tokensIn, raw.tokensOut),
          cacheHit: false,
          transport: step.transport,
          ok: false,
          error: `schema: ${lastError}`,
        });
        continue;
      }

      const costUsd = estimateCostUsd(raw.tokensIn, raw.tokensOut);
      await ledger({
        runId,
        companyId,
        callName,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        costUsd,
        cacheHit: false,
        transport: step.transport,
        ok: true,
        error: null,
      });

      try {
        await sql`
          INSERT INTO ai_cache (cache_key, call_name, response, tokens_in, tokens_out)
          VALUES (${key}, ${callName}, ${raw.text}, ${raw.tokensIn}, ${raw.tokensOut})
          ON CONFLICT (cache_key) DO NOTHING`;
      } catch {
        // Caching is an optimisation, never a correctness requirement.
      }

      return {
        ok: true,
        data: parsed.data,
        transport: step.transport,
        cacheHit: false,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        costUsd,
        attempts,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await ledger({
        runId,
        companyId,
        callName,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        cacheHit: false,
        transport: step.transport,
        ok: false,
        error: lastError,
      });
    }
  }

  return {
    ok: false,
    reason: `All AI transports failed after ${attempts} attempt(s). Last error: ${lastError}. Falling back to rules-only for this step.`,
    transport: "none",
    attempts,
  };
}
