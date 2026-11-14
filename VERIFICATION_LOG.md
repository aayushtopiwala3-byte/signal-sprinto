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

### A.3 · R-52 promotes a runner-up on real data — **PASS**, after fixing two defects it exposed

Executing this path found two real bugs. Both are fixed; neither was found by reading the code.

#### Defect 1 — the ladder promoted a Software Engineer over a Founder

First attempt, on `zipy.ai`. `size_band` is unknown there, so the null band uses the 51–200
ladder, on which neither "Founder" nor "Software Engineer" appears — both landed off-ladder at
rank 99 with confidence 70. The tiebreak then fell through to **alphabetical email order**:

```
BEFORE  SELECTED rank=2  Anchal Rastogi  | Chief Technology Officer
                 rank=99 Sandesh Murdia  | Software Engineer   seniority=null
                 rank=99 Vishalini Paliwal | Founder           seniority=executive

APPLY → {"applied":true,"rule":"R-52","note":"Promoted Sandesh Murdia"}     ← wrong person
```

Hunter already returns a `seniority` field and the ranker was ignoring it. `selectContact` now
breaks a ladder tie on seniority **before** confidence. That ordering is consistent with the
design rather than new: confidence is *deliverability*, not relevance, and the ladder already
prefers relevance over deliverability (a named person at confidence 40 beats `info@` at 95).
Locked in `tests/poc.test.ts` with the real Hunter rows, including that an unknown seniority
sorts last and that seniority never rescues a generic mailbox.

#### Defect 2 — my own test reply was ambiguous, and AI-5 was right to call it

My first `wrong_person` fixture ended *"Please don't send this to me again."* AI-5 classified it
`unsubscribe` at confidence 0.90 with that exact sentence quoted. **The model was correct** — that
is an unsubscribe request — and it erred toward the conservative reading, which is what the
prompt asks for. The fixture was the problem, not the classifier. Replaced with a reply that is
unambiguously about the person and not about contact.

#### The clean execution, on `zluri.com`

```
CLASSIFY  intent=wrong_person  confidence=0.95
          quote="I'm not the right person for this one."     ← verbatim in the reply
          action R-52 · effect=recontact · requiresTypedConfirmation=false

APPLY → HTTP 200 {"ok":true,"applied":true,"rule":"R-52","effect":"recontact",
                  "note":"Promoted Aditi Sharma"}

BEFORE  SELECTED rank=99 Sethu Meenakshisundaram | Cofounder          conf=98 executive
                 rank=99 Divyam Sharma           | Software Engineer  conf=97 (no seniority)
                 rank=99 Aditi Sharma            | Head of GTM        conf=96 executive

AFTER   SELECTED rank=99 Aditi Sharma            | Head of GTM
                 rank=99 Sethu Meenakshisundaram | Cofounder
                   lost: "R-52: they replied that they are not the right person
                          — superseded on 2026-11-14"
                 rank=99 Divyam Sharma           | Software Engineer
```

Three things to note:

- **The ladder re-ran and the runner-up was promoted.** ✅
- **The seniority fix is visible here too:** Divyam (confidence 97, no seniority) would have won
  under the old ordering. The Head of GTM, an executive at 96, beat the IC at 97.
- **The superseded primary records the reply as the cause**, not the ladder's original reason.
  `supersedeContact` writes it; `swapSelectedContact` alone left "ladder rank 99 vs 2", which
  says nothing about a human having told us we had the wrong person.

And the detail page's panel, observed on screen:

```
WHAT WOULD MOVE THIS
  [reply]  R-52 applied — contact re-laddered after a reply
  They replied that we had the wrong person, so the contact ladder was re-run with them
  excluded and the runner-up promoted. The draft above still opens to the previous contact —
  re-draft it before sending.
```

A reply is newer information than the run that produced the verdict, so it is rendered above the
verdict's own reasoning rather than in a history panel. The verdict's `what_would_change_it`
("20 more points and 1 more independent signal") is kept below it — §0 protects that panel.

### A.2 · R-54 executes a permanent block — **PASS**

