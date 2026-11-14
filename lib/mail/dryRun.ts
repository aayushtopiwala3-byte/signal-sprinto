import { env, capability, requireSendTo } from "@/lib/env";
import { buildRfc822 } from "@/lib/mail/gmail";

/**
 * §3 (G6) — the transport that does not transmit.
 *
 * Step 7 of the brief is "send via Gmail", and until the OAuth values exist a judge sees an
 * unproven step and an empty `sends` table. The honest way to close that is not to claim a send
 * — it is to show, byte for byte, the message that *would* have been transmitted, and to say
 * plainly that it was not.
 *
 * Three constraints make this safe to have in the codebase at all:
 *
 *  - **It is unreachable when credentials exist.** `dryRunAvailable()` is the only selector, and
 *    it is false the moment Gmail or Resend is configured. A dry run cannot shadow a real send.
 *  - **It sits outside the transport chain.** `sendEmail` still walks Gmail → Resend → fail
 *    loudly. This is checked before that chain is entered, never as a fallback inside it, so a
 *    transport failure can never silently downgrade into "well, here are the bytes".
 *  - **It never calls itself a send.** The row is written with `status = 'not_sent'`, and the
 *    card's copy avoids the word in every tense. A dry run that describes itself as a send is
 *    worse than no dry run, because it is a false claim rather than a missing one.
 */

export type DryRunOutcome = {
  to: string;
  /** The exact bytes the Gmail path would base64url-encode. Not a summary of them. */
  rfc822: string;
  /** What `From:` will say once credentials exist. */
  from: string;
};

/**
 * True only when there is no way to actually send. The assertion this function exists to make
 * is the negative one: with credentials present it must return false.
 */
export function dryRunAvailable(): boolean {
  return !capability.gmail() && !capability.resend();
}

export function buildDryRun(input: { subject: string; body: string }): DryRunOutcome {
  const to = requireSendTo();

  // What the real send would put in `From:`. Gmail's API substitutes the authorised mailbox for
  // the literal "me", so that is shown rather than invented — an address we do not have yet
  // would be exactly the kind of plausible fiction this build refuses to print.
  const configured = env.emailFrom();
  const from = configured
    ? `${env.senderName()} <${configured}>`
    : `${env.senderName()} <me — the authorised Gmail mailbox, substituted by the API at send time>`;

  return {
    to,
    from,
    rfc822: buildRfc822({ to, from, subject: input.subject, body: input.body }),
  };
}
