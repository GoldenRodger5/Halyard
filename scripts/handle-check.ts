/**
 * Handle availability from the terminal. Milestone 50.
 *
 *   pnpm check-handle therecipefix
 *
 * The same checker /setup-kit uses, so the two never disagree. Read-only: it
 * asks public endpoints a question and reserves nothing.
 *
 * Only Bluesky can be answered definitively — it has a real resolver. The rest
 * are a public page returning 404 or not, and X and TikTok cannot be checked at
 * all without logging in. Those report unknown, which is not the same as free.
 */
import { CREATION_ORDER, checkHandleEverywhere, summariseChecks } from '@halyard/core';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

async function main(): Promise<void> {
  const handle = process.argv[2];
  if (!handle) {
    console.error('Usage: pnpm check-handle <handle>');
    process.exit(1);
  }

  const checks = await checkHandleEverywhere(handle, [...CREATION_ORDER]);

  console.log(`\n@${handle}\n`);
  for (const check of checks) {
    console.log(
      `  ${check.platform.padEnd(10)} ${check.status.padEnd(10)} ${DIM}${check.detail}${RESET}`,
    );
    console.log(`  ${''.padEnd(21)}${DIM}${check.checkUrl}${RESET}`);
  }
  console.log(`\n  ${summariseChecks(checks)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
