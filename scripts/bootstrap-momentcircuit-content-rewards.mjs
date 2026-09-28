#!/usr/bin/env node
import { chromium } from 'playwright-core';

const CDP = process.env.MOMENTCIRCUIT_CHROME_CDP || 'http://127.0.0.1:9229';
const APP_ORIGIN = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const BOOTSTRAP_URL =
  process.env.MOMENTCIRCUIT_CR_BOOTSTRAP_URL ||
  'https://halyard-ten.vercel.app/api/internal/momentcircuit/content-rewards/bootstrap-once';

const COOKIE_NAMES = [
  '__Host-cr-session',
  '__Host-cr-access-token',
  '__Host-cr-access-token-refresh-at',
  '__Host-cr-whop-id',
];

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No Chrome context available on the MomentCircuit CDP port.');

  const cookies = await contexts[0].cookies(APP_ORIGIN);
  const selected = Object.fromEntries(
    cookies
      .filter((cookie) => COOKIE_NAMES.includes(cookie.name))
      .map((cookie) => [cookie.name, cookie.value]),
  );

  for (const name of COOKIE_NAMES) {
    if (!selected[name]) {
      throw new Error(`Missing ${name}. Open the authenticated Content Rewards creator app in the dedicated MomentCircuit Chrome profile, then retry.`);
    }
  }

  const response = await fetch(BOOTSTRAP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cookies: selected }),
  });

  let result;
  try { result = await response.json(); }
  catch { result = { error: `HTTP ${response.status}` }; }

  if (!response.ok) {
    throw new Error(result?.error || `Bootstrap failed with HTTP ${response.status}`);
  }

  if (result.already_seeded) {
    console.log('Content Rewards cloud auth is already seeded.');
  } else if (result.authenticated) {
    console.log('Content Rewards cloud auth seeded and verified for circuitmoment@gmail.com.');
  } else {
    console.log('Bootstrap completed.');
  }
}

main().catch((error) => {
  console.error(`Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
