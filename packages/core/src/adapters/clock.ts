/**
 * Time, as something an adapter is given rather than something it reaches for.
 * §200.
 *
 * Three adapters poll a media container until the platform says it finished.
 * Each loop has two dependencies on the clock — how long to wait between polls,
 * and when to give up — and only the first was ever injectable. `sleep` could
 * be replaced; `Date.now()` could not.
 *
 * That asymmetry is what made rehearsal impossible. A dry run replaced `sleep`
 * with a no-op, so the loop stopped waiting — but the deadline was still five
 * real minutes away, and the poll still recorded a request every iteration. The
 * result was not a hang. It was five minutes of spinning as fast as the event
 * loop allows, accumulating a `RecordedRequest` each time, until the heap died.
 * The symptom looked like a timeout bug and was really a missing seam.
 *
 * A virtual clock closes it: `sleep` advances `now` instead of waiting, so a
 * five-minute ceiling at five-second intervals is exactly sixty iterations and
 * takes no time at all. The loop's own termination condition does the work —
 * no special dry-run branch inside `publish()`, which is the property that
 * keeps a rehearsal honest about the real path.
 *
 * Pure and Node-free. This is reachable from `@halyard/render` through the core
 * barrel, and gotcha 10 is unforgiving about that.
 */

export interface Clock {
  /** Milliseconds since the epoch, as this clock understands them. */
  now(): number;
  /** Resolve after `ms` have passed on this clock. */
  sleep(ms: number): Promise<void>;
}

/** The real one. Wall time, real waiting. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export interface VirtualClock extends Clock {
  /** How far the clock has been advanced, in ms. */
  elapsed(): number;
  /** How many times anything slept. */
  sleeps(): number;
}

/**
 * A clock that advances only when someone sleeps.
 *
 * `sleep` still yields to the event loop, so an adapter awaiting a stubbed
 * fetch between polls interleaves exactly as it would in production; what it
 * does not do is wait. Deterministic: the same code takes the same number of
 * iterations every run.
 */
export function createVirtualClock(startMs = Date.UTC(2026, 0, 1)): VirtualClock {
  let current = startMs;
  let count = 0;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += Math.max(0, ms);
      count += 1;
      await Promise.resolve();
    },
    elapsed: () => current - startMs,
    sleeps: () => count,
  };
}

/**
 * The clock an adapter should use, given the account it was handed.
 *
 * `meta.clock` is the seam. `meta.sleep` is honoured too, because it was the
 * old seam and callers still pass it — but a sleep alone cannot move a
 * deadline, so it is wrapped in a clock that keeps real time and the caller
 * gets the behaviour they actually asked for rather than a silent half-fix.
 */
export function clockFor(meta: Record<string, unknown> | undefined | null): Clock {
  const injected = meta?.clock as Clock | undefined;
  if (injected && typeof injected.now === 'function' && typeof injected.sleep === 'function') {
    return injected;
  }
  const sleep = meta?.sleep as ((ms: number) => Promise<void>) | undefined;
  if (typeof sleep === 'function') {
    return { now: () => Date.now(), sleep };
  }
  return systemClock;
}

/**
 * A ceiling on iterations, independent of the clock.
 *
 * Defence in depth. If a clock is ever injected that does not advance — a
 * `now` stub returning a constant, say — the deadline can never be reached and
 * the loop is unbounded again. Poll counts are small and knowable, so a limit
 * derived from the interval is a cheap second stop.
 */
export function maxPollsFor(timeoutMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 1;
  return Math.max(1, Math.ceil(timeoutMs / intervalMs) + 1);
}
