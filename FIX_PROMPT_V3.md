# Signal — v3 Correctness Fix

> Paste into Claude Code in `signal-sprinto`.
> Everything structural is now right. This prompt fixes **what the system believes**, not how
> it is built. Six defects, found by reading one Send card top to bottom on the live site.
>
> **Do not change:** the detail page structure, the loop trace with RESERVED rows, the reserved
> fetch plan, `MAX_EXTRA_FETCHES = 4`, the page cache, the politeness gap, the economics panel,
> the staleness banner, the dry-run transport, the Health R-23 counter. All of that is working
> and is the best part of the build.

---

## 0. The headline defect, in one paragraph

`rocketlane.com` is the only SEND on the board. Open its card and read top to bottom:

- **§1 Evidence map:** *"Are they already certified? → **none**"*, sourced to a privacy-policy sentence: *"We use appropriate technical and organizational measures to protect the Personal Data…"*
- **§2 Signals:** S-02 *"Security or trust page exists with **no badge on it**"* → **VERIFIED, +30**
- **§5 Pain points:** *"Rocketlane Fortifies Infosec: **Gets SOC 1 Type 2 Certified, Stays SOC 2 Type 2 Compliant Two Years In A Row**"* → **VERIFIED**
- **§6 Draft:** *"obtaining certifications like SOC 2 and ISO 27001 often ties up an engineer for three months…"*

The system holds, on one screen, both "not certified" and "SOC 2 certified two years running",
scores 30 points for a trust page having no badge when the trust page is titled *"Security,
Compliance, and Reliability"*, and drafts an email pitching a certification the company already
has. R-04 should have fired and routed this to the migration play. Instead it is the board's
only Send.

A judge finds this in under a minute by reading one page in order. Fix it first.

---

## 1. Phase 1 — absence of evidence is not evidence of absence

### 1.1 `cert_status` may only be set to `none` by the right page

Today any page can drive `cert_status`, so privacy-policy boilerplate settles a question it
cannot settle. New rule, in code:

```
cert_status = "none"   ONLY IF  the reserved security/trust page was fetched successfully
                        AND     no certification token appears anywhere in its cleaned text
cert_status = "certified" / "in_progress"  may be set from any fetched page
otherwise cert_status stays NULL            → the loop continues, and at the cap R-22 holds
```

Certification tokens: `soc\s*1`, `soc\s*2`, `iso\s*27001`, `hipaa`, `pci[\s-]?dss`, `gdpr`
(only alongside a certification verb), `certified`, `attestation`, `type\s*(1|2|i|ii)`,
`trust\s*center`, `audit report`.

A null `cert_status` is a better outcome than a wrong one. R-22 already renders it well.

### 1.2 S-02's precondition

S-02 means *"they built a trust page but have nothing to put on it yet"* — the pre-certification
moment Sprinto sells into. It must require **both**:

1. the reserved security/trust fetch **succeeded**, and
2. **no certification token appears anywhere on that page**, title included.

Rocketlane's trust page title alone (`Rocketlane Trust Center: Security, Compliance, and
Reliability`) contains two. S-02 must not fire there. Today S-02 is firing on 10 of 12
companies, which is itself the tell: a signal that fires on almost everything is measuring the
existence of a page, not the absence of a badge.

### 1.3 The contradiction gate — new rule R-24

Cheap, and it would have caught this on its own. After all extraction and tiering, before the
verdict:

```
If cert_status ∈ {none, null}
AND a certification token appears in any VERIFIED quote anywhere on this company
    (signal quote, pain-point quote, evidence-map quote, draft hook)
→ R-24 fires. Verdict is forced to HOLD.
   Reason: "R-24: the pages say both. cert_status reads <x>, but a verified quote on
            <page> names <token>. Settle this before sending."
   Render the two conflicting quotes side by side on the card.
```

R-24 is the rule that admits the system can be internally inconsistent and refuses to send
through it. That is a better viva answer than any Send on the board today.

---

## 2. Phase 2 — R-23's third test is too weak

R-23 currently asks: does the quote appear verbatim, does it name the company, does it match the
signal's trigger. Rocketlane's S-07 passes all three on this quote:

> *"FinTech Interview with Srikrishnan Ganesan, Co-Founder and CEO of Rocketlane"*

That is a third party's interview headline. Rocketlane sells professional-services automation; it
does not sell into a regulated vertical. The quote names the company and contains "FinTech", so
R-23 waved it through — which is the exact F-7/F-8 class of error R-23 exists to stop, surviving
inside the build's headline feature, on its only Send.

Add a fourth test: **the quote's subject must be the claim's subject.**

### 2.1 Media-artifact filter

A quote cannot support **any** signal when it matches a publication artifact:

```
/\b(interview|podcast|webinar|episode|ama|fireside|panel|keynote|
    featured in|as seen in|in conversation|guest post|magazine|awards?|
    top \d+|best \d+|listicle|\d{4} report by)\b/i
