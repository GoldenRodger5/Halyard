/**
 * §357. The retry storm, as a rule rather than a memory.
 *
 * The first version enqueued a new capture from inside a handler the poller was
 * itself about to retry. Two layers retrying one failure without knowing about
 * each other: 34 diagnoses, 28 enqueued retries and 23 dead jobs in two hours,
 * and a worker too busy for the `generate` job queued behind them.
 */
import { describe, it, expect } from 'vitest';

const CAPTURE_MAX_ATTEMPTS = 2;

/** The decision the handler makes, extracted so it can be reasoned about. */
function wouldRetry(input: {
  attempts: number;
  automatic: boolean;
  recovery: string;
  inputAttempt: number;
  alternatives: string[];
}): { retries: boolean; because: string } {
  if (!input.automatic || input.recovery !== 'retry_with_different_input') {
    return { retries: false, because: 'the diagnosis did not ask for a different input' };
  }
  if (input.attempts < CAPTURE_MAX_ATTEMPTS) {
    return { retries: false, because: 'the poller is still retrying this job' };
  }
  if (input.inputAttempt >= input.alternatives.length) {
    return { retries: false, because: 'every alternative has been tried' };
  }
  return { retries: true, because: 'this job is finished retrying and an input is left' };
}

const base = {
  automatic: true,
  recovery: 'retry_with_different_input',
  inputAttempt: 0,
  alternatives: ['a', 'b'],
};

describe('the capture input retry', () => {
  it('does not fire while the poller is still retrying', () => {
    /* The bug: acting here doubles the chains at every failure. */
    expect(wouldRetry({ ...base, attempts: 1 }).retries).toBe(false);
  });

  it('fires once the job has stopped retrying', () => {
    expect(wouldRetry({ ...base, attempts: 2 }).retries).toBe(true);
  });

  it('stops when every alternative has been tried', () => {
    expect(wouldRetry({ ...base, attempts: 2, inputAttempt: 2 }).retries).toBe(false);
    expect(wouldRetry({ ...base, attempts: 2, inputAttempt: 5 }).retries).toBe(false);
  });

  it('never fires for a diagnosis that asks for something else', () => {
    /* `fix_code` and `rediscover_selectors` are not fixed by another input. */
    expect(wouldRetry({ ...base, attempts: 2, recovery: 'fix_code' }).retries).toBe(false);
    expect(wouldRetry({ ...base, attempts: 2, recovery: 'rediscover_selectors' }).retries).toBe(false);
  });

  it('never fires for a diagnosis that is not automatic', () => {
    expect(wouldRetry({ ...base, attempts: 2, automatic: false }).retries).toBe(false);
  });

  it('terminates: a full chain is bounded by the alternatives it has', () => {
    /*
     * The property that matters. Walking the chain to exhaustion must reach a
     * stop, and with two alternatives it must take at most two retries.
     */
    let inputAttempt = 0;
    let fired = 0;
    while (wouldRetry({ ...base, attempts: 2, inputAttempt }).retries) {
      fired += 1;
      inputAttempt += 1;
      expect(fired).toBeLessThanOrEqual(base.alternatives.length);
    }
    expect(fired).toBe(base.alternatives.length);
  });

  it('explains itself whether it fires or not', () => {
    expect(wouldRetry({ ...base, attempts: 1 }).because).toContain('poller');
    expect(wouldRetry({ ...base, attempts: 2, inputAttempt: 9 }).because).toContain('alternative');
  });
});
