/**
 * Web plus worker plus a merged log tail, one command.
 *
 *   pnpm dev:all
 *
 * The worker runs from source with tsx rather than in a container, because a
 * container rebuild per edit is the wrong loop for development. Use
 * `./scripts/halyard --worker` when you want the real container.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COLOURS: Record<string, string> = {
  web: '[36m',
  worker: '[35m',
  system: '[2m',
};
const RESET = '[0m';

function log(source: string, line: string): void {
  const colour = COLOURS[source] ?? '';
  process.stdout.write(`${colour}${source.padEnd(6)}${RESET} ${line}\n`);
}

/** Read apps/web/.env.local so both processes agree on the database. */
function loadWebEnv(): Record<string, string> {
  const file = path.join(ROOT, 'apps/web/.env.local');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2]) out[match[1]] = match[2];
  }
  return out;
}

const children: ChildProcess[] = [];

function start(name: string, command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);

  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    createInterface({ input: stream }).on('line', (line) => {
      if (line.trim()) log(name, line);
    });
  }

  child.on('exit', (code) => {
    log('system', `${name} exited with code ${code}`);
    shutdown(code ?? 1);
  });
}

function shutdown(code = 0): void {
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const webEnv = loadWebEnv();
const env = { ...process.env, ...webEnv } as NodeJS.ProcessEnv;

if (!env.DATABASE_URL) {
  log('system', 'DATABASE_URL is not set. Run ./scripts/halyard once to repair the env file.');
  process.exit(1);
}

log('system', `database ${env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
if (!env.ANTHROPIC_API_KEY) log('system', 'ANTHROPIC_API_KEY unset — generation will not run');

start('web', 'pnpm', ['--filter', '@halyard/web', 'dev'], env);
start('worker', 'pnpm', ['--filter', '@halyard/worker', 'start'], {
  ...env,
  WORKER_ID: env.WORKER_ID ?? 'worker-dev',
});