```

…**unless** the signal is S-06 and the company is the grammatical subject of a funding verb
(`raises`, `raised`, `closes`, `secures`, `announces … round|series`). Rocketlane's S-06 quote
(*"Rocketlane Raises $60 Million in Series C…"*) correctly survives this; its S-07 quote does not.

### 2.2 S-07 needs customer language, not topic language

A regulated-vertical claim must rest on a sentence about **who they sell to**. Require a
customer-facing construction near the vertical token: `customers in`, `serving`, `built for`,
`trusted by`, `our clients`, `we work with`, `for <vertical> teams`, or a named customer in that
vertical. A vertical word appearing anywhere on the page is not enough.

### 2.3 While you are in here: S-01 fires on nobody

Across 12 scored companies, S-01 — 40 points, the single largest weight, the signal the entire
ICP argument is built on — **has never fired**. Meanwhile four companies sit at 0 because R-23
zeroed everything they had.

Diagnose this before you change it. Write the finding into `VERIFICATION_LOG.md`: for each of
the 12 companies, was a security/trust page actually read, did it contain an in-progress
construction (`working toward`, `undergoing`, `in progress`, `pursuing`, `audit underway`,
`expected by`), and if so why did S-01 not fire. Then fix the cause.

If the honest answer is "none of these 12 companies is mid-certification", that is a finding
about the sample, not the code — say so, and add two companies that genuinely are, chosen by
ICP fit and recorded *before* fetching, per `G6_PROMPT.md` §4.

---

## 3. Phase 3 — the draft must not contradict the evidence

### 3.1 R-41 — no pitching a certification they already hold

If `cert_status` is `certified`, or R-24 has fired, the draft prompt switches to the **migration
angle**: continuous monitoring, multi-framework consolidation, audit fatigue — never "obtaining
certifications like SOC 2". Assert this in a test with a certified fixture.

### 3.2 R-42 — a funding round alone cannot be the hook

Today's hook is *"Rocketlane raises $60 Million in Series C…"*. It is the most-used cold-email
opener in existence and it is a press mention, not a compliance-pressure fact — the same reason
S-06 is weighted 10 and not 40.

Rule: if any **verified compliance-specific** fact exists (certification status, trust-page
state, a compliance hire, an enterprise security requirement), the hook must use it. A funding
hook is permitted only when nothing else verified is available, and the card must say so:
*"hook falls back to funding — no compliance-specific fact survived the evidence check."*

---

## 4. Phase 4 — two UI contradictions

1. **The send card shows `DRY RUN — Not sent` and `SENT — sent via: resend` stacked together.** One card, one current status. Show the live status, with prior attempts in a collapsed "send history" row beneath it.
2. **Health says "Sent 1 · Dry-run 1 · Send failed 1"** with no way to see which company each belongs to. Link each count to its card.

---

## 5. Phase 5 — freshness before submission

Health currently reports **56 pages served from cache · 0 live fetches**, from a run that
finished **2026-11-14**. The board a judge sees was assembled entirely from five-day-old cache.
The staleness banner is honest and should stay — but the submitted state should not need it.

Before freezing: run the full sample set with the page cache bypassed, so every page is fetched
live and the verdicts reflect today's web. Then confirm the Health timestamps are same-day and
the banner is gone.

---

## 6. Acceptance — in this order

1. `rocketlane.com` no longer reports `cert_status: none` while quoting its own SOC 2 announcement — it is either `certified` (→ R-04 migration play) or null (→ R-22), and R-24 fires if the two ever disagree again.
2. S-02 fires on strictly fewer companies than it does now, and on none whose trust page names a certification.
3. Rocketlane's S-07 is **ASSERTED, scoring 0**, with the reason naming the media-artifact test.
4. The S-01 diagnosis is written down, with either a code fix or a sample-set finding.
5. No draft pitches a certification the company already holds.
6. One status per send card.
7. A fresh, live, same-day run, with at least one Send that survives all of the above.

Report the board's Send / Hold / Drop counts before and after, and for every company whose
verdict changed, the rule that changed it.
