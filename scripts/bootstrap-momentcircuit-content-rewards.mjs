#!/usr/bin/env node
import { spawn } from 'node:child_process';

const CDP_HTTP = process.env.MOMENTCIRCUIT_CHROME_CDP || 'http://127.0.0.1:9229';
const CHROME_PATH =
  process.env.MOMENTCIRCUIT_CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_PATH =
  process.env.MOMENTCIRCUIT_CR_PROFILE ||
  '/Users/isaacmineo/PROJECT_2025/MomentCircuit/browser_profiles/contentrewards';
const APP_URL =
  'https://whop.com/contentrewards/exp_KZckYGtrnbujDg/app/';
const APP_DOMAIN = 'b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const BOOTSTRAP_URL =
  process.env.MOMENTCIRCUIT_CR_BOOTSTRAP_URL ||
  'https://aleiahgcxhglnsvaajzn.supabase.co/functions/v1/momentcircuit-cr-bootstrap';

const COOKIE_NAMES = new Set([
  '__Host-cr-session',
  '__Host-cr-access-token',
  '__Host-cr-access-token-refresh-at',
  '__Host-cr-whop-id',
]);

let nextId = 1;
const pending = new Map();
let launchedChrome = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function curl(args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/curl', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl exited ${code}`));
        return;
      }
      resolve(stdout);
    });
    if (input == null) child.stdin.end();
    else child.stdin.end(input);
  });
}

async function readCdpVersion() {
  const text = await curl([
    '--silent',
    '--show-error',
    '--fail',
    '--max-time', '2',
    `${CDP_HTTP}/json/version`,
  ]);
  const meta = JSON.parse(text);
  if (!meta.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools websocket is unavailable.');
  }
  return meta;
}

async function ensureDedicatedChrome() {
  try {
    return await readCdpVersion();
  } catch {}

  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${PROFILE_PATH}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=9229',
    '--no-first-run',
    '--no-default-browser-check',
    APP_URL,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  launchedChrome = true;

  let lastError;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      return await readCdpVersion();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Could not start the dedicated MomentCircuit Chrome profile on port 9229: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function cdpSocket() {
  const meta = await ensureDedicatedChrome();
  const ws = new WebSocket(meta.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(String(event.data)); } catch { return; }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
    else resolve(msg.result);
  });
  return ws;
}

function call(ws, method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function getRequiredCookies(ws) {
  const cookieResult = await call(ws, 'Storage.getCookies', {});
  const selected = {};
  for (const cookie of cookieResult.cookies || []) {
    if (cookie.domain === APP_DOMAIN && COOKIE_NAMES.has(cookie.name)) {
      selected[cookie.name] = cookie.value;
    }
  }
  return selected;
}

async function ensureContentRewardsSession(ws) {
  let selected = await getRequiredCookies(ws);
  const missing = () => [...COOKIE_NAMES].filter((name) => !selected[name]);
  if (!missing().length) return selected;

  await call(ws, 'Target.createTarget', { url: APP_URL });
  await sleep(4000);
  selected = await getRequiredCookies(ws);

  const stillMissing = missing();
  if (stillMissing.length) {
    throw new Error(
      `Content Rewards is not fully authenticated in the dedicated MomentCircuit Chrome profile. Missing: ${stillMissing.join(', ')}. Sign in to Content Rewards once as circuitmoment@gmail.com in that dedicated profile, then rerun this command.`,
    );
  }
  return selected;
}

async function bootstrapCloud(selected) {
  const payload = JSON.stringify({ cookies: selected });
  let stdout = '';
  let stderr = '';

  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/curl', [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--request', 'POST',
      BOOTSTRAP_URL,
      '--header', 'content-type: application/json',
      '--data-binary', '@-',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      let body = {};
      try { body = JSON.parse(stdout); } catch {}
      if (code !== 0) {
        reject(new Error(
          body.error ||
          stderr.trim() ||
          `Supabase bootstrap request failed with curl exit ${code}`,
        ));
        return;
      }
      resolve();
    });
    child.stdin.end(payload);
  });

  let body = {};
  try { body = JSON.parse(stdout); } catch {
    throw new Error('Supabase bootstrap returned an invalid response.');
  }
  return body;
}

async function main() {
  const ws = await cdpSocket();
  try {
    const selected = await ensureContentRewardsSession(ws);
    const result = await bootstrapCloud(selected);

    if (result.already_seeded) {
      console.log('Content Rewards cloud auth is already seeded.');
    } else if (result.authenticated) {
      console.log('Content Rewards cloud auth seeded and verified for circuitmoment@gmail.com.');
    } else {
      throw new Error('Cloud bootstrap did not confirm authentication.');
    }

    if (launchedChrome) {
      try { await call(ws, 'Browser.close', {}); } catch {}
    }
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch((error) => {
  console.error(
    `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
