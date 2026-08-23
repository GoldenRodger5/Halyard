/**
 * Pooler classification — the difference between a loud failure and a silent one.
 *
 * §173. The worker case is the one that matters. A worker on the transaction
 * pooler still connects, still runs every query, and still reports success; the
 * only thing that breaks is that `pg_try_advisory_lock` stops holding, so two
 * workers can claim the same correction and both spend. Nothing in the logs says
 * so. That is why the worker refuses to start rather than warning.
 */
import { describe, expect, it } from 'vitest';
import { assertPoolerFor, describePooler } from './pooler.js';

const SESSION = 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const TRANSACTION = 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const DIRECT = 'postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres';
const LOCAL = 'postgresql://u:p@localhost:5432/halyard';

describe('classification', () => {
  it('reads the mode from the pooler port', () => {
    expect(describePooler(SESSION, 'web').mode).toBe('session');
    expect(describePooler(TRANSACTION, 'web').mode).toBe('transaction');
  });

  it('treats a non-pooler host as a direct connection whatever the port', () => {
    expect(describePooler(DIRECT, 'worker').mode).toBe('direct');
    expect(describePooler(LOCAL, 'worker').mode).toBe('direct');
  });

  it('never echoes credentials into the operator-facing detail', () => {
    for (const tier of ['web', 'worker'] as const) {
      for (const url of [SESSION, TRANSACTION, DIRECT, LOCAL]) {
        const { detail } = describePooler(url, tier);
        expect(detail).not.toContain('u:p');
        expect(detail).not.toContain('p@');
      }
    }
  });

  it('handles an unset or unparseable URL without throwing', () => {
    expect(describePooler(undefined, 'web').ok).toBe(false);
    expect(describePooler('', 'web').ok).toBe(false);
    expect(describePooler('not a url', 'web').mode).toBe('unknown');
  });
});

describe('what each tier needs', () => {
  it('wants transaction mode for the web tier', () => {
    expect(describePooler(TRANSACTION, 'web').ok).toBe(true);
    expect(describePooler(SESSION, 'web').ok).toBe(false);
    expect(describePooler(SESSION, 'web').detail).toMatch(/EMAXCONNSESSION/);
  });

  it('wants a real session for the worker — the opposite of the web tier', () => {
    expect(describePooler(SESSION, 'worker').ok).toBe(true);
    expect(describePooler(TRANSACTION, 'worker').ok).toBe(false);
  });

  it('accepts a direct connection for either tier', () => {
    expect(describePooler(DIRECT, 'web').ok).toBe(true);
    expect(describePooler(DIRECT, 'worker').ok).toBe(true);
  });
});

describe('the worker guard', () => {
  it('refuses to start on the transaction pooler', () => {
    expect(() => assertPoolerFor(TRANSACTION, 'worker')).toThrow(/advisory locks are session-scoped/i);
  });

  it('explains that this is correctness, not performance', () => {
    expect(() => assertPoolerFor(TRANSACTION, 'worker')).toThrow(/correctness failure/i);
  });

  it('starts on session mode, direct, and even an unset URL', () => {
    /*
     * An unset URL is someone else's error to report — the pool throws a clearer
     * message than this guard could, and failing here would just mask it.
     */
    expect(() => assertPoolerFor(SESSION, 'worker')).not.toThrow();
    expect(() => assertPoolerFor(DIRECT, 'worker')).not.toThrow();
    expect(() => assertPoolerFor(undefined, 'worker')).not.toThrow();
  });
});