**Target: `everstage.com`.** R-54 cannot be run against the board's only Send, and every domain
in the original twelve carries a demonstration (`apty.io` is the `strict_icp` toggle,
`springworks.in` the R-22 handoff, `zipy.ai` the R-23 asserted quotes, `zerodha.com` R-01,
`whatfix.com` R-02a, `sprinto-test-does-not-exist-9x.com` the dead domain). `everstage.com` is
one of the four new domains and landed HOLD on R-04 — a migration-play example that `apty.io`
already provides. It is the row that carries the least unique demo weight, which is the whole
selection criterion §2 A.2 sets.

**No undo was added.** Permanence is the point, and `setOutreachState` additionally refuses to
move a domain *out* of `block` by any later reply.

#### Step 1 — the guard a judge will test: wrong confirmation phrase

```
POST /api/reply  {mode:"apply", intent:"unsubscribe", confirmation:"block permanently"}
→ HTTP 400 {"error":"R-54 is permanent and requires the exact phrase
                      \"BLOCK PERMANENTLY\" to be typed."}

outreach_state AFTER: (none)          ← nothing written
```

Lower-case fails. The check runs server-side, not only in the browser, so disabling the button
is not the only thing standing between a misclick and a permanent block.

#### Step 2 — the full path with the correct phrase

```
CLASSIFY  intent=unsubscribe  confidence=1.00
          quote="please take us off your list permanently."   ← verbatim in the reply
          action R-54 · effect=block · requiresTypedConfirmation=true
                      · confirmationPhrase="BLOCK PERMANENTLY"

APPLY → HTTP 200 {"ok":true,"applied":true,"rule":"R-54","effect":"block"}
```

`outreach_state`, before and after:

```
BEFORE  (none)

AFTER   {"domain":"everstage.com","kind":"block","rule":"R-54",
         "reason":"Block this domain permanently. Every future run quarantines it before any
                   page is fetched. This cannot be undone from this interface.",
         "until":null,                       ← no expiry. This is what permanent means.
         "created_at":"2026-11-14T04:33:44.400Z"}
```

#### Step 3 — the next run skips it, with a named reason

The very next run of the sample set, before any page was fetched:

```
$ node runboard.mjs
submitting 16 entries
run: run_5106aa7bfecc4154b19f  queued: 13  dupes: 2        ← 14 unique, 13 queued
suppressed at start:
   everstage.com :: R-54: they asked not to be contacted again. This block is permanent.
```

The gate sits in `/api/run/start` **before** `insertCompany`, so the domain is never queued and
therefore never fetched. A blocked domain that got queued and then fetched would have been
contacted in every sense that matters.

---

## §3 · Part B — the send path is provable before the credentials exist — **PASS**

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `RESEND_API_KEY` and
`EMAIL_FROM` are not set, so `sends` had 0 rows and step 7 of the brief was unproven. Closed with
a third transport, `dry_run`, which **does not transmit and never says it did**.

Observed by pressing **Approve and send** on the live `rocketlane.com` Send card:

```
DRY RUN
Not sent — no mail transport is configured.

This is the exact message that would have been transmitted. Add the Gmail or Resend
credentials and this same draft goes out unchanged — no code change, no re-draft.

RFC 822 BYTES — WHAT THE GMAIL PATH WOULD BASE64URL-ENCODE

To: demo@example.com\r\n
From: the Growth Lead at Sprinto <me — the authorised Gmail mailbox, substituted by the API
      at send time>\r\n
Subject: Compliance automation for your engineering team\r\n
MIME-Version: 1.0\r\n
Content-Type: text/plain; charset="UTF-8"\r\n
Content-Transfer-Encoding: 8bit\r\n
\r\n
According to your press announcements, Rocketlane raises $60 Million in Series C to Redefine
Professional Services for the AI Era. ...
```

Those are the real bytes, CRLF-terminated, not a summary of them. The `From:` does not invent an
address we do not have — Gmail substitutes the authorised mailbox for the literal `me`, so that
is what is shown.

The row it wrote:

```
transport=dry_run | status=not_sent | to=demo@example.com
error="No mail transport is configured (no Gmail OAuth values and no Resend key)."
```

And `/health`, counting three ways rather than two:

```
Send transport                    [DRY RUN ONLY]
Sent                        0
Dry-run (not transmitted)   1
Send failed                 0
Transport chain             none configured — dry run
```

The four rules §3 sets, and how each is held:

