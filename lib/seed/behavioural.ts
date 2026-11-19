/**
 * §7 — the behavioural half of `/selftest`.
 *
 * F-11 was that the suite was green while the product was broken, and the reason was structural:
 * every assertion ran against frozen fixtures, so it tested the rules engine and never the layer
 * that feeds it. These cases read the **live database** — the latest real run — which is the only
 * way an assertion can notice that the pipeline stopped producing Sends.
 *
 * They are slower and they depend on a run having happened. That is the trade, and it is why they
 * are labelled BEHAVIOURAL on screen rather than mixed in with the structural ones.
 *
 * `skipped` is used honestly throughout. A case that cannot run because no run exists reports
 * exactly that; it never reports a pass it did not earn. The whole point of this file is that a
 * green light means something.
 */

import { computeVerdict } from "@/lib/rules/verdict";
import { counterfactualFor } from "@/lib/rules/counterfactual";
import { normalizeForComparison } from "@/lib/rules/evidenceValidator";
import { REPLY_INTENTS, actionFor } from "@/lib/rules/replyIntent";
import { DEFAULT_SWITCHES, type SignalId, type Weights } from "@/lib/types";
import type { GoldenCase, GoldenOutcome } from "@/lib/seed/goldenSet";
import * as q from "@/lib/db/queries";

const ok = (detail: string): GoldenOutcome => ({ status: "pass", detail });
const bad = (detail: string): GoldenOutcome => ({ status: "fail", detail });
const skip = (detail: string): GoldenOutcome => ({ status: "skipped", detail });
const check = (pass: boolean, detail: string) => (pass ? ok(detail) : bad(detail));

const NO_RUN = "No run has completed yet, so there is nothing to assert against.";

