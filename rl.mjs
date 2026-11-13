import postgres from "postgres";
import fs from "node:fs";
const dbUrl = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1]
  .trim().replace(/^["']|["']$/g, "");
const sql = postgres(dbUrl, { ssl: "require" });
const runId = "run_7b53afd3f20841ef8403";

const rows = await sql`
  SELECT domain, verdict, timing_score, independent_signals, rule_fired, verdict_reason,
         is_b2b_saas, cert_status, size_band, is_services, fetches_used, missing_fields_json
  FROM companies WHERE run_id = ${runId} ORDER BY domain`;
for (const r of rows) {
  console.log(`\n--- ${r.domain} :: ${r.verdict} ${r.timing_score} ${r.rule_fired}`);
  console.log(`    b2b=${r.is_b2b_saas} cert=${r.cert_status} size=${r.size_band} services=${r.is_services} fetches=${r.fetches_used}`);
  console.log(`    missing=${r.missing_fields_json}`);
  console.log(`    reason: ${r.verdict_reason}`);
}

console.log("\n=== rocketlane fetches ===");
const f = await sql`
  SELECT f.* FROM fetches f JOIN companies c ON c.id = f.company_id
  WHERE c.run_id = ${runId} AND c.domain IN ('rocketlane.com','atlan.com') ORDER BY c.domain, f.fetched_at`;
for (const r of f) console.log(`  ${r.ok ? "ok " : "FAIL"} t${r.tier} ${r.from_cache ? "cache" : "live "} ${String(r.word_count ?? 0).padStart(5)}w ${r.url}`);

console.log("\n=== loop trace: rocketlane ===");
const t = await sql`
  SELECT l.* FROM loop_trace l JOIN companies c ON c.id = l.company_id
  WHERE c.run_id = ${runId} AND c.domain = 'rocketlane.com' ORDER BY l.step`;
for (const r of t) console.log("  " + JSON.stringify(r));

await sql.end();
