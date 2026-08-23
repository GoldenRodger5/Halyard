/**
 * Worker entrypoint. Long-running Node container on Railway or Fly.
 *
 * Vercel route handlers cap out well below a video render, and Remotion and
 * Playwright both need real Chromium and sustained CPU (v1 §1). This process
 * owns anything measured in minutes.
 */
import pg from 'pg';
import { assertPoolerFor } from '@halyard/core';
import { Poller } from './poller.js';
import { HANDLERS } from './handlers/index.js';
import { startScheduler } from './scheduler.js';
import { startErrorReporting } from './observability.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

async function main(): Promise<void> {
  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
  const connectionString = process.env.DATABASE_URL ?? requireEnv('SUPABASE_DB_URL');

  /*
   * §173. The worker must hold a real session, and this refuses to start if it
   * does not. §165's correction claim is `pg_try_advisory_lock`; behind a
   * transaction pooler that lock is taken and dropped around a single statement
   * and guards nothing, so two workers would both believe they had the claim. The
   * failure would show up only as duplicated correction spend, long after the
   * misconfiguration, which is exactly the kind of silence worth crashing over.
   */
  const pooler = assertPoolerFor(connectionString, 'worker');
  console.log(
    JSON.stringify({ message: 'database.pooler', worker: workerId, mode: pooler.mode, ok: pooler.ok }),
  );

  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 8),
    application_name: `halyard-worker/${workerId}`,
  });

  await startErrorReporting((message, detail) =>
    console.log(JSON.stringify({ message, worker: workerId, ...detail })),
  );

  const poller = new Poller({ pool, workerId, handlers: HANDLERS });

  // Periodic work is enqueued from here rather than by an external cron, so
  // "runs weekly" means it runs, on any host, with nothing else configured.
  const stopScheduler = startScheduler(pool, (message, detail) =>
    console.log(JSON.stringify({ message, worker: workerId, ...detail })),
  );

  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ message: 'shutdown', signal, worker: workerId }));
    stopScheduler();
    poller.stop();
    void pool.end().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await poller.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
