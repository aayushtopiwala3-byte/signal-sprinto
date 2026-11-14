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

