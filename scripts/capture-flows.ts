/**
 * Run a capture without the worker. Milestone 41.
 *
 * The worker owns captures in normal operation — /assets queues a job and it
 * picks it up. This is the same handler driven straight from a shell, for the
 * first run and for debugging, because waiting on a container to find out a
 * selector moved is a slow way to learn it.
 *
 *   pnpm exec tsx scripts/capture-flows.ts
 *   pnpm exec tsx scripts/capture-flows.ts --flow adapt_and_reveal
 *
 * It performs a real adaptation and spends a credit, so it asks nothing and
 * says so up front.
 */
import path from 'node:path';
import pg from 'pg';
import { FLOWS, allFlows, type FlowId } from '@halyard/core';
import { captureHandler } from '../apps/worker/src/handlers/capture.js';
import type { HandlerContext, Job } from '../apps/worker/src/poller.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = valueOf(args, '--flow') as FlowId | undefined;
  const productId = valueOf(args, '--product') ?? 'recipefix';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first, or export it.');
    process.exit(1);
  }

  process.env.HALYARD_CAPTURE_DIR ??= path.resolve(process.cwd(), '.discovery/captures');
  // Without Supabase Storage, captures land where the dev server can serve them.
  process.env.HALYARD_LOCAL_ASSET_DIR ??= path.resolve(
    process.cwd(),
    'apps/web/public/dev-assets',
  );

  const roots = (only ? [FLOWS[only]] : allFlows()).filter((f) => !f?.dependsOn);
  if (only && !FLOWS[only]) {
    console.error(`Unknown flow '${only}'. Known: ${allFlows().map((f) => f.id).join(', ')}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, max: 4 });
  const ctx: HandlerContext = {
    pool,
    workerId: 'capture-flows-script',
    log: (message, detail) =>
      console.log(`  ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`),
    enqueue: async () => undefined,
  };

  let failures = 0;
  for (const flow of roots) {
    const dependents = allFlows().filter((f) => f.dependsOn === flow.id);
    console.log(
      `\n${flow.id}${dependents.length ? ` (+${dependents.map((d) => d.id).join(', ')})` : ''}` +
        (flow.consumesCredit ? ' — performs a real adaptation and spends a credit' : ''),
    );

    const job = {
      id: 'local',
      kind: 'capture',
      payload: { flowId: flow.id, productId },
      attempts: 0,
    } as unknown as Job;

    try {
      await captureHandler(job, ctx);
      console.log(`✓ ${flow.id}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${flow.id} — ${(err as Error).message}`);
    }
  }

  const { rows } = await pool.query<{ n: string }>(
    `select count(*) as n from assets where source = 'capture' and archived_at is null`,
  );
  console.log(`\n${rows[0]?.n ?? 0} live capture assets. See /assets.`);

  await pool.end();
  if (failures > 0) process.exitCode = 1;
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('capture-flows.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
