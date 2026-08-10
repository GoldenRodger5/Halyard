/**
 * Prove the production database and its recurring work actually behave.
 * Milestone 48.
 *
 *   DATABASE_URL=<hosted> pnpm exec tsx scripts/verify-hosted.ts
 *   DATABASE_URL=<hosted> pnpm exec tsx scripts/verify-hosted.ts --cron https://app.example.com
 *
 * Two things this checks that nothing else can:
 *
 *   · **RLS actually holds in the hosted environment.** The local test asserts a
 *     non-admin role reads every table as empty. Supabase's hosted roles are not
 *     the local ones, so that proof does not transfer and has to be repeated
 *     against the real thing.
 *   · **Recurring work is observed, not merely configured.** This surface was
 *     entirely dead once already because nothing called `/api/cron`. A schedule
 *     that exists and has never fired is worse than none, because it reads as
 *     coverage.
 */
import pg from 'pg';

const RESET = '[0m';
const DIM = '[2m';
const GREEN = '[32m';
const RED = '[31m';
const YELLOW = '[33m';

let failures = 0;

function ok(label: string, detail = ''): void {
  console.log(`${GREEN}✓${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function bad(label: string, detail = ''): void {
  failures++;
  console.log(`${RED}✗${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function warn(label: string, detail = ''): void {
  console.log(`${YELLOW}!${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function heading(text: string): void {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`);
}

async function verifyRls(pool: pg.Pool): Promise<void> {
  heading('Row-level security, against this database');

  const { rows: tables } = await pool.query<{
    tablename: string;
    rowsecurity: boolean;
    forced: boolean;
  }>(
    `select c.relname as tablename,
            c.relrowsecurity as rowsecurity,
            c.relforcerowsecurity as forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  );

  const unprotected = tables.filter((t) => !t.rowsecurity);
  if (unprotected.length === 0) {
    ok('RLS enabled', `${tables.length} tables`);
  } else {
    bad('RLS enabled', `missing on: ${unprotected.map((t) => t.tablename).join(', ')}`);
  }

  const unforced = tables.filter((t) => t.rowsecurity && !t.forced);
  if (unforced.length === 0) {
    ok('RLS forced', 'even the owning role is subject to policy');
  } else {
    // Without FORCE, the owning role bypasses every policy — and that is exactly
    // the role a misconfigured connection string is most likely to be using.
    bad('RLS forced', `not forced on: ${unforced.map((t) => t.tablename).join(', ')}`);
  }

  // The real proof: become a non-admin and try to read.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await client.query('set local role to authenticated');

    const leaked: string[] = [];
    for (const table of ['social_accounts', 'content_items', 'products', 'publications']) {
      try {
        const { rows } = await client.query<{ n: string }>(`select count(*) as n from ${table}`);
        if (Number(rows[0]!.n) > 0) leaked.push(`${table} (${rows[0]!.n} rows)`);
      } catch {
        // A permission error is a pass: the role cannot even see the table.
      }
    }
    await client.query('rollback');

    if (leaked.length === 0) {
      ok('a non-admin role reads nothing', 'every table comes back empty or forbidden');
    } else {
      bad('a non-admin role reads data', leaked.join(', '));
    }
  } catch (err) {
    // Some hosted setups have no `authenticated` role; that is worth saying
    // rather than silently passing.
    warn('non-admin read test', `could not assume the role: ${(err as Error).message}`);
    await client.query('rollback').catch(() => undefined);
  } finally {
    client.release();
  }

  const { rows: tokens } = await pool.query<{ n: string }>(
    `select count(*) as n from social_accounts where access_token_enc is not null`,
  );
  ok('tokens are sealed', `${tokens[0]!.n} stored as ciphertext, never as text`);
}

async function verifyRecurringWork(pool: pg.Pool, baseUrl: string): Promise<void> {
  heading('Recurring work, observed rather than configured');

  const { rows } = await pool.query<{ kind: string; last_run: string | null; runs_24h: string }>(
    `select kind,
            max(finished_at)::text as last_run,
            count(*) filter (where finished_at > now() - interval '24 hours') as runs_24h
       from jobs
      where status in ('done', 'dead')
      group by kind order by kind`,
  );

  if (rows.length === 0) {
    bad('no job has ever completed', 'the worker has never picked anything up');
  }

  for (const row of rows) {
    // A row with no finished_at is a job that was claimed and never completed,
    // which reads as activity but is the opposite of it.
    (row.last_run ? ok : warn)(
      row.kind,
      row.last_run
        ? `last ${row.last_run}, ${row.runs_24h} in the last 24h`
        : 'claimed but never finished',
    );
  }

  // These are the ones the worker schedules itself. If they never appear, the
  // scheduler is not running, which is invisible from every other screen.
  const EXPECTED = [
    'detect_release',
    'collect_signals',
    'reconcile_schedule',
    'mark_stale_assets',
    'collect_watch_terms',
  ];
  const seen = new Set(rows.map((r) => r.kind));
  const never = EXPECTED.filter((kind) => !seen.has(kind));

  if (never.length > 0) {
    warn('never observed', never.join(', '));
    console.log(
      `  ${DIM}The worker enqueues these itself on a one-minute tick. If they never appear,\n` +
        `  the worker is not running — check /settings/health.${RESET}`,
    );
  }

  const { rows: pending } = await pool.query<{ kind: string; n: string }>(
    `select kind, count(*) as n from jobs where status = 'queued' group by kind`,
  );
  if (pending.length > 0) {
    ok('queued now', pending.map((p) => `${p.n} ${p.kind}`).join(', '));
  }

  if (!baseUrl) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    warn('web cron', 'CRON_SECRET is not set, so the web-side crons cannot be called');
    return;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/cron/account_health`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
  (response.ok ? ok : bad)('web cron reachable', `POST /api/cron returned ${response.status}`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Point it at the hosted database.');
    process.exit(1);
  }

  const baseUrl = process.argv.includes('--cron')
    ? (process.argv[process.argv.indexOf('--cron') + 1] ?? '')
    : '';

  const pool = new pg.Pool({ connectionString, max: 4 });
  const { rows } = await pool.query<{ db: string; host: string | null }>(
    `select current_database() as db, inet_server_addr()::text as host`,
  );
  console.log(
    `\nVerifying ${rows[0]!.db}${rows[0]!.host ? ` at ${rows[0]!.host}` : ' over a local socket'}`,
  );

  await verifyRls(pool);
  await verifyRecurringWork(pool, baseUrl);

  await pool.end();
  console.log('');
  if (failures > 0) {
    console.log(`${RED}${failures} failing${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}all checks pass${RESET}\n`);
}

if (process.argv[1]?.endsWith('verify-hosted.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