| Rule | How |
|---|---|
| `dry_run` impossible when credentials are present | `dryRunAvailable()` is false if Gmail **or** Resend is configured. `tests/dryRun.test.ts` asserts all four combinations, including that a partial Gmail config (2 of 3 values) does **not** count as configured. |
| The word "sent" never appears in any tense | The only occurrence on the card is *"Not sent"*. A test asserts the outcome object carries no `sent`/`sending`/`sends` token. |
| Health reports `dry-run` separately | Three counters above, from `sendCounts()`. Folding it into `sent` would claim a transmission; into `failed` would report a breakage when nothing broke. |
| The chain order is unchanged | `sendEmail` still walks Gmail → Resend → fail loudly. The dry run is checked **before** that chain is entered, never inside it, so a transport failure cannot silently downgrade into "here are the bytes". |

**The one-line check that no code change is needed when the credentials land:**

```ts
it("the first real send needs no code change — credentials alone flip the selector", () => {
  expect(dryRunAvailable()).toBe(true);
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_REFRESH_TOKEN = "token";
  expect(dryRunAvailable()).toBe(false);
  expect(capability.gmail()).toBe(true);
});
```

---

## §6 · Part E — the judge surfaces

### §6.2 · Mobile (375 × 844) — **PASS**, after two real fixes

Measured, not eyeballed: for each page, `documentElement.scrollWidth − clientWidth` and the
widest element extending past the viewport.

**Two defects found and fixed.**

1. **The header overflowed every page by 37–48px.** Adding the *Replies* tab gave the nav five
   links, which do not fit at 375px — so every page had a horizontal scroll, not just one.
   `SiteHeader` now wraps.
2. **The loop trace was a 640px table inside a scroll container.** The page did not scroll, but
   the *table* did, and the column a judge has to drag sideways to reach is **Why** — the one
   carrying the argument. It is now a table on `sm:` and up, and stacked cards below, with the
   field names humanised (`company size`, not `size_band`).

After both fixes:

| Page | overflow at 375px |
|---|---|
| `/` | **0px** |
| `/replies` | **0px** |
| `/quarantine` | **0px** |
| `/health` | **0px** |
| `/selftest` | **0px** |
| `/company/[id]` | **0px** — table hidden, 5 stacked steps rendered |

Desktop at 1014px confirmed unchanged: table visible, stacked list hidden, 0px overflow.

### §6.3 · Zero empty sections — **PASS**

All four empty states route through `lib/ui/emptyStates.ts`, asserted by T-26:

```
app/quarantine/page.tsx:39   : EMPTY_STATE_QUARANTINE
app/health/page.tsx:160      : EMPTY_STATE_HEALTH
components/Replies.tsx:159   : EMPTY_STATE_REPLIES
components/Board.tsx:580     : {EMPTY_STATE_BOARD}
```

Each states what is absent, why, and the next action. T-26 fails if one is deleted or trimmed
below 20 characters — a test against a string the page does not render would have been F-11
again, so the pages render the same constants the test reads.

### §6.4 · Toggle matrix — **PASS** (G4 A3 and D4)

`strict_icp` against the two certified companies, via `/api/rerank`:

```
strict_icp OFF (default)
  apty.io  HOLD  play=migration  R-04
    "HOLD — R-04: already certified, routed to the migration play (strict_icp off).
     Timing score 15 across 1 independent signal."
  zipy.ai  HOLD  play=migration  R-04

strict_icp ON
  apty.io  DROP  play=greenfield R-04   "DROP — R-04: already certified"
  zipy.ai  DROP  play=greenfield R-04

strict_icp OFF (restored)  → back to migration HOLD
```

Both verdicts are reachable by one toggle and both are explained, which is what G2's documented
disagreement with slide 40 promised.

### §6.5 · Re-scoring costs nothing — **PASS**, proved from the tables

Not from the UI's claim — from `fetches` and `cost_ledger` directly:

```
BEFORE: fetches=75  cost_ledger_rows=93
  rocketlane:55  whatfix:30  zluri:30  apty:15  zerodha:15  atlan:10  ...

POST /api/rerank  (S-06 funding 10 → 45)  → HTTP 200

AFTER : fetches=75  cost_ledger_rows=93
  rocketlane:90  atlan:45  whatfix:30  zluri:30  apty:15  zerodha:15  ...

fetches delta     = 0
cost_ledger delta = 0
board order changed = true      (atlan.com moved 6th → 2nd)
```

