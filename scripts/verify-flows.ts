/**
 * The verification gate. Milestone 41 Part B.
 *
 * "Never record blind." A capture that runs against a page whose markup has
 * moved does not fail loudly — it produces a video of a spinner, or of an error
 * state, and nobody notices until it is in a post. So every flow's selectors are
 * walked against the live site before anything is recorded, weekly and after any
 * RecipeFix release.
 *
 *   pnpm exec tsx scripts/verify-flows.ts
 *   pnpm exec tsx scripts/verify-flows.ts --flow swap_toggle --headed
 *   pnpm exec tsx scripts/verify-flows.ts --allow-credits   # run the paid flow
 *
 * A missing selector fails with the step name, the selector, and a screenshot of
 * what the page actually looked like. Exit code 1, so it can be a cron.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { FLOWS, allFlows, requiredSelectors, type FlowId } from '@halyard/core';
import { runFlowChain, type FlowRunResult } from '../apps/worker/src/capture/runFlow.js';

const OUT_DIR = path.resolve(process.cwd(), '.discovery/verify');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = valueOf(args, '--base') ?? process.env.RECIPEFIX_WEB_URL ?? 'https://recipefix.app';
  const only = valueOf(args, '--flow') as FlowId | undefined;
  const headed = args.includes('--headed');
  // adapt_and_reveal spends a real adaptation credit, so it is opt-in. The other
  // two run against a result that already exists.
  const allowCredits = args.includes('--allow-credits');

  if (only && !FLOWS[only]) {
    console.error(`Unknown flow '${only}'. Known: ${allFlows().map((f) => f.id).join(', ')}`);
    process.exit(1);
  }

  // A dependent flow acts on a result card, so running it alone would open a
  // blank page and report a missing selector that is not missing. Asking for one
  // runs its root chain, which is the only way it can run at all.
  let flows = allFlows().filter((f) => !f.dependsOn);
  if (only) {
    const requested = FLOWS[only];
    const rootId = requested.dependsOn ?? requested.id;
    if (requested.dependsOn) {
      console.log(
        `${only} acts on a result card, so ${rootId} runs first in the same browser context.\n`,
      );
    }
    flows = [FLOWS[rootId]];
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Verifying ${flows.length} flow(s) against ${base}\n`);

  const browser = await chromium.launch({ headless: !headed });
  const results: FlowRunResult[] = [];
  let skipped = 0;

  for (const flow of flows) {
    const dependents = allFlows().filter((f) => f.dependsOn === flow.id);

    if (flow.consumesCredit && !allowCredits) {
      skipped += 1 + dependents.length;
      for (const f of [flow, ...dependents]) {
        console.log(`⊘ ${f.id}`);
        console.log(
          `    Skipped: verifying it means performing a real adaptation, which spends a credit. Re-run with --allow-credits.`,
        );
        console.log(`    Selectors it depends on, unverified:`);
        for (const s of requiredSelectors(f)) console.log(`      · ${s.step} → ${s.selector}`);
        console.log('');
      }
      continue;
    }

    process.stdout.write(`· ${flow.id}${dependents.length ? ` (+${dependents.length} dependent)` : ''} … `);
    const chain = await runFlowChain(flow, {
      baseUrl: base,
      outDir: OUT_DIR,
      mode: 'verify',
      browser,
    });
    results.push(...chain);

    console.log(chain.every((r) => r.ok) ? 'ok' : 'FAILED');
    for (const result of chain) {
      console.log(`    ${result.flow}: ${result.summary}`);
      for (const step of result.steps.filter((s) => !s.ok)) {
        console.log(
          `      ✗ ${step.step}${step.selector ? ` — ${step.selector}` : ''}${step.optional ? ' (optional, continued)' : ''}`,
        );
      }
    }
    console.log('');
  }

  await browser.close();

  writeFileSync(
    path.join(OUT_DIR, 'last-run.json'),
    JSON.stringify({ base, ranAt: new Date().toISOString(), results }, null, 2),
  );

  const failures = results.filter((r) => !r.ok);
  console.log(
    `${results.length - failures.length}/${results.length} flows verified` +
      (skipped > 0 ? `, ${skipped} skipped as credit-consuming` : '') +
      `. Report: ${path.join(OUT_DIR, 'last-run.json')}`,
  );

  if (failures.length > 0) {
    console.log(
      '\nA failed selector is almost always a copy change on the RecipeFix side. Re-run ' +
        'scripts/discover-selectors.ts against the page, find the element in the annotated PNG, ' +
        'and update the flow definition in packages/core/src/capture/flows.ts.',
    );
    process.exit(1);
  }
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('verify-flows.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
