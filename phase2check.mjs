// Phase 2 acceptance (§3.2). Starts a production run, steps it to completion, then reads the
// live database directly. Scraping the company page would not work here: it renders the full
// tier legend beside the fired set, so a page scrape reports every tier on every company.
import postgres from "postgres";
import fs from "node:fs";

// .env.local quotes the value; `export $(grep ...)` keeps the quotes and postgres.js then
// rejects the URL. Read and unquote here so the check cannot fail for shell reasons.
const dbUrl = (
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1] ??
  ""
)
  .trim()
  .replace(/^["']|["']$/g, "");

const BASE = "https://signal-sprinto.vercel.app";
const DOMAINS = [
  "rocketlane.com",
  "zipy.ai",
  "nected.ai",
  "springworks.in",
  "apty.io",
  "whatfix.com",
  "zerodha.com",
  "atlan.com",
  "  HTTPS://Rocketlane.com/pricing?utm_source=x  ",
  "rocketlane.com",
  "sprinto-test-does-not-exist-9x.com",
  "plivo.com",
].join("\n");

const sql = postgres(dbUrl, { ssl: "require" });

const start = await fetch(`${BASE}/api/run/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ domains: DOMAINS }),
}).then((r) => r.json());

const runId = start.runId ?? start.run_id ?? start.id;
console.log("run:", runId, JSON.stringify(start).slice(0, 200));

let steps = 0;
let timeouts = 0;
for (;;) {
  steps += 1;
  const res = await fetch(`${BASE}/api/run/step`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  if (!res.ok) {
    timeouts += 1;
    console.log(`  step ${steps}: HTTP ${res.status}`);
    if (timeouts > 8) break;
    continue;
  }
  const data = await res.json();
  console.log(`  step ${steps}:`, data.domain ?? "-", data.status ?? "", data.verdict ?? "");
  if (data.done || data.remaining === 0) break;
  if (steps > 40) break;
}

console.log(`\nsteps=${steps} handler-timeouts=${timeouts}\n`);

const board = await sql`
  SELECT domain, verdict, timing_score, independent_signals, rule_fired
  FROM companies WHERE run_id = ${runId} ORDER BY domain`;
console.log("=== BOARD ===");
for (const r of board) {
  console.log(
    `${r.domain.padEnd(34)} ${String(r.verdict).padEnd(6)} ${String(r.timing_score ?? "-").padStart(3)} groups=${r.independent_signals ?? "-"}  ${r.rule_fired ?? ""}`,
  );
}

const counts = await sql`
  SELECT verdict, COUNT(*) AS n FROM companies WHERE run_id = ${runId} GROUP BY verdict`;
console.log("\ncounts:", counts.map((c) => `${c.verdict}=${c.n}`).join(" "));

console.log("\n=== SIGNALS, with tier ===");
const sigs = await sql`
  SELECT c.domain, s.signal_id, s.points, s.tier, s.tier_reason, s.quote
  FROM signals s JOIN companies c ON c.id = s.company_id
  WHERE c.run_id = ${runId} ORDER BY c.domain, s.signal_id`;
for (const s of sigs) {
  console.log(`${s.domain.padEnd(18)} ${s.signal_id} ${String(s.points).padStart(3)}pts ${s.tier}`);
  if (s.tier !== "verified") console.log(`    reason: ${s.tier_reason}`);
  console.log(`    quote: ${JSON.stringify((s.quote ?? "").slice(0, 110))}`);
}

console.log("\n=== HEALTH COUNTER (§3.2) ===");
const blocks = await sql`
  SELECT tier, kind, COUNT(*) AS n FROM evidence_blocks
  WHERE run_id = ${runId} GROUP BY tier, kind ORDER BY tier, kind`;
let asserted = 0;
let fabricated = 0;
for (const b of blocks) {
  if (b.tier === "asserted") asserted += Number(b.n);
  else fabricated += Number(b.n);
  console.log(`  ${b.tier.padEnd(11)} ${b.kind.padEnd(11)} ${b.n}`);
}
console.log(`\n${asserted} claims downgraded to asserted · ${fabricated} fabrications blocked`);

console.log("\n=== ZIPY (acceptance) ===");
const zipy = await sql`
  SELECT s.signal_id, s.points, s.tier, s.tier_reason
  FROM signals s JOIN companies c ON c.id = s.company_id
  WHERE c.run_id = ${runId} AND c.domain = 'zipy.ai' ORDER BY s.signal_id`;
console.log(zipy.length === 0 ? "  (no signals stored)" : "");
for (const s of zipy) console.log(`  ${s.signal_id} ${s.points}pts ${s.tier} — ${s.tier_reason ?? ""}`);
const zrow = board.find((b) => b.domain === "zipy.ai");
console.log(`  zipy verdict=${zrow?.verdict} score=${zrow?.timing_score} rule=${zrow?.rule_fired}`);

await sql.end();
