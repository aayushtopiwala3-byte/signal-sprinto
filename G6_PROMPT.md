# Signal — G6 Verification & Freeze Prompt

> Paste this whole file into Claude Code in the `signal-sprinto` repo.
> Phases 1–6 of `FIX_PROMPT.md` are committed (HEAD `1d7ca3c`). **This prompt builds almost
> nothing new.** Its job is to prove what exists, close three paths that have never executed
> on real data, and freeze the build for a judge.

---

## 0. The standing rule for this prompt

Three things were reported as built but have **never run end to end**: R-52's runner-up
promotion, R-54's permanent block, and the `FABRICATED` tier. Unit coverage is not the same as
a path a judge can watch execute. For each one below, the deliverable is **observed output
pasted into `VERIFICATION_LOG.md`**, not a passing test.

Where a step cannot be completed, write it into §9 as a named gap with the reason. Do not
engineer around it and do not quietly drop it. The last time a limitation was written up as
principled (D-22) it was a bug, so the bar here is: *a gap is only a gap after the obvious fix
has been tried and has failed.*

**Do not change `MAX_EXTRA_FETCHES` (4). Do not loosen R-23. Do not stub a red test green.**

---

## 1. Measurement discipline — read before the first command

`npm run build` while the dev server is running corrupts `.next` and silently kills hydration.
That already invalidated one round of verification. So:

1. Kill every dev server. Confirm with `lsof -i :3000` (and `:3001`).
2. `rm -rf .next` and the stale `.next-stale-*` directory in the project root.
3. `npm run build` to completion, then `npm start`.
4. **Only then** does any interactive check count.

Any observation recorded before step 3 completes is void. If you catch yourself verifying
something interactive and the page does not react, assume a stale bundle before you assume a
bug.

Create `VERIFICATION_LOG.md` at the repo root now. Every section below appends to it, with the
command run, the output observed, and a PASS / FAIL / GAP verdict. This file is a viva artefact,
so write it for a reader who was not watching.

---

## 2. Part A — execute the three paths that have never run

### A.1 `FABRICATED` must fire once, visibly

`0 fabrications blocked` is honest but unproven on a live surface. Add a deterministic
demonstration that cannot be mistaken for a real company:

- A fixture company `fabrication-demo.invalid` in `lib/seed/behavioural.ts` whose source text is
  fixed and whose AI output is stubbed to return a quote that **does not appear in that text**.
- A button on `/selftest` labelled **"Run the fabrication drill"**. It runs the fixture, shows
  the claimed quote, the source text, the verbatim check failing, and the signal scoring **0**.
- Label the result on screen as a fixture, in those words: *"This is a stored fixture, not a
  live company. It exists to show the check firing."*

This is not cheating the counter. The run-level Health counter still reports what the real run
found. The drill is a separate, labelled surface.

### A.2 R-54 must execute without destroying the demo

R-54 is a permanent hard block by design, so it cannot be run against the board's only Send.
Run it against a **HOLD** domain instead — pick one that carries no demo weight.

- Execute the full path: reply classified `unsubscribe` → typed-phrase confirmation → domain
  written to the permanent block list → a subsequent run of the sample set **skips it with a
  named reason**.
- Record the before/after of the block table and the skip line from the next run.
- Then verify the guard a judge will test: attempt the same block on a second domain with the
  wrong confirmation phrase and confirm the server returns 400 and nothing is written.

Do **not** add an undo. Permanence is the point. If you need the domain back for the demo, that
is a reason to have picked a different domain, not a reason to soften the rule.

### A.3 R-52 must promote a runner-up on real data

Pick a company that has both a primary contact and a stored runner-up with a `lost_reason`.
Submit a `wrong_person` reply. Confirm:

- the ladder re-runs,
- the runner-up is promoted to primary,
- the previous primary is recorded as superseded with the reply as the cause,
- the detail page's **"What would change it"** panel names the promotion.

Record the contact rows before and after.

---

## 3. Part B — make the send path provable before the credentials exist

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and `RESEND_API_KEY` are
mine to add and I have not added them. Until I do, `sends` has 0 rows and a judge sees an
unproven step 7. Close the gap honestly:

Add a third transport, `dry_run`, selected **only** when no send credentials are configured.
It writes a real `sends` row with `transport = 'dry_run'` and `status = 'not_sent'`, and renders
on the card:

> **Not sent — no mail transport is configured.** This is the exact message that would have
> been transmitted. Add the Gmail or Resend credentials and this same draft sends unchanged.

Directly beneath it, render the **actual RFC-822 bytes** the Gmail path would base64url-encode:
headers, `To:`, `From:` with `SENDER_NAME`, the R-40-validated subject, and the body. Not a
summary of them — the bytes.

Rules for this:

- `dry_run` must be **impossible** when credentials are present. Assert that in a test.
- The word "sent" never appears on a `dry_run` card in any tense.
- The Health counter reports `dry-run` separately from `sent` and from `send_failed`.
- The transport chain order is unchanged: Gmail → Resend → fail loudly. `dry_run` sits outside
  that chain, not inside it.

When I add the four values, the first real send must require no code change. Write the one-line
check that proves that — a test asserting the transport selector returns `gmail` the moment the
env vars are present.

---

## 4. Part C — broaden the board, by fit and not by outcome

One Send on the board is defensible but thin. Add **four** more domains to `SAMPLE_DOMAINS`.

