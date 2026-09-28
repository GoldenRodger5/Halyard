#!/usr/bin/env node
import { spawn } from 'node:child_process';

const CDP_HTTP = process.env.MOMENTCIRCUIT_CHROME_CDP || 'http://127.0.0.1:9229';
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

async function cdpSocket() {
  const version = await fetch(`${CDP_HTTP}/json/version`);
  if (!version.ok) {
    throw new Error('MomentCircuit Chrome is not running on port 9229.');
  }
  const meta = await version.json();
  if (!meta.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools websocket is unavailable.');
  }

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

async function main() {
  const ws = await cdpSocket();
  try {
    const result = await call(ws, 'Storage.getCookies', {});
    const selected = {};
    for (const cookie of result.cookies || []) {
      if (cookie.domain === APP_DOMAIN && COOKIE_NAMES.has(cookie.name)) {
        selected[cookie.name] = cookie.value;
      }
    }

    for (const name of COOKIE_NAMES) {
      if (!selected[name]) {
        throw new Error(
          `Missing ${name}. Open Content Rewards in the dedicated MomentCircuit Chrome profile and confirm you are signed in as circuitmoment@gmail.com, then retry.`,
        );
      }
    }

    const payload = JSON.stringify({ cookies: selected });
    const result = await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/curl', [
        '--silent',
        '--show-error',
        '--fail-with-body',
        '--request', 'POST',
        BOOTSTRAP_URL,
        '--header', 'content-type: application/json',
        '--data-binary', '@-',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        let body = {};
        try { body = JSON.parse(stdout); } catch {}
        if (code !== 0) {
          reject(new Error(body.error || stderr.trim() || `curl exited ${code}`));
          return;
        }
        resolve(body);
      });

      child.stdin.end(payload);
    });

    if (result.already_seeded) {
      console.log('Content Rewards cloud auth is already seeded.');
    } else if (result.authenticated) {
      console.log('Content Rewards cloud auth seeded and verified for circuitmoment@gmail.com.');
    } else {
      console.log('Content Rewards cloud auth bootstrap completed.');
    }
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(`Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
