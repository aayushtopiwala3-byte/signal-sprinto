import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * One tagged-template `sql` over two drivers (D-07).
 *
 * `DATABASE_URL` set   → postgres.js against Neon.
 * `DATABASE_URL` unset → PGlite, a real Postgres compiled to WASM, in memory. That is what
 *                        lets the app boot and the tests run with zero credentials.
 *
 * Only plain value interpolation is supported, which keeps the two backends behaviourally
 * identical and means every interpolation becomes a bound `$n` parameter — never concatenated
 * into the SQL string.
 */

export type Row = Record<string, unknown>;

type Driver = {
  kind: "neon" | "pglite";
  query: (text: string, params: unknown[]) => Promise<Row[]>;
  close: () => Promise<void>;
};

type Cache = { driver: Driver | null; ready: Promise<Driver> | null };

const globalCache = globalThis as unknown as { __signalDb?: Cache };
const cache: Cache = (globalCache.__signalDb ??= { driver: null, ready: null });

function schemaSql(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib/db/schema.sql"), "utf8");
}

/**
 * PGlite cannot run the whole file in one call because it wraps multi-statement input in an
 * implicit transaction that aborts wholesale on any error. Splitting on `;` is safe here
 * because schema.sql contains no function bodies or dollar-quoted strings.
 */
function statements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*$/m)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);
}

// Postgres date/timestamp OIDs. Both drivers parse these into JavaScript `Date` objects by
// default, which breaks D-03's claim that the two backends behave identically: every row type
// in queries.ts declares these columns as `string`, and TypeScript cannot catch the lie because
// the driver's return value is cast. The divergence surfaced as a 500 on /health — React
// refuses to render a Date — only once a real Neon run existed. Handing the text through
// untouched makes the declared types true on both drivers.
const TIMESTAMP_OIDS = [1082, 1114, 1184];
const asIs = (v: string) => v;

async function createDriver(): Promise<Driver> {
  const url = env.databaseUrl();

  if (url) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, {
      max: 3,
      idle_timeout: 20,
      prepare: false,
      types: {
        timestampAsText: { to: 1184, from: TIMESTAMP_OIDS, serialize: asIs, parse: asIs },
      },
    });
    const driver: Driver = {
      kind: "neon",
      query: async (text, params) =>
        (await client.unsafe(text, params as never[])) as unknown as Row[],
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
    for (const stmt of statements(schemaSql())) await driver.query(stmt, []);
    return driver;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({
    parsers: Object.fromEntries(TIMESTAMP_OIDS.map((oid) => [oid, asIs])),
  });
  const driver: Driver = {
    kind: "pglite",
    query: async (text, params) => (await pg.query(text, params)).rows as Row[],
    close: async () => {
      await pg.close();
    },
  };
  for (const stmt of statements(schemaSql())) await driver.query(stmt, []);
  return driver;
}

export async function db(): Promise<Driver> {
  if (cache.driver) return cache.driver;
  cache.ready ??= createDriver().then((d) => {
    cache.driver = d;
    return d;
  });
  return cache.ready;
}

/** `true` when running on the in-memory driver, which /health surfaces as a red banner. */
export async function driverKind(): Promise<"neon" | "pglite"> {
  return (await db()).kind;
}

export async function sql<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  const driver = await db();
  return (await driver.query(text, values)) as T[];
}

/** First row or null, for the many single-row lookups. */
export async function one<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await sql<T>(strings, ...values);
  return rows.length > 0 ? rows[0] : null;
}

/** Deterministic-length opaque id. Used for every primary key. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
