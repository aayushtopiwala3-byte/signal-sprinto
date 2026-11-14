// Runs the broadened sample set against the LOCAL production server (npm start), which talks to
// the same Neon database. Steps until the queue drains, then prints the board.
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3000";
const src = fs.readFileSync("lib/seed/sampleDomains.ts", "utf8");
// Only the SAMPLE_DOMAINS array. An earlier version of this regex also matched SAMPLE_NOTES,
// which injected six prose strings into the run and polluted the quarantine with
// `invalid_domain` rows. The run was still valid for the real domains, but the board was noisy.
const block = src.slice(
  src.indexOf("SAMPLE_DOMAINS: string[] = ["),
  src.indexOf("];", src.indexOf("SAMPLE_DOMAINS: string[] = [")),
);
const DOMAINS = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
console.log(`submitting ${DOMAINS.length} entries`);

const dbUrl = fs
  .readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, "");
const sql = postgres(dbUrl, { ssl: "require" });

const start = await fetch(`${BASE}/api/run/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ domains: DOMAINS.join("\n") }),
}).then((r) => r.json());

const runId = start.runId;
console.log("run:", runId, "queued:", start.queued, "dupes:", start.duplicates_removed);
if (start.suppressed?.length) {
  console.log("suppressed at start:");
  for (const s of start.suppressed) console.log(`   ${s.domain} :: ${s.reason}`);
}

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
    if (timeouts > 10) break;
    continue;
  }
  const d = await res.json();
  console.log(`  step ${steps}: ${d.domain ?? "-"} ${d.status ?? ""} ${d.verdict ?? ""}`);
  if (d.done || d.remaining === 0) break;
  if (steps > 60) break;
}
console.log(`\nsteps=${steps} handler-timeouts=${timeouts}`);

const board = await sql`
  SELECT domain, verdict, timing_score, independent_signals, rule_fired, size_band, cert_status
  FROM companies WHERE run_id = ${runId}
  ORDER BY CASE verdict WHEN 'SEND' THEN 0 WHEN 'HOLD' THEN 1 WHEN 'DROP' THEN 2 ELSE 3 END, domain`;
console.log("\n=== BOARD ===");
for (const r of board) {
  console.log(
    `${r.domain.padEnd(34)} ${String(r.verdict ?? "-").padEnd(5)} ${String(r.timing_score ?? "-").padStart(3)} g=${r.independent_signals ?? "-"} ${String(r.rule_fired ?? "").padEnd(6)} size=${r.size_band ?? "?"} cert=${r.cert_status ?? "?"}`,
  );
}

const counts = await sql`
  SELECT verdict, COUNT(*) n FROM companies WHERE run_id=${runId} GROUP BY verdict`;
console.log("\ncounts:", counts.map((c) => `${c.verdict ?? "unscored"}=${c.n}`).join(" "));

const qr = await sql`SELECT domain, reason_code, reason_text FROM quarantine WHERE run_id=${runId}`;
console.log("\nquarantine:");
for (const r of qr) console.log(`  ${r.domain} [${r.reason_code}] ${r.reason_text.slice(0, 110)}`);

console.log("\n=== SIGNALS (new four only) ===");
const sigs = await sql`
  SELECT c.domain, s.signal_id, s.points, s.tier, s.tier_reason, s.quote
  FROM signals s JOIN companies c ON c.id = s.company_id
  WHERE c.run_id = ${runId}
    AND c.domain IN ('zluri.com','signzy.com','everstage.com','hyperverge.co')
  ORDER BY c.domain, s.signal_id`;
for (const s of sigs) {
  console.log(`${s.domain.padEnd(16)} ${s.signal_id} ${String(s.points).padStart(3)}pts ${s.tier}`);
  if (s.tier !== "verified") console.log(`    why: ${s.tier_reason}`);
  console.log(`    quote: ${JSON.stringify((s.quote ?? "").slice(0, 120))}`);
}

const eb = await sql`
  SELECT tier, kind, COUNT(*) n FROM evidence_blocks WHERE run_id=${runId}
  GROUP BY tier, kind ORDER BY tier, kind`;
console.log("\nevidence_blocks:");
for (const r of eb) console.log(`  ${r.tier} ${r.kind} ${r.n}`);

console.log(`\nRUN_ID=${runId}`);
await sql.end();
