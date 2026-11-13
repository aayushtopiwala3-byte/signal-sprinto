import { Replies } from "@/components/Replies";
import * as q from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * §6.3 — the reply checkpoint. Server component: it supplies the companies a reply can belong
 * to, the history, and the current outreach state, then hands the interaction to the client.
 */
export default async function RepliesPage() {
  const run = await q.latestRun();
  const companies = run ? await q.listCompanies(run.id) : [];
  const [history, state] = await Promise.all([q.listReplies(), q.listOutreachState()]);

  return (
    <Replies
      companies={companies
        .filter((c) => c.verdict !== null)
        .map((c) => ({ id: c.id, domain: c.normalized_domain, verdict: c.verdict }))}
      history={history}
      state={state}
    />
  );
}