This is G4's D3 in its honest form: a real company visibly moves up the board, and it costs
nothing because the score was never the model's to decide. `atlan.com` stays HOLD at 45 — one
independent group — which is A4's rule holding at the same time.

### §5 · Part D — fail-safe drills F1–F8

Run locally against the real modules, and recorded as local, per G6 §5.

| # | Drill | Result |
|---|---|---|
| F1 | Gemini returns invalid JSON | **PASS** — `tests/retry.test.ts` (T-15): the Zod error is re-sent to the model, exactly one retry, then rules-only. Grounding is enforced by the schema, not the prompt. |
| F2 | Gemini key removed entirely | **PASS** — `capability.ai() === false`, and `degradations()` returns a named warn banner: *"Rules-only mode. Verdicts, scores and rule IDs are still produced by the deterministic engine…"* |
| F3 | Hunter returns 429 | **PASS (by construction)** — the quota guard trips before the call; see F4. A 429 falls through the same cache → seeded path, and every seeded contact renders a visible `seeded` badge. Not forced against the live API: burning real credits to observe a 429 would cost the demo its remaining quota. |
| F4 | Hunter quota at 80% | **PASS** — `QUOTA_GUARD_RATIO = 0.8`, `HUNTER_LIMIT = 5`. The guard is a hard stop **before** the call, not a check after it. |
| F5 | Gmail token expired → Resend | **GAP** — cannot be executed. There is no Gmail token to expire. The chain order and its disclosure are asserted by `tests/send.test.ts` ("records which transport sent, so a fallback is never read as the primary path") and by F6 below, which shows both attempts recorded in order. |
| F6 | Gmail **and** Resend both down | **PASS** — fails loudly, both attempts named: `"Every transport failed. gmail: not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN) \| resend: not configured (RESEND_API_KEY / EMAIL_FROM)"`. One `sends` row per attempt, so the card can say why the fallback ran. |
| F7 | Cost ceiling hit mid-run | **PASS (by construction)** — `AI_COST_CEILING_USD` defaults to $1.00 and the run stops cleanly at the ceiling, keeping every completed company. Not forced: driving real spend past the ceiling to watch it stop would cost real money for an assertion the code already makes unconditionally. |
| F8 | Neon connection drops | **FAIL → fixed → PASS.** See below. |

#### F8 found a real defect: it was a blank screen

Drill: start the production server with an unreachable `DATABASE_URL`.

```
$ DATABASE_URL="postgresql://nobody:nothing@127.0.0.1:59999/nope" npx next start -p 3100
$ curl http://localhost:3100/
HTTP 500, 9446 bytes

VISIBLE TEXT: "Signal — outbound qualification & drafting"      ← the <title>, and nothing else
server log:   ⨯ Error: connect ECONNREFUSED 127.0.0.1:59999
```

G4 F8's expectation is *"Error banner, not a blank screen."* The app had **no error boundary at
all**, so Next's production error page rendered an empty body. The run failed visibly in the
server log and invisibly on screen, which is the wrong way round.

Fixed by adding `app/error.tsx` and `app/global-error.tsx` (the latter for a failure in the root
layout, which the former cannot catch). Re-running the same drill, observed in a browser:

```
Signal · Board · Replies · Quarantine · Health · Self-test          ← nav intact
Email sending isn't connected yet…                                  ← banner intact

This page could not be rendered.

The most common cause is the database being unreachable — Signal reads every board, verdict
and quote from Postgres on each request, so if Neon is down or DATABASE_URL is wrong, there
is nothing to render.

Nothing was half-written. A run processes one company per request and commits each one before
moving on, so whatever completed before the failure is intact and whatever did not is still
queued. Restoring the connection and re-running continues from where it stopped.

[Try again]  [Open /health to see what is configured]
```

**One honest caveat.** `app/error.tsx` is a client boundary, so the *server-rendered* HTML is
still empty and `curl` still sees a blank body — the banner appears once JS runs. A judge uses a
browser, so the row passes; a judge using `curl` would not see it. The server digest is shown
instead of a stack trace, because a hex digest is the only server detail Next exposes to the
client and a stack trace is not something an error page should print.

