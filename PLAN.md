# Signal — Build Plan

Outbound qualification & drafting agent for Sprinto. Built from `BUILD_PROMPT.md`.

Two invariants that govern every file below:

1. **Rules decide, AI explains.** Every verdict, score, gate and completeness check is plain
   TypeScript in `lib/rules/`. The model is called at exactly four points (§6) and never asked
   to decide anything.
2. **Never fabricate.** Every claim rendered to a user traces to a verbatim quote plus a live
   URL, or renders the literal string `not stated`.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript strict | Vercel target, server actions + route handlers |
| Styling | Tailwind v4 + hand-rolled shadcn-style primitives | no interactive `shadcn init` in a scripted build |
| DB | Postgres — Neon via `postgres.js` in prod, **PGlite in-memory for local/test** | app must boot and tests must run with zero credentials |
| Validation | Zod | AI output contracts (§6) |
| Tests | Vitest | fast, native TS/ESM |
| AI | Gemini Flash pinned in `lib/ai/model.ts`, OpenRouter as transport fallback | §2.1 non-negotiable |

The DB adapter exposes one tagged-template `sql` and swaps driver by `DATABASE_URL`. PGlite is a
dev/test convenience only — `/health` shows a loud banner when it is active, because an in-memory
database on Vercel resets per lambda invocation.

## 2. Data model

Exactly the 12 tables from §8, verbatim, in `lib/db/schema.sql`:

`runs · companies · fetches · loop_trace · signals · contacts · pain_points · drafts · sends ·
feedback · cost_ledger · quarantine · settings`

The four Evidence Map fields live as **nullable columns on `companies`**, each with a companion
`*_evidence_json` column, so emptiness is a database fact rather than a model opinion. A field
populated without evidence is rejected by Zod and the extraction retries.

## 3. File tree

```
app/
  layout.tsx                   footer renders resolveModelId() on every page
  page.tsx                     decision board: Send / Hold / Drop + controls + empty state
  company/[id]/page.tsx        verdict → signals → loop trace → contact → pain points → draft
  quarantine/page.tsx          every refused domain with its reason code
  health/page.tsx              model id, Hunter quota, cost ledger, cache hits, staleness
  selftest/page.tsx            golden set, green/red per assertion
  api/run/start/route.ts       creates run, normalises + dedupes + quarantines
  api/run/step/route.ts        ONE domain per call — the §7.2 timeout defence
  api/run/[id]/route.ts        board state poll
  api/send/route.ts            to: forced from env, ignores any body recipient
  api/feedback/route.ts        approve / edit / reject + reason
  api/selftest/route.ts
  api/rerank/route.ts          weight changes, recompute from stored signals, zero fetches
lib/
  env.ts                       hard-required vs degradable, named startup failure
  ai/model.ts                  pinned id + runtime guard + resolveModelId()
  ai/call.ts                   JSON call, Zod, 1 retry w/ error appended, OpenRouter, cache, ledger
  ai/prompts/{extract,nextPage,painPoints,draft}.ts
  fetch/{normalizeDomain,robots,tiers,clean}.ts
  rules/{fit,signals,verdict,poc,evidenceValidator}.ts
  pipeline/{runCompany,loop,completeness}.ts
  hunter/client.ts             limit=5, department filter, cache, 80% quota guard
  mail/{gmail,resend,send}.ts
  db/{schema.sql,client.ts,queries.ts}
  seed/{sampleDomains,seededContacts,goldenSet}.ts
tests/
  normalize · rules · determinism · evidenceValidator · poc · loop · send · fixtures/
```

## 4. Pipeline (§7.1) — one domain per HTTP request

```
① robots gate        disallow/unreachable → QUARANTINE before any page fetch
② fetch tier 1       plain GET, 8s, browser UA
   fetch tier 2      r.jina.ai if tier 1 < 200 clean words  (skipped if reader_enabled=off)
   fetch tier 3      stop → QUARANTINE, named reason
③ clean              strip nav/footer/script/style, drop blocks < 8 words, dedupe, cap 2k tokens
④ AI-1 extract       Evidence Map fields + per-field { quote, url }
⑤ completeness       PLAIN CODE counts nulls. The model is never asked "is this enough?"
⑥ loop or score      gaps && fetches_used < 4 ? AI-2 suggests + code decides : rules
⑦ rules engine       FIT gate → TIMING stack → verdict
⑧ Hunter + ladder    only for companies that cleared FIT
⑨ AI-3 pain points   each with a verbatim quote, validated in code
⑩ AI-4 draft         then evidence validator: hook quote absent from source ⇒ cannot send
```

`MAX_EXTRA_FETCHES = 4`, a constant, never dynamic. At the cap the answer is a handoff, not
"try harder": verdict HOLD with the still-empty field named and `4/4 fetches used`.

Every loop iteration writes a `loop_trace` row (empty fields, chosen URL, why, chosen_by,
fields filled). It renders on the company page as *"How it decided what to read next"* — the only
visible difference between this and a fixed pipeline.

## 5. Decision logic

FIT gate R-01…R-04 (binary, fail ⇒ DROP) → TIMING signals S-01…S-07 (additive, each needs
evidence) → verdict from `timing_score` and `independent_signals`:

```
SEND  score >= 50 AND independent groups >= 2
HOLD  score >= 50 AND groups < 2        R-21: only 1 independent signal
HOLD  20 <= score < 50                  R-20: timing score X, below 50
DROP  score < 20                        R-20: fit passed, no timing signal
```

`is_b2b_saas === null` after the cap ⇒ **HOLD, never DROP**. We do not drop a company for a fact
we failed to find. S-01 and S-02 share the `certification` group on purpose so two readings of one
page cannot manufacture a second independent signal.

No `Math.random()` and no `Date.now()` anywhere under `lib/rules/` — enforced by a test.

## 6. Phase order

1. Skeleton + env guard + model guard + schema + empty states + **deploy**
2. Fetch, clean, normalise, robots, quarantine — T-01, T-02, T-08, T-09
3. **Rules engine and its tests before any AI call exists** — T-03…T-07, T-11, T-14 — **deploy**
4. AI-1 + the loop controller + trace + cap — T-12, T-15
5. Hunter + PoC ladder + quota guard + seeded fallback — T-11
6. AI-3, AI-4, evidence validator — T-10, T-21
7. Send: Gmail → Resend → fail loudly, transport recorded — T-13
8. Board polish, search/filter/sort, fail-safe banners, feedback, sliders, switches — T-22…T-24
9. `/selftest` + `/health`
10. README + Components Map + judge path — T-20, T-25, T-26

Phases 1–3 require no credentials at all. Phases 4–7 degrade to a visible banner when their key
is absent rather than failing, except `GMAIL_SEND_TO` which is hard-required because the locked
recipient is a §2 non-negotiable.
