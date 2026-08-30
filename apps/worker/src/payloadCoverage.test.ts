/**
 * §375. Every key put into a job payload is read by the handler that gets it.
 *
 * The recurring bug in this codebase has one shape: a feature is declared,
 * typed, tested for a property, and never executed. `requires`, `fillSecret`,
 * `calloutsFromSteps`, `planAnnotations`, `platformFinish`, the quiz options —
 * all the same. It happened again in §373: an adjustment enqueued
 * `correct_content` with a `component` and an `action`, the handler read only
 * `contentItemId`, and the request was silently turned back into a gate-driven
 * decision. Nothing threw. The button appeared to work.
 *
 * A payload key is the easiest place in the system for that to happen, because
 * `payload` is `jsonb` and neither side has a type the other checks. So this
 * reads both sides out of the source and compares them.
 *
 * ## Both sides of the wall
 *
 * The first version of this test read only the worker, and would therefore have
 * missed the very bug it was written for: the web app enqueues jobs with a raw
 * `insert into jobs`, not `ctx.enqueue`, and that is where the adjustment's
 * `component` and `action` were written. A guard that covers the half of the
 * system where the fault was not is worse than none, because it reads as
 * coverage.
 *
 * ## Why source text rather than types
 *
 * There is no type to check. `Record<string, unknown>` on one side and
 * `job.payload.x` on the other is exactly the hole; a test that could be
 * written against types would already be a compiler error.
 *
 * ## What it deliberately does not assert
 *
 * The reverse — a key read but never written — is legitimate. A handler reads
 * `job.payload.limit` with a default, and the scheduler enqueues without one.
 * An optional input is a real thing; a *written* key nobody reads is a promise
 * to the caller that is not kept.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKER = join(__dirname);
/* The web app enqueues too, with raw SQL. That is where §373's fault was. */
const WEB = join(__dirname, '..', '..', 'web', 'src');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const workerSource = sourceFiles(WORKER)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const webSource = sourceFiles(WEB)
  .filter((f) => !f.endsWith('.tsx'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
/* Written on either side; read only by the worker, which is the asymmetry. */
const enqueueSource = `${workerSource}\n${webSource}`;
const source = workerSource;

/**
 * Keys written into an enqueued payload.
 *
 * Matches `ctx.enqueue('kind', { a, b: x })` and pulls the key names out of the
 * object literal. Deliberately shallow: a nested object is one key from the
 * handler's point of view, and it is the top level that gets dropped.
 */
function writtenKeys(): Map<string, Set<string>> {
  const byKind = new Map<string, Set<string>>();
  const call = /enqueue\(\s*'([a-z_]+)'\s*,\s*\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(enqueueSource)) !== null) {
    const kind = match[1]!;
    const body = match[2]!;
    const keys = byKind.get(kind) ?? new Set<string>();
    for (const part of body.split(',')) {
      const name = part.trim().split(':')[0]!.trim();
      /* Shorthand and `key: value` both land here; spreads and blanks do not. */
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) keys.add(name);
    }
    byKind.set(kind, keys);
  }
  /*
   * The web app's raw inserts. `values ('kind', $1, …)` with the payload as a
   * parameter, so the object literal is found by looking at the arguments
   * array that follows rather than inside the SQL.
   */
  /*
   * Anchored on `insert into jobs`. Without it this also matched the audit log
   * and the notifications table — `values ('human', …)` and `values ('system',
   * …)` — and reported their columns as orphaned job payload keys. A guard that
   * cries wolf gets an exclusion list bolted on and then gets ignored.
   */
  const raw =
    /insert\s+into\s+jobs[\s\S]{0,240}?values\s*\(\s*'([a-z_]+)'[\s\S]{0,200}?\[\s*\{([^{}]*)\}/g;
  while ((match = raw.exec(enqueueSource)) !== null) {
    const kind = match[1]!;
    const keys = byKind.get(kind) ?? new Set<string>();
    for (const part of match[2]!.split(',')) {
      const name = part.trim().split(':')[0]!.trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) keys.add(name);
    }
    byKind.set(kind, keys);
  }

  return byKind;
}

/** Every key any handler reads off a payload, anywhere in the worker. */
function readKeys(): Set<string> {
  const keys = new Set<string>();
  for (const match of source.matchAll(/(?:job|payload)\.payload\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    keys.add(match[1]!);
  }
  /* `job.payload.x as T` and destructuring both appear; so does bracket access. */
  for (const match of source.matchAll(/payload\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\]/g)) {
    keys.add(match[1]!);
  }
  for (const match of source.matchAll(/payload\s*\??\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    keys.add(match[1]!);
  }
  return keys;
}

describe('job payloads', () => {
  it('finds the enqueue calls at all', () => {
    /*
     * A regex that silently matches nothing would make this test pass forever
     * while checking nothing, which is the failure mode of every source-reading
     * test ever written.
     */
    const written = writtenKeys();
    expect(written.size).toBeGreaterThan(5);
    expect(readKeys().size).toBeGreaterThan(10);
    /*
     * And that it sees the web app's raw inserts specifically — the half that
     * the first version of this test missed entirely.
     */
    expect(written.get('correct_content')?.has('component')).toBe(true);
  });

  it('has a reader for every key a caller puts in', () => {
    /*
     * §373 is the reason this exists: `correct_content` was enqueued with a
     * `component` and an `action` and the handler read neither, so the operator
     * pressed a button and got a gate-driven decision instead.
     */
    const read = readKeys();
    const orphans: string[] = [];
    for (const [kind, keys] of writtenKeys()) {
      for (const key of keys) {
        if (!read.has(key)) orphans.push(`${kind}.${key}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});
