import { runCostUsd, aiCall } from "@/lib/ai/call";
import { PainPointsSchema, buildPainPointsPrompt } from "@/lib/ai/prompts/painPoints";
import { DraftSchema, buildDraftPrompt } from "@/lib/ai/prompts/draft";
import { checkRobots } from "@/lib/fetch/robots";
import { fetchPage, type FetchOutcome } from "@/lib/fetch/tiers";
import { extractWithAi, extractWithRules } from "@/lib/pipeline/extract";
import { MAX_EXTRA_FETCHES, emptyFields, shouldContinue } from "@/lib/pipeline/completeness";
import { chooseNextUrl } from "@/lib/pipeline/loop";
import { findContacts } from "@/lib/hunter/client";
import { evaluateFit } from "@/lib/rules/fit";
import { detectSignals, type PageRecord } from "@/lib/rules/signals";
import { computeVerdict } from "@/lib/rules/verdict";
import type { VerdictResult } from "@/lib/types";
import { selectContact, isGeneric, displayName } from "@/lib/rules/poc";
import { validateDraft, validatePainPoints } from "@/lib/rules/evidenceValidator";
import { NOT_STATED, type EvidenceMap, type LoopField, type SizeBand } from "@/lib/types";
import * as q from "@/lib/db/queries";

/**
 * ①–⑩ for exactly one domain (§7.1). One company per HTTP request, so no handler ever
 * approaches Vercel's 10-second limit (§7.2).
 *
 * Every step persists before the next begins. A crash in ⑨ still leaves the verdict, the
 * fetches and the loop trace on disk, which is the difference between a partial run and a
 * lost one.
 */

/** A safety valve, not a spec requirement (D-16). Past this, AI calls short-circuit. */
export const RUN_BUDGET_USD = 1.0;

/**
 * Vercel kills the invocation at `maxDuration` and nothing after that point runs — a real run
 * lost apty.io exactly that way, mid-loop, with no verdict and no trace of why. The handler
 * therefore watches its own clock and stops opening new pages while enough time remains to
 * score, look up a contact and write the draft.
 *
 * Stopping early costs evidence, and missing evidence is already a first-class outcome here:
 * R-22 turns it into a HOLD that names the fields still `not stated`. A partial answer that says
 * what it does not know beats a killed handler that says nothing.
 */
const HANDLER_BUDGET_MS = 55_000;
/** Reserved for ⑦–⑩: Hunter plus the two remaining model calls. */
const TAIL_RESERVE_MS = 25_000;
/** Rough cost of one Gemini call, used to decide whether ⑨ and ⑩ still fit. */
const AI_CALL_RESERVE_MS = 8_000;

/** Exported for the test; `elapsed` is injected rather than read from the clock. */
export function timeLeftMs(elapsedMs: number): number {
  return HANDLER_BUDGET_MS - elapsedMs;
}

export function loopMayContinue(elapsedMs: number): boolean {
  return timeLeftMs(elapsedMs) > TAIL_RESERVE_MS;
}

/**
 * The two verdict overrides that sit outside the rules engine because they depend on how the
 * run went rather than on what the pages said. Exported so `/api/rerank` applies exactly the
 * same ones when weights change, instead of a second implementation that could drift (T-22).
 *
 * - R-22: fit passed but a field the verdict leans on is still unknown at the fetch cap (D-17).
 * - R-30: fit passed but every contact Hunter returned is a generic mailbox (D-18).
 */
export function applyHandoffRules(
  result: VerdictResult,
  ctx: {
    fitPass: boolean;
    missing: readonly string[];
    fetchesUsed: number;
    hasNamedContact: boolean;
  },
): VerdictResult {
  if (!ctx.fitPass) return result;

  if (ctx.missing.length > 0 && result.verdict !== "HOLD") {
    return {
      ...result,
      verdict: "HOLD",
      rule_fired: "R-22",
      verdict_reason: `R-22: ${ctx.fetchesUsed}/${MAX_EXTRA_FETCHES} fetches used and ${ctx.missing.join(", ")} still ${NOT_STATED} — handing off rather than guessing`,
    };
  }

  if (!ctx.hasNamedContact && result.verdict === "SEND") {
    return {
      ...result,
      verdict: "HOLD",
      rule_fired: "R-30",
      verdict_reason:
        "R-30: no named contact available — there is nobody to send to, so this cannot be a Send",
    };
  }

  return result;
}

export type RunCompanyResult = {
  companyId: string;
  domain: string;
  status: "done" | "quarantined" | "error";
  verdict: string | null;
  fetchesUsed: number;
  note: string | null;
};

