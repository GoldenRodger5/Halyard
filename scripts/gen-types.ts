/**
 * Generate packages/db/src/types.gen.ts from a live Postgres schema.
 *
 * `supabase gen types` needs a container runtime. This does the same job by
 * reading information_schema directly, so type generation works in CI and on a
 * laptop without Docker. Point it at any database the migrations have been
 * applied to.
 *
 *   pnpm db:types                       # uses DATABASE_URL
 *   DATABASE_URL=postgres://... pnpm db:types
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/db/src/types.gen.ts',
);

const PG_TO_TS: Record<string, string> = {
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  uuid: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  bool: 'boolean',
  json: 'Json',
  jsonb: 'Json',
  timestamptz: 'string',
  timestamp: 'string',
  date: 'string',
  time: 'string',
  bytea: 'string',
  interval: 'string',
};

interface Column {
  table: string;
  name: string;
  udt: string;
  isArray: boolean;
  nullable: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  comment: string | null;
  check: string | null;
}

function tsType(col: Column): string {
  // A CHECK constraint of the form `col in ('a','b')` becomes a union type —
  // this is where most of the value is, since it turns runtime states like
  // capability_state into compile-time exhaustiveness.
  if (col.check) {
    const literals = [...col.check.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
    if (literals.length > 0) {
      const union = literals.map((l) => `'${l}'`).join(' | ');
      return col.isArray ? `Array<${union}>` : union;
    }
  }
  const base = PG_TO_TS[col.udt] ?? 'unknown';
  return col.isArray ? `${base}[]` : base;
}

function pascal(name: string): string {
  return name
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54322/postgres';
  const client = new pg.Client({ connectionString });
  await client.connect();

  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_generated: string;
    identity_generation: string | null;
    ordinal_position: number;
  }>(
    `select c.table_name, c.column_name, c.udt_name, c.is_nullable,
            c.column_default, c.is_generated, c.identity_generation, c.ordinal_position
       from information_schema.columns c
       join information_schema.tables t
         on t.table_name = c.table_name and t.table_schema = c.table_schema
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      order by c.table_name, c.ordinal_position`,
  );

  // CHECK constraints, so `status text check (status in (...))` becomes a union.
  const { rows: checks } = await client.query<{ table_name: string; def: string }>(
    `select rel.relname as table_name, pg_get_constraintdef(con.oid) as def
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public' and con.contype = 'c'`,
  );

  const columns: Column[] = rows.map((r) => {
    const isArray = r.udt_name.startsWith('_');
    const udt = isArray ? r.udt_name.slice(1) : r.udt_name;
    const check =
      checks.find(
        (c) =>
          c.table_name === r.table_name &&
          new RegExp(`\\(?${r.column_name}\\)?\\s*=\\s*ANY`, 'i').test(c.def),
      )?.def ?? null;
    return {
      table: r.table_name,
      name: r.column_name,
      udt,
      isArray,
      nullable: r.is_nullable === 'YES',
      hasDefault: r.column_default !== null,
      isGenerated: r.is_generated === 'ALWAYS',
      comment: null,
      check,
    };
  });

  const byTable = new Map<string, Column[]>();
  for (const c of columns) {
    if (!byTable.has(c.table)) byTable.set(c.table, []);
    byTable.get(c.table)!.push(c);
  }

  const parts: string[] = [];
  parts.push(`/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with:  DATABASE_URL=postgres://... pnpm db:types
 * Source: scripts/gen-types.ts, reading information_schema of the migrated schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
`);

  const tableEntries: string[] = [];

  for (const [table, cols] of [...byTable.entries()].sort()) {
    const name = pascal(table);
    const row = cols
      .map((c) => `  ${c.name}: ${tsType(c)}${c.nullable ? ' | null' : ''};`)
      .join('\n');
    const insert = cols
      .filter((c) => !c.isGenerated)
      .map((c) => {
        const optional = c.nullable || c.hasDefault;
        return `  ${c.name}${optional ? '?' : ''}: ${tsType(c)}${c.nullable ? ' | null' : ''};`;
      })
      .join('\n');
    const update = cols
      .filter((c) => !c.isGenerated)
      .map((c) => `  ${c.name}?: ${tsType(c)}${c.nullable ? ' | null' : ''};`)
      .join('\n');

    parts.push(`export interface ${name}Row {\n${row}\n}`);
    parts.push(`export interface ${name}Insert {\n${insert}\n}`);
    parts.push(`export interface ${name}Update {\n${update}\n}`);
    tableEntries.push(
      `    ${table}: { Row: ${name}Row; Insert: ${name}Insert; Update: ${name}Update; Relationships: [] };`,
    );
  }

  parts.push(`export interface Database {
  public: {
    Tables: {
${tableEntries.join('\n')}
    };
    Views: Record<string, never>;
    Functions: {
      claim_next_job: { Args: { p_worker_id: string; p_kinds?: string[] }; Returns: JobsRow[] };
      reap_stale_jobs: { Args: { p_timeout?: string }; Returns: number };
      content_mix_actual: {
        Args: { p_product_id: string; p_persona: string; p_days?: number };
        Returns: Array<{ category: string; published: number; share: number }>;
      };
      product_content_share: {
        Args: { p_product_id: string; p_persona: string; p_days?: number };
        Returns: number;
      };
      queue_health: {
        Args: Record<string, never>;
        Returns: Array<{
          queued: number;
          running: number;
          failed_24h: number;
          dead: number;
          oldest_queued_seconds: number;
        }>;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
`);

  writeFileSync(OUT, parts.join('\n\n') + '\n', 'utf8');
  await client.end();
  console.log(`wrote ${OUT} — ${byTable.size} tables`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
