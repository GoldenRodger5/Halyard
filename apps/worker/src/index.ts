/**
 * Worker entrypoint. Long-running Node container on Railway or Fly.
 *
 * Vercel route handlers cap out well below a video render, and Remotion and
 * Playwright both need real Chromium and sustained CPU (v1 §1). This process
 * owns anything measured in minutes.
 */
import pg from 'pg';
import { Poller } from './poller.js';
import { HANDLERS } from './handlers/index.js';
import { startScheduler } from './scheduler.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

async function main(): Promise<void> {
  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
  const connectionString = process.env.DATABASE_URL ?? requireEnv('SUPABASE_DB_URL');

  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 8),
    application_name: `halyard-worker/${workerId}`,
  });

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