**The selection rule, and it is not negotiable:** choose them for ICP fit as stated in
`G2_Stack_and_ICP.md` — Indian or India-adjacent B2B SaaS, Series A–C, handling customer data.
Choose them **before** you fetch them. Write the four names and the reason for each into
`VERIFICATION_LOG.md` *first*, then run them, then record whatever they score.

If all four land in HOLD, they stay in the set and the log says so. Swapping out a company
because it scored badly is tuning the test to the answer, and it is the exact failure mode
`G4_Golden_Test_Set.md` §0 was written to prevent. The only legitimate reason to remove one
after the fact is a *structural* failure — robots 403, DNS death — which is what happened to
`zomato.com` and which must be recorded the same way.

Keep the existing twelve. The duplicate trio, the dead domain and `zerodha.com` are load-bearing
demonstrations.

---

## 5. Part D — run the golden set, row by row

`G4_Golden_Test_Set.md` is the contract. Execute every row and record the observed result
against the written expectation. Where they differ, the log says which one was wrong.

| Rows | What to run |
|---|---|
| H1–H4 | The four happy-path companies. Record verdict, score, independent groups, evidence tier per signal, and whether the hook quote resolves to a live URL at the quoted sentence |
| M1–M5 | Messy inputs. M1/M2 are in the sample set already. **M5 — Hunter returning only `info@`/`hello@` — must be forced**, by fixture if no live domain produces it. Confirm the system HOLDs rather than addressing a generic mailbox |
| A1–A6 | The adversarial rows. **A4 is the one that matters**: a company whose only signal is funding must return HOLD on R-21. Force it with a fixture if no live company produces exactly that shape |
| F1–F8 | The fail-safe drills. Pull each dependency on purpose: bad Gemini JSON, no Gemini key, Hunter 429, Hunter at 80%, Gmail token dead, both transports dead, cost ceiling mid-run, Neon dropped. Each must produce a named, visible failure — never a blank screen |
| D1–D7 | Determinism. D1 twice over the frozen fixtures must be byte-identical. D3 — drag funding 10 → 45 and watch A4 move to Send with a recalculated trace — is the honest demonstration of customisation |

For F7 and F8, if a drill cannot be run safely against production, run it locally and say so in
the log. A local drill recorded as local is fine. A drill skipped silently is not.

---

## 6. Part E — the judge surfaces

Run `G4` §6's two-minute path end to end, in this order, and record each step:

1. Incognito window, cold — no login, no stale cache, and **time the first paint after a cold
   Vercel start**. If a judge waits more than a few seconds on a blank page, a loading state is
   needed and this is where you find that out.
2. Mobile viewport (390 × 844). Every page. The board, the detail page, the loop trace table,
   the economics panel and `/selftest` must all be readable without horizontal scroll. Tables
   are the usual offender.
3. **Zero empty sections.** Click every reachable surface with sample data loaded and with the
   database empty. `lib/ui/emptyStates.ts` exists — confirm every empty state routes through it
   and none renders a bare blank. A judge who finds a blank panel stops trusting the rest.
4. Toggle matrix. `strict_icp` ON/OFF against `apty.io`; `reader_enabled` ON/OFF; each weight
   slider moved and reset. Every flip must produce a changed verdict **and** a changed trace, or
   be a no-op you can explain.
5. Re-scoring makes no fetch and no AI call. Prove it from the `cost_ledger` and `fetches`
   tables, not from the UI claim.
6. Cross-check the footer: model id, the "Claude API is not used" line, the locked recipient.

---

## 7. Part F — freeze

1. Clear test and drill runs out of the run history so a judge's first screen is one clean run.
   Keep the data; hide the noise; say in the log what was hidden and why.
2. Regenerate the Components Map **from the final code**, not from `G3`. Every box must name a
   real file. If the map and the code disagree, the code is right and the map is stale.
3. Update `README.md`: the rule table (R-01 … R-23, R-40, R-50 … R-55), the env var list
   including the four I still owe, the `dry_run` behaviour, and the L4-deck provenance for
   `MAX_EXTRA_FETCHES = 4` and the reserved-fetch plan.
4. `npm run build && npx tsc --noEmit && npm test` all clean, from a cold `.next`.
5. `git status` clean. Confirm `.env.local` is ignored and run `git log --all -p -- .env.local`
   to prove no key was ever committed. Report the result of that command explicitly.
6. Delete the `.next-stale-*` directory.
7. Deploy. Confirm the production `/selftest` count matches local, and that the live board shows
   the broadened sample set.

---

## 8. What not to do

- Do not tune weights, thresholds or the sample set to produce a better-looking board.
- Do not make a red test green by changing the assertion. Change the code or log the gap.
- Do not add an undo to R-54.
- Do not let `dry_run` describe itself as a send.
- Do not sign into my Google account or attempt to obtain an OAuth token.

---

## 9. Report back

In this order:

1. `VERIFICATION_LOG.md` summary: counts of PASS / FAIL / GAP.
2. The three Part A paths: did each execute on real data, with the observed output.
3. The board as it stands: Send / Hold / Drop / Quarantine counts, and for each Send, the
   company, score, independent groups and evidence tiers.
4. Any golden-set row where observed ≠ expected, and which one you concluded was wrong.
5. Every GAP, with the fix that was tried and why it failed.
6. The exact list of what remains blocked on me, with the click-path for each.

Then stop. Do not start G7.
