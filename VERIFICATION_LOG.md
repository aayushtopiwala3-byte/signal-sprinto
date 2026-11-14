# Signal — Verification Log (G6)

Written for a reader who was not watching. Every entry names the command run, the output
observed, and a verdict: **PASS**, **FAIL** or **GAP**.

Starting commit: `1d7ca3c` (Phases 1–6 of `FIX_PROMPT.md`).

---

## §1 · Measurement discipline

`npm run build` while a dev server is running corrupts `.next` and silently kills hydration.
That invalidated a round of verification during Phase 5, so this run starts from a cold build
and every interactive observation below is taken against `npm start`, never `npm run dev`.

```
$ lsof -i :3000 -i :3001
(no output — nothing listening)

$ rm -rf ./.next ./.next-stale-1794554861
$ ls -d .next .next-stale-*
zsh: no matches found      # both removed

$ npm run build
✓ Compiled successfully
  16 routes built, including ƒ /replies and ƒ /api/reply

$ npm start                # port 3000
```

Hydration confirmed before any interactive check:

```js
// in the page, against the production server
{ hydrated: true, url: "http://localhost:3000/", title: "Signal — outbound qualification & drafting" }
```

**PASS** — the stale `.next-stale-1794554861` directory (145 MB) is also deleted, which closes
§7.6 early.

---
## §4 · Part C — four domains chosen for fit, recorded before they were fetched

G6 §4 requires the selection to be committed **before** observation, so that a bad score cannot
quietly become a reason to swap a company out. This section was written and committed to the
repository before `SAMPLE_DOMAINS` was edited and before any of the four was fetched.

ICP applied, from `G2_Stack_and_ICP.md` Part 1: *cloud-native B2B SaaS, 11–200 employees, Seed to
Series B (Series C a fading edge), whose own public pages show compliance pressure, and which does
not already run an in-house GRC function.* India or India-adjacent.

| Domain | Why it fits the ICP — written before fetching |
|---|---|
| `zluri.com` | Bengaluru. SaaS management and access governance, Series B. Sells directly to IT and security buyers, and holds customers' SSO and identity data — access review is the adjacent problem to evidence collection, so compliance pressure is structural rather than incidental. |
| `signzy.com` | Bengaluru/Mumbai. Digital KYC and onboarding for banks and NBFCs, Series B. A regulated vertical by definition — its customers are RBI-governed — and it processes identity documents. If S-07 does not fire here, S-07 is miscalibrated. |
| `everstage.com` | Chennai. Sales commission management, Series B. Handles compensation and CRM data for mid-market and enterprise RevOps teams, which is the buyer segment that sends security questionnaires. |
| `hyperverge.co` | Bengaluru. AI identity verification, Series B. Processes biometric and government-ID data for financial-services customers — about as data-sensitive as B2B SaaS gets. |

**Predictions are deliberately absent.** I do not know what any of these four publish on their
security pages. Whatever they score is recorded below unchanged. Per §4, the only legitimate
reason to remove one afterwards is a *structural* failure (robots 403, DNS death), recorded the
same way `zomato.com` was.

---

## §2 · Part A — the three paths that had never run

### A.1 · `FABRICATED` fires, visibly — **PASS**

New surface: a **"Run the fabrication drill"** button on `/selftest`, backed by
`lib/seed/fabricationDrill.ts` and `POST /api/drill`. It runs the *shipped* tiering functions
(`tierForSignal`, `applyEvidenceTiers`, `repriceSignals`, `zeroUnsupported`) over a stored
fixture — a private re-implementation would have demonstrated nothing about the real code.

The domain is `fabrication-demo.invalid`. `.invalid` is reserved by RFC 2606 and can never
resolve, so it cannot be mistaken for a company.

Observed on screen after pressing the button (production build, `npm start`):

```
This is a stored fixture, not a live company. It exists to show the check firing.

DOMAIN                      fabrication-demo.invalid
THE PAGE TEXT WE FETCHED    "Security at Fabrication Demo. We encrypt data in transit and at
                             rest, and we review access quarterly. Questions about our security
                             practices can be sent to the team through the contact form."
THE QUOTE THE MODEL CLAIMED "Fabrication Demo completed its SOC 2 Type II audit in March 2026
                             with zero exceptions."
APPEARS IN THE PAGE TEXT?   NO — NOT ON ANY PAGE FETCHED FOR THIS COMPANY
TIER ASSIGNED BY R-23       FABRICATED
                            "this quote does not appear on any page we fetched for this company"
POINTS                      +40 claimed    0 awarded
REACHES THE SCORING SET?    NO — DROPPED BEFORE SCORING   (timing score with this signal: 0)
```

The stubbed quote is deliberately plausible rather than garbled — that is the shape a real
hallucination takes: a sentence the page could have contained and did not.

**The Health counter is untouched by this.** The drill writes nothing to the database, so the
run-level counter continues to report what the real run found. Padding that counter with a
fixture would turn the best artifact in the build into a lie, which is the opposite of what A.1
is for. The screen says *"This is a stored fixture, not a live company"* in those words.

---

## §5 · Part D — the golden set, row by row

`G4_Golden_Test_Set.md` is the contract. Rows that can be forced deterministically are asserted
in `tests/goldenRows.test.ts`; live rows are recorded against the real run further down.

### A4 — funding alone must never reach Send — **PASS**, and it exposes a contradiction in G4

```
$ npx vitest run tests/goldenRows.test.ts
✓ holds at the default funding weight of 10          (10 pts, 1 group, HOLD)
✓ still holds at the maximum funding weight          (50 pts, 1 group, HOLD, R-21)
✓ the slider moves the score                          (10 → 45 pts, still HOLD)
```

**Observed ≠ expected, and G4 is the one that is wrong.** `G4 §5 D3` says *"Move funding from
10 → 45 … A4 moves from HOLD to SEND and the trace says why."* It cannot, at any weight:

- R-20 requires **both** ≥ 50 points **and** ≥ 2 independent groups.
- A funding-only company has exactly one group (`funding`) however the slider is set.
- At the maximum weight of 50 the score bar clears and **R-21 holds it** — *"only 1 independent
  signal"*.

So D3 contradicts A4 in the same document, and A4 is the row to keep. A4's own note says it
plainly: *"If A4 ever returns SEND, the weights are wrong and the build has quietly become the
thing I said I wouldn't build."* Making D3 pass would mean letting a press mention qualify a
company, which is the exact failure A4 was written to prevent.

**What D3 was reaching for is still demonstrable**, and the third assertion above is it: the
slider genuinely moves the score (10 → 45) and the board genuinely re-ranks. What it cannot do
is manufacture independence, because independence is a different test from weight. The honest
demonstration of customisation is a company with *two* groups crossing the line — which is
what `S-06` at 45 does on a real multi-signal company.

**Verdict: PASS on A4. GAP recorded against G4 D3 as a specification error, not a code defect.**

### M5 — Hunter returns only generic mailboxes — **PASS** (forced by fixture)

No live domain in the set produced an all-generic Hunter response, so it is forced:

```
✓ refuses to select any generic mailbox, at any confidence
✓ prefers a named person at confidence 40 over info@ at confidence 95
✓ a company with only generic mailboxes becomes a HOLD, never a send to info@
```

R-30 ranks `info@` / `hello@` / `support@` at 99 and the selector refuses them outright. The
rule M5 is really testing — *"the system would rather hold than send to a mailbox nobody
reads"* — holds.