/** Persist every tier attempt, attaching the cleaned text to the one that won. */
async function recordFetch(companyId: string, outcome: FetchOutcome): Promise<void> {
  const winningIndex = outcome.page
    ? outcome.attempts.findIndex((a) => a.ok && a.tier === outcome.tier)
    : -1;

  for (let i = 0; i < outcome.attempts.length; i++) {
    const attempt = outcome.attempts[i];
    await q.insertFetch({
      companyId,
      url: attempt.url,
      tier: attempt.tier,
      statusCode: attempt.status_code,
      wordCount: attempt.word_count,
      ok: attempt.ok,
      error: attempt.error,
      cleanText: i === winningIndex ? (outcome.page?.text ?? null) : null,
    });
  }
}

export async function runCompany(companyId: string): Promise<RunCompanyResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const company = await q.getCompany(companyId);
  if (!company) throw new Error(`Company ${companyId} not found`);

  const run = await q.getRun(company.run_id);
  if (!run) throw new Error(`Run ${company.run_id} not found`);

  const weights = q.runWeights(run);
  const switches = q.runSwitches(run);
  const domain = company.normalized_domain;

  const spentUsd = await runCostUsd(run.id);
  const budgetExhausted = spentUsd >= RUN_BUDGET_USD;
  const ai = { runId: run.id, companyId, aiEnabled: switches.ai_enabled, budgetExhausted };

  const quarantine = async (code: string, text: string): Promise<RunCompanyResult> => {
    await q.insertQuarantine({ runId: run.id, domain, reasonCode: code, reasonText: text });
    await q.quarantineCompany(companyId);
    return { companyId, domain, status: "quarantined", verdict: null, fetchesUsed: 0, note: text };
  };

  try {
    /* ① robots.txt gate — before any page fetch, so a disallow costs zero requests (T-08). */
    await q.setStage(companyId, "robots");
    const robots = await checkRobots(domain);
    if (!robots.allowed) {
      return await quarantine(robots.reason_code, robots.reason_text);
    }

    /* ② + ③ homepage, through the tier ladder and the cleaner. */
    await q.setStage(companyId, "fetch");
    const homeUrl = `https://${domain}/`;
    const home = await fetchPage(homeUrl, { readerEnabled: switches.reader_enabled });
    await recordFetch(companyId, home);

    if (!home.page) {
      return await quarantine(
        home.reason_code ?? "fetch_failed",
        home.reason_text ?? "the homepage could not be fetched at any tier",
      );
    }

    const pages: PageRecord[] = [
      { url: homeUrl, text: home.page.text, title: home.page.title },
    ];
    let candidates = home.page.links;
    const fetchedUrls = [homeUrl];

    /* ④ extraction over the homepage. */
    await q.setStage(companyId, "extract");
    let evidence: EvidenceMap = q.evidenceFromRow(company);
    let first = switches.ai_enabled
      ? await extractWithAi({
          domain,
          url: homeUrl,
          text: home.page.text,
          current: evidence,
          emptyFields: emptyFields(evidence),
          ...ai,
        })
      : {
          ...extractWithRules(homeUrl, home.page.text, evidence),
          fallbackReason: "ai_enabled switch is off",
          attempts: 0,
        };
    evidence = first.evidence;

    await q.insertLoopTrace({
      companyId,
      iteration: 0,
      emptyFields: emptyFields(q.evidenceFromRow(company)),
      chosenUrl: homeUrl,
      chosenReason: "the pipeline always starts at the homepage",
      chosenBy: "start",
      fetchOk: true,
      fieldsFilled: first.filled,
    });
    await q.saveEvidence(companyId, evidence);

    /* ⑤ + ⑥ the loop. Plain code decides whether to go again; AI-2 only suggests where. */
    await q.setStage(companyId, "loop");
    let fetchesUsed = 0;
    let iteration = 1;

    for (;;) {
      const verdictOnContinuing = shouldContinue(evidence, fetchesUsed);
      if (!verdictOnContinuing.continue) break;

      const missing = verdictOnContinuing.missing;

      if (!loopMayContinue(elapsed())) {
        // Recorded rather than silent: the trace is the audit panel a reader uses to see how the
        // loop decided, and "it ran out of time" is a decision they are entitled to see.
        await q.insertLoopTrace({
          companyId,
          iteration,
          emptyFields: missing,
          chosenUrl: null,
          chosenReason: `stopped after ${Math.round(elapsed() / 1000)}s — not enough of the handler's budget left to read another page and still finish scoring, so ${missing.join(", ")} stays ${NOT_STATED}`,
          chosenBy: "deadline",
          fetchOk: null,
          fieldsFilled: null,
        });
        break;
      }

      const choice = await chooseNextUrl({
        domain,
        emptyFields: missing,
        candidates,
        alreadyFetched: fetchedUrls,
        ...ai,
      });

      if (!choice.url) {
        await q.insertLoopTrace({
          companyId,
          iteration,
          emptyFields: missing,
          chosenUrl: null,
          chosenReason: choice.reason,
          chosenBy: choice.chosen_by,
          fetchOk: null,
          fieldsFilled: null,
        });
        break;
      }

      const nextUrl = choice.url;
      fetchesUsed += 1;
      fetchedUrls.push(nextUrl);

      const outcome = await fetchPage(nextUrl, { readerEnabled: switches.reader_enabled });
      await recordFetch(companyId, outcome);

      let filled: LoopField[] = [];
      if (outcome.page) {
        pages.push({ url: nextUrl, text: outcome.page.text, title: outcome.page.title });
        // Links from deeper pages widen AI-2's shortlist on the next turn.
        candidates = [...candidates, ...outcome.page.links];

        const step = switches.ai_enabled
          ? await extractWithAi({
              domain,
              url: nextUrl,
              text: outcome.page.text,
              current: evidence,
              emptyFields: missing,
              ...ai,
            })
          : {
              ...extractWithRules(nextUrl, outcome.page.text, evidence),
              fallbackReason: "ai_enabled switch is off",
              attempts: 0,
            };
        evidence = step.evidence;
        filled = step.filled;
        await q.saveEvidence(companyId, evidence);
      }

      await q.insertLoopTrace({
        companyId,
        iteration,
        emptyFields: missing,
        chosenUrl: nextUrl,
        chosenReason: choice.reason,
        chosenBy: choice.chosen_by,
        fetchOk: Boolean(outcome.page),
        fieldsFilled: filled,
      });

      iteration += 1;
    }

    /* ⑦ rules engine. No model involved from here to the verdict. */
    await q.setStage(companyId, "score");
    const fired = detectSignals({ evidence, pages }, weights);
    const fit = evaluateFit(evidence, switches);
    const missingAtEnd = emptyFields(evidence);

    let result = applyHandoffRules(computeVerdict(evidence, fired, weights, switches), {
      fitPass: fit.pass,
      missing: missingAtEnd,
      fetchesUsed,
      // Not yet known at this point; ⑧ re-applies R-30 once Hunter has answered.
      hasNamedContact: true,
    });

    // Every signal that fired is stored, including any currently weighted to zero, so moving a
    // slider can re-rank the board from the database alone — no refetch, no model call (T-22).
    await q.replaceSignals(companyId, fired);
    await q.saveVerdict(companyId, {
      verdict: result.verdict,
      timing_score: result.timing_score,
      independent_signals: result.independent_signals,
      play: result.play,
      verdict_reason: result.verdict_reason,
      rule_fired: result.rule_fired,
      fetches_used: fetchesUsed,
      missing_fields: missingAtEnd,
    });

    // ⑧–⑩ are for companies that cleared FIT only (§7.1). Spending a Hunter credit and two
    // model calls on a company we already dropped would be money burnt on a decided question.
    if (!fit.pass) {
      return {
        companyId,
        domain,
        status: "done",
        verdict: result.verdict,
        fetchesUsed,
        note: "FIT gate not cleared — no contact lookup, no draft",
      };
    }

    /* ⑧ Hunter + the headcount-conditional ladder. */
    await q.setStage(companyId, "contacts");
    const lookup = await findContacts(domain);
    const poc = selectContact(lookup.candidates, evidence.size_band as SizeBand | null);

    if (poc.ok) {
      const chosen = new Set([poc.selected.email, poc.runnerUp?.email].filter(Boolean));
      await q.replaceContacts(companyId, [
        ...poc.ranked.map((c, i) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          position: c.position,
          seniority: c.seniority,
          department: c.department,
          email: c.email,
          confidence: c.confidence,
          hunter_type: c.type,
          ladder_rank: c.ladder_rank,
          selected: i === 0,
          lost_reason: i === 0 ? null : (poc.runnerUpLostReason ?? `ranked #${i + 1}`),
          source: lookup.source,
        })),
        ...lookup.candidates
          .filter((c) => isGeneric(c) && !chosen.has(c.email))
          .map((c) => ({
            first_name: c.first_name,
            last_name: c.last_name,
            position: c.position,
            seniority: c.seniority,
            department: c.department,
            email: c.email,
            confidence: c.confidence,
            hunter_type: c.type,
            ladder_rank: 99,
            selected: false,
            lost_reason: "generic mailbox — never selectable (R-30)",
            source: lookup.source,
          })),
      ]);
    } else {
      // R-30 with no named contact is itself a HOLD, and it overrides a SEND: there is nobody
      // to send to, so calling it a Send would be a lie the UI would have to walk back.
      await q.replaceContacts(
        companyId,
        lookup.candidates.map((c) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          position: c.position,
          seniority: c.seniority,
          department: c.department,
          email: c.email,
          confidence: c.confidence,
          hunter_type: c.type,
          ladder_rank: 99,
          selected: false,
          lost_reason: "generic mailbox — never selectable (R-30)",
          source: lookup.source,
        })),
      );

      const downgraded = applyHandoffRules(result, {
        fitPass: true,
        missing: missingAtEnd,
        fetchesUsed,
        hasNamedContact: false,
      });
      if (downgraded.verdict !== result.verdict) {
        // The ladder's own sentence is more specific than the generic R-30 text.
        result = { ...downgraded, verdict_reason: poc.reason };
        await q.saveVerdict(companyId, {
          verdict: result.verdict,
          timing_score: result.timing_score,
          independent_signals: result.independent_signals,
          play: result.play,
          verdict_reason: result.verdict_reason,
          rule_fired: result.rule_fired,
          fetches_used: fetchesUsed,
          missing_fields: missingAtEnd,
        });
      }
    }

    /* ⑨ pain points, each one re-checked against the pages we actually fetched. */
    await q.setStage(companyId, "pain");
    const sources = pages.map((p) => ({ url: p.url, text: p.text }));

    let rawPoints: { text: string; quote: string | null; url: string | null }[] = [];
    // Two model calls remain; if only one fits, the draft is the one worth keeping, since pain
    // points without a draft help nobody and the validator drops unquoted ones anyway.
    if (switches.ai_enabled && timeLeftMs(elapsed()) > 2 * AI_CALL_RESERVE_MS) {
      const painResult = await aiCall({
        callName: "AI-3 pain points",
        prompt: buildPainPointsPrompt({ domain, signals: result.fired_signals, pages: sources }),
        schema: PainPointsSchema,
        ...ai,
      });
      if (painResult.ok) rawPoints = painResult.data.pain_points;
    }
    const validatedPoints = validatePainPoints(rawPoints, sources);
    await q.replacePainPoints(
      companyId,
      validatedPoints.map((p) => ({
        text: p.text,
        quote: p.quote,
        source_url: p.source_url,
        validated: p.validated,
      })),
    );

    /* ⑩ draft, then the validator that decides whether it may ever be sent. */
    await q.setStage(companyId, "draft");
    const contactName = poc.ok ? displayName(poc.selected) : NOT_STATED;
    const contactTitle = poc.ok ? (poc.selected.position ?? poc.selected.ladder_label) : NOT_STATED;

    if (!switches.ai_enabled) {
      await q.replaceDraft(companyId, {
        subject: NOT_STATED,
        body: NOT_STATED,
        hook_quote: null,
        hook_url: null,
        validated: false,
        blocked_reason:
          "No draft: the ai_enabled switch is off. Every verdict above was produced by rules alone, but writing prose is the one step that genuinely needs the model.",
      });
    } else if (timeLeftMs(elapsed()) <= AI_CALL_RESERVE_MS) {
      await q.replaceDraft(companyId, {
        subject: NOT_STATED,
        body: NOT_STATED,
        hook_quote: null,
        hook_url: null,
        validated: false,
        blocked_reason: `No draft: this domain used ${Math.round(elapsed() / 1000)}s of the handler's budget on fetching, leaving no room to write one. The verdict and its evidence above are complete; re-running this company alone will produce the draft.`,
      });
    } else {
      const draftResult = await aiCall({
        callName: "AI-4 draft",
        prompt: buildDraftPrompt({
          domain,
          contactName,
          contactTitle,
          signals: result.fired_signals,
          painPoints: validatedPoints.map((p) => ({
            text: p.text,
            quote: p.quote,
            url: p.source_url,
          })),
          play: result.play,
          pages: sources,
        }),
        schema: DraftSchema,
        ...ai,
      });

      if (!draftResult.ok) {
        await q.replaceDraft(companyId, {
          subject: NOT_STATED,
          body: NOT_STATED,
          hook_quote: null,
          hook_url: null,
          validated: false,
          blocked_reason: `No draft: ${draftResult.reason}`,
        });
      } else {
        const check = validateDraft(draftResult.data, sources);
        await q.replaceDraft(companyId, {
          subject: draftResult.data.subject,
          body: draftResult.data.body,
          hook_quote: draftResult.data.hook_quote,
          hook_url: check.hook_url,
          validated: check.validated,
          blocked_reason: check.blocked_reason,
        });
      }
    }

    await q.setStage(companyId, "done");
    return {
      companyId,
      domain,
      status: "done",
      verdict: result.verdict,
      fetchesUsed,
      note: lookup.note,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await q.failCompany(companyId, message);
    return { companyId, domain, status: "error", verdict: null, fetchesUsed: 0, note: message };
  }
}