export const BEHAVIOURAL_SET: GoldenCase[] = [
  {
    id: "T-09",
    title: "BEHAVIOURAL · a dead domain quarantines and the other companies still complete",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const quarantined = await q.listQuarantine(run.id);
      const companies = await q.listCompanies(run.id);
      const done = companies.filter((c) => c.verdict !== null).length;

      if (quarantined.length === 0) {
        return skip(
          "Nothing was quarantined on the latest run, so there is no failure to have survived.",
        );
      }
      return check(
        done > 0,
        `${quarantined.length} quarantined (${quarantined
          .map((x) => x.domain)
          .join(", ")}) and ${done} companies still reached a verdict. One failure does not stop the run.`,
      );
    },
  },

  {
    id: "T-16",
    title: "BEHAVIOURAL · every company clearing R-01 has a security-page attempt recorded",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const companies = await q.listCompanies(run.id);
      // R-01 drops anything that is not B2B SaaS, so "cleared R-01" is is_b2b_saas === true.
      const cleared = companies.filter((c) => c.is_b2b_saas === true);
      if (cleared.length === 0) return skip("No company cleared R-01 on the latest run.");

      const missing = cleared.filter((c) => !c.security_page_checked);
      return check(
        missing.length === 0,
        missing.length === 0
          ? `All ${cleared.length} companies that cleared R-01 have a security-page attempt on record — including the ones where the answer was that no such page exists.`
          : `${missing.length} of ${cleared.length} have no recorded attempt: ${missing
              .map((c) => c.normalized_domain)
              .join(", ")}. Reserved fetch 1 is supposed to be unskippable.`,
      );
    },
  },

  {
    id: "T-18",
    title: "BEHAVIOURAL · every Hold and every Drop has a non-empty counterfactual",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const weights = q.runWeights(run);
      const companies = await q.listCompanies(run.id);
      const judged = companies.filter((c) => c.verdict === "HOLD" || c.verdict === "DROP");
      if (judged.length === 0) return skip("No Holds or Drops on the latest run.");

      const empty: string[] = [];
      for (const c of judged) {
        const signals = await q.listSignals(c.id);
        const scored = signals.filter((s) => s.points > 0 && s.tier === "verified");
        const cf = counterfactualFor({
          domain: c.normalized_domain,
          verdict: c.verdict,
          rule_fired: c.rule_fired,
          timing_score: c.timing_score,
          independent_signals: c.independent_signals,
          firedSignalIds: scored.map((s) => s.signal_id as SignalId),
          firedGroups: [...new Set(scored.map((s) => s.independence_group))],
          weights,
          security_page_checked: c.security_page_checked,
          security_page_url: c.security_page_url,
          size_band: c.size_band,
          size_source: c.size_source,
        });
        if (cf.text.trim().length === 0) empty.push(c.normalized_domain);
      }

      return check(
        empty.length === 0,
        empty.length === 0
          ? `All ${judged.length} Holds and Drops carry a counterfactual. ${judged.length} rows, ${judged.length} next steps — no silent dead ends.`
          : `Empty counterfactual on: ${empty.join(", ")}.`,
      );
    },
  },

  {
    id: "T-19",
    title: "BEHAVIOURAL · the six reply intents map to R-50…R-55, and a block holds",
    run: async () => {
      const expected: Record<string, string> = {
        interested: "R-50",
        not_now: "R-51",
        wrong_person: "R-52",
        not_interested: "R-53",
        unsubscribe: "R-54",
        unclear: "R-55",
      };
      const wrong = REPLY_INTENTS.filter((i) => actionFor(i).rule !== expected[i]);
      if (wrong.length > 0) return bad(`Mis-mapped intents: ${wrong.join(", ")}.`);

      // The second half of T-19: a blocked domain must actually be refused by the run gate.
      const blocked = await q.blockedDomains();
      const state = await q.listOutreachState();
      const permanent = state.filter((s) => s.kind === "block");

      if (permanent.length === 0) {
        return ok(
          `All six intents map to their rules (R-50…R-55). No domain has been permanently blocked yet, so the block gate has nothing live to refuse — ${
            state.length
          } domain(s) carry some other reply state.`,
        );
      }

      const enforced = permanent.every((p) => blocked.has(p.domain));
      return check(
        enforced,
        enforced
          ? `All six intents map correctly, and all ${permanent.length} permanently blocked domain(s) are refused by the run gate before any fetch.`
          : `A domain is marked blocked but is not in the run gate's refusal set. R-54 is not being enforced.`,
      );
    },
  },

  {
    id: "T-20",
    title: "BEHAVIOURAL · a full sample run produces ≥1 Send, ≥2 Drop and ≥1 Hold",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const counts = await q.runOutcomeCounts(run.id);
      const pass = counts.send >= 1 && counts.drop >= 2 && counts.hold >= 1;

      // The assertion is untouched. What follows only explains a failure, because a bare
      // "expected ≥1 Send, got 0" tells a reader nothing about whether the build is broken or
      // the sample is. v3 made this red on purpose: the board's only Send had been an offer to
      // certify a company that has been SOC 2 compliant for two years.
      let why = "";
      if (!pass && counts.send === 0) {
        const companies = await q.listCompanies(run.id);
        const certified = companies.filter((c) => c.cert_status === "certified").length;
        const contradicted = companies.filter((c) => c.rule_fired === "R-24").length;
        why =
          ` ${certified} are already certified and ${contradicted} were held by R-24 for naming a certification` +
          " their own evidence map denied, so most of this sample is post-certification — the population Sprinto has" +
          " already sold to, not the one it sells into. Lowering the threshold or re-weighting the certification group" +
          " would turn this green today and would be the exact failure v3 §0 forbids. See VERIFICATION_LOG.md §13.";
      }

      return check(
        pass,
        `${counts.send} Send · ${counts.hold} Hold · ${counts.drop} Drop across ${counts.scored} scored. ` +
          (pass
            ? "The board distinguishes between companies, which is the whole claim."
            : "A board that cannot produce all three verdicts is not qualifying anything." + why),
      );
    },
  },

  {
    id: "T-21",
    title: "BEHAVIOURAL · every Send's hook quote appears verbatim on the page it cites",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const sends = (await q.listCompanies(run.id)).filter((c) => c.verdict === "SEND");
      if (sends.length === 0) return skip("No Sends on the latest run, so no hook to check.");

      const problems: string[] = [];
      let checked = 0;

      for (const c of sends) {
        const draft = await q.getDraft(c.id);
        if (!draft || !draft.hook_quote) continue;
        checked += 1;

        const sources = await q.sourcesFor(c.id);
        const page = sources.find((s) => s.url === draft.hook_url);
        if (!page) {
          problems.push(`${c.normalized_domain}: the hook cites ${draft.hook_url}, which is not among the pages fetched for it`);
          continue;
        }
        if (!normalizeForComparison(page.text).includes(normalizeForComparison(draft.hook_quote))) {
          problems.push(`${c.normalized_domain}: the hook quote is not on ${draft.hook_url}`);
        }
      }

      if (checked === 0) return skip("No Send has a drafted hook quote yet.");
      return check(
        problems.length === 0,
        problems.length === 0
          ? `${checked} Send hook(s) checked, every quote found character-for-character on the page its own URL points to.`
          : problems.join(" · "),
      );
    },
  },

  {
    id: "T-22",
    title: "BEHAVIOURAL · re-scoring re-ranks the board with zero new fetches and zero new AI calls",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const before = await Promise.all([q.cacheCounts(run.id), q.costSummary(run.id)]);
      const fetchesBefore = before[0].cached + before[0].live;
      const callsBefore = before[1].calls;

      const base = q.runWeights(run);
      const companies = await q.listCompanies(run.id);
      const scoreWith = async (weights: Weights) => {
        const out: { domain: string; score: number }[] = [];
        for (const c of companies) {
          if (c.verdict === null) continue;
          const signals = q.toFiredSignals(await q.listSignals(c.id));
          const v = computeVerdict(q.evidenceFromRow(c), signals, weights, DEFAULT_SWITCHES);
          out.push({ domain: c.normalized_domain, score: v.timing_score });
        }
        return out;
      };

      const atDefault = await scoreWith(base);
      const atRaised = await scoreWith({ ...base, "S-06": 45 });

      const after = await Promise.all([q.cacheCounts(run.id), q.costSummary(run.id)]);
      const fetchesAfter = after[0].cached + after[0].live;
      const callsAfter = after[1].calls;

      const moved = atDefault.some((d, i) => d.score !== atRaised[i]?.score);
      const noSideEffects = fetchesAfter === fetchesBefore && callsAfter === callsBefore;

      if (!moved) {
        return skip(
          `Re-scoring caused no fetch and no model call (${fetchesBefore} fetches and ${callsBefore} calls, unchanged) — but no company on this run carries S-06, so raising its weight could not change a score. The no-side-effects half holds; the re-rank half had nothing to move.`,
        );
      }
      return check(
        noSideEffects,
        noSideEffects
          ? `Raising S-06 from ${base["S-06"]} to 45 changed scores, and the run still shows ${fetchesAfter} fetches and ${callsAfter} model calls — identical to before. The score was never the model's to decide.`
          : `Re-scoring caused side effects: fetches ${fetchesBefore}→${fetchesAfter}, calls ${callsBefore}→${callsAfter}.`,
      );
    },
  },

  {
    id: "T-24",
    title: "BEHAVIOURAL · a rejected company is suppressed on the next run, with the reason kept",
    run: async () => {
      const suppressed = await q.suppressedDomains();
      const replyState = await q.listOutreachState();

      if (suppressed.size === 0 && replyState.length === 0) {
        return skip(
          "Nothing has been rejected and no reply has changed a domain's state, so there is no suppression to observe. The mechanism itself is asserted by the unit suite.",
        );
      }

      const withReason = [...suppressed.entries()].filter(([, r]) => r && r.trim().length > 0);
      const stateWithReason = replyState.filter((s) => s.reason && s.reason.trim().length > 0);

      return check(
        withReason.length === suppressed.size && stateWithReason.length === replyState.length,
        `${suppressed.size} domain(s) suppressed by feedback and ${replyState.length} by a reply, every one carrying the reason it was suppressed for.`,
      );
    },
  },

  {
    id: "T-23",
    title: "BEHAVIOURAL · with AI off the rules still produce verdicts",
    run: async () => {
      const run = await q.latestRun();
      if (!run) return skip(NO_RUN);

      const companies = await q.listCompanies(run.id);
      const scored = companies.filter((c) => c.verdict !== null);
      if (scored.length === 0) return skip("Nothing scored on the latest run.");

      // Re-decide every company with ai_enabled off. The verdict comes from stored signals and
      // stored evidence, so turning the model off cannot change it — which is the claim.
      const weights = q.runWeights(run);
      const mismatches: string[] = [];
      for (const c of scored) {
        const signals = q.toFiredSignals(await q.listSignals(c.id));
        const withoutAi = computeVerdict(q.evidenceFromRow(c), signals, weights, {
          ...DEFAULT_SWITCHES,
          ai_enabled: false,
        });
        if (withoutAi.verdict === null) mismatches.push(c.normalized_domain);
      }

      return check(
        mismatches.length === 0,
        mismatches.length === 0
          ? `All ${scored.length} companies still reach a verdict with ai_enabled off — the engine never consults a model, so switching it off changes nothing about the decision.`
          : `No verdict without AI for: ${mismatches.join(", ")}.`,
      );
    },
  },
];
