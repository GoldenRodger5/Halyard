/**
 * §159. A moved attribute should degrade a capture, not end it.
 *
 * Live evidence: `aria-label="Choose your swap"` was RecipeFix's one genuinely
 * stable hook. It moved, and three capture jobs a day died on
 * `Selector [aria-label="Choose your swap"] did not resolve` — three attempts
 * each, then dead. The answer is not a better guess at the markup, because
 * markup moves; it is to say the same intent several ways and record which one
 * answered.
 */
import { describe, expect, it } from 'vitest';
import { CANDIDATE_PROBE_MS, resolveSelector, selectorHealth } from './runFlow.js';
import type { Page } from 'playwright';

/** A page where only `resolves` can be found. */
function pageWhere(resolves: string[]): Page {
  return {
    locator: (sel: string) => stub(sel),
    getByRole: (role: string, opts: { name: unknown }) => stub(`role=${role}[name=${String(opts.name)}]`),
    getByText: (text: string) => stub(`text=${text}`),
  } as unknown as Page;

  function stub(key: string) {
    const ok = resolves.some((r) => key.includes(r));
    return {
      first: () => ({
        waitFor: async () => {
          if (!ok) throw new Error(`${key} did not resolve`);
        },
      }),
    };
  }
}

describe('resolveSelector', () => {
  it('uses the preferred selector when it works, at depth 0', async () => {
    const found = await resolveSelector(pageWhere(['data-testid="swap-control"']), {
      selector: '[data-testid="swap-control"]',
      fallbackSelectors: ['[aria-label="Choose your swap"]'],
    });
    expect(found?.fallbackDepth).toBe(0);
    expect(found?.selector).toContain('data-testid');
  });

  it('falls through to the candidate that still exists', async () => {
    // Exactly the production case: the testid is absent, the aria-label works.
    const found = await resolveSelector(pageWhere(['aria-label="Choose your swap"']), {
      selector: '[data-testid="swap-control"]',
      fallbackSelectors: ['[aria-label="Choose your swap"]', 'text=Choose your swap'],
    });
    expect(found?.fallbackDepth).toBe(1);
    expect(found?.selector).toContain('aria-label');
  });

  it('reaches a text candidate when every attribute has moved', async () => {
    const found = await resolveSelector(pageWhere(['text=Choose your swap']), {
      selector: '[data-testid="swap-control"]',
      fallbackSelectors: ['[aria-label="Choose your swap"]', 'text=Choose your swap'],
    });
    expect(found?.fallbackDepth).toBe(2);
  });

  it('returns null only when nothing at all resolves', async () => {
    const found = await resolveSelector(pageWhere([]), {
      selector: '[data-testid="swap-control"]',
      fallbackSelectors: ['[aria-label="Choose your swap"]'],
    });
    expect(found).toBeNull();
  });

  it('probes non-final candidates briefly, so four selectors cannot eat the job budget', async () => {
    /*
     * Trying four candidates at the step's full 30s timeout is how a capture
     * hits the five-minute ceiling and dies for a reason unrelated to the page.
     */
    const waits: number[] = [];
    const page = {
      locator: () => ({
        first: () => ({
          waitFor: async ({ timeout }: { timeout: number }) => {
            waits.push(timeout);
            throw new Error('nope');
          },
        }),
      }),
    } as unknown as Page;

    await resolveSelector(page, {
      selector: 'a',
      fallbackSelectors: ['b', 'c'],
      timeoutMs: 30_000,
    });

    expect(waits.slice(0, -1).every((w) => w === CANDIDATE_PROBE_MS)).toBe(true);
    // The last candidate gets the real timeout: if all else drifted, it is the step.
    expect(waits.at(-1)).toBe(30_000);
  });

  it('is a no-op for steps that carry no selector', async () => {
    expect(await resolveSelector(pageWhere([]), {})).toBeNull();
  });
});

describe('selectorHealth', () => {
  it('reports drift even when every step succeeded', async () => {
    // The point: a flow running entirely on fallbacks is working *and* is a
    // warning. The operator should learn that before the day it stops.
    const health = selectorHealth([
      { step: 'find the swap control', selector: '[aria-label="…"]', fallbackDepth: 1, ok: true },
      { step: 'still before', ok: true },
    ]);
    expect(health.drifted).toHaveLength(1);
    expect(health.drifted[0]!.depth).toBe(1);
    expect(health.broken).toHaveLength(0);
  });

  it('does not report a step that used its preferred selector', () => {
    const health = selectorHealth([
      { step: 'find', selector: '[data-testid="x"]', fallbackDepth: 0, ok: true },
    ]);
    expect(health.drifted).toHaveLength(0);
  });

  it('separates broken from drifted', () => {
    const health = selectorHealth([
      { step: 'gone', selector: 'x', ok: false },
      { step: 'drifted', selector: 'y', fallbackDepth: 2, ok: true },
    ]);
    expect(health.broken).toEqual(['gone']);
    expect(health.drifted.map((d) => d.step)).toEqual(['drifted']);
  });
});
