/**
 * §206. The defect being fixed, stated first.
 *
 * `generate` ordered signals by `relevance desc, created_at desc`, so a
 * six-month-old trend at 0.9 permanently outranked today's at 0.7. The first
 * test is that comparison; everything after it guards the curve.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HALF_LIFE_DAYS,
  HALF_LIFE_DAYS,
  effectiveValue,
  expiryFor,
  freshness,
  isSignalStale,
  rankSignals,
  type DiscoverySignal,
} from './freshness.js';

const NOW = new Date('2026-08-28T00:00:00Z');
const DAY = 86_400_000;

function sig(overrides: Partial<DiscoverySignal> & { id: string }): DiscoverySignal {
  return {
    source: 'trend',
    relevance: 0.8,
    observedAt: new Date(NOW.getTime() - DAY),
    ...overrides,
  };
}

describe('the defect', () => {
  it('no longer lets an old strong signal beat a fresh weaker one', () => {
    const old = sig({
      id: 'old',
      relevance: 0.9,
      observedAt: new Date(NOW.getTime() - 180 * DAY),
    });
    const fresh = sig({ id: 'fresh', relevance: 0.7, observedAt: NOW });

    expect(effectiveValue(fresh, NOW)).toBeGreaterThan(effectiveValue(old, NOW));
    expect(rankSignals([old, fresh], NOW)[0]!.id).toBe('fresh');
  });

  it('drops a six-month-old trend from the list entirely', () => {
    const old = sig({ id: 'old', observedAt: new Date(NOW.getTime() - 180 * DAY) });
    expect(isSignalStale(old, NOW)).toBe(true);
    expect(rankSignals([old], NOW)).toEqual([]);
  });
});

describe('freshness', () => {
  it('is full value at the moment of observation', () => {
    expect(freshness(sig({ id: 'a', observedAt: NOW }), NOW)).toBe(1);
  });

  it('halves over one half-life', () => {
    const s = sig({
      id: 'a',
      source: 'trend',
      observedAt: new Date(NOW.getTime() - HALF_LIFE_DAYS.trend * DAY),
    });
    expect(freshness(s, NOW)).toBeCloseTo(0.5, 5);
  });

  it('ages a trend far faster than a changelog entry', () => {
    const week = new Date(NOW.getTime() - 7 * DAY);
    const trend = freshness(sig({ id: 't', source: 'trend', observedAt: week }), NOW);
    const changelog = freshness(sig({ id: 'c', source: 'changelog', observedAt: week }), NOW);
    expect(changelog).toBeGreaterThan(trend * 3);
  });

  it('uses the default for an unknown source rather than treating it as eternal', () => {
    const s = sig({
      id: 'a',
      source: 'something_new',
      observedAt: new Date(NOW.getTime() - DEFAULT_HALF_LIFE_DAYS * DAY),
    });
    expect(freshness(s, NOW)).toBeCloseTo(0.5, 5);
  });

  it('honours a hard expiry over the curve', () => {
    const seasonal = sig({
      id: 's',
      source: 'seasonal',
      observedAt: NOW,
      expiresAt: new Date(NOW.getTime() - DAY),
    });
    // Observed today, so the curve says full value — but the window has closed.
    expect(freshness(seasonal, NOW)).toBe(0);
    expect(isSignalStale(seasonal, NOW)).toBe(true);
  });

  it('is never negative, however old', () => {
    const ancient = sig({ id: 'a', observedAt: new Date(NOW.getTime() - 3650 * DAY) });
    expect(freshness(ancient, NOW)).toBeGreaterThanOrEqual(0);
  });
});

describe('effectiveValue', () => {
  it('treats an unscored signal as middling, not worthless', () => {
    const unscored = sig({ id: 'u', relevance: null, observedAt: NOW });
    expect(effectiveValue(unscored, NOW)).toBeGreaterThan(0);
  });

  it('treats unrecorded confidence as no adjustment, not as low', () => {
    const a = sig({ id: 'a', observedAt: NOW, confidence: null });
    const b = sig({ id: 'b', observedAt: NOW, confidence: 1 });
    expect(effectiveValue(a, NOW)).toBe(effectiveValue(b, NOW));
  });

  it('treats unmeasured velocity as no tilt, not as no growth', () => {
    const a = sig({ id: 'a', observedAt: NOW, velocity: null });
    const b = sig({ id: 'b', observedAt: NOW, velocity: 0 });
    expect(effectiveValue(a, NOW)).toBe(effectiveValue(b, NOW));
  });

  it('prefers an accelerating trend to a stalled one of the same size', () => {
    const rising = sig({ id: 'r', observedAt: NOW, velocity: 0.3 });
    const flat = sig({ id: 'f', observedAt: NOW, velocity: 0 });
    expect(effectiveValue(rising, NOW)).toBeGreaterThan(effectiveValue(flat, NOW));
  });

  it('caps velocity so a runaway measurement cannot dominate', () => {
    const absurd = sig({ id: 'x', relevance: 0.5, observedAt: NOW, velocity: 50 });
    const relevant = sig({ id: 'y', relevance: 1, observedAt: NOW });
    expect(effectiveValue(relevant, NOW)).toBeGreaterThan(effectiveValue(absurd, NOW));
  });

  it('lowers the worth of a signal nobody trusts', () => {
    const shaky = sig({ id: 's', observedAt: NOW, confidence: 0.2 });
    const solid = sig({ id: 'g', observedAt: NOW, confidence: 1 });
    expect(effectiveValue(shaky, NOW)).toBeLessThan(effectiveValue(solid, NOW));
  });
});

describe('rankSignals', () => {
  it('returns fewer than asked rather than padding with stale ones', () => {
    const signals = [
      sig({ id: 'fresh', observedAt: NOW }),
      sig({ id: 'old-1', observedAt: new Date(NOW.getTime() - 200 * DAY) }),
      sig({ id: 'old-2', observedAt: new Date(NOW.getTime() - 300 * DAY) }),
    ];
    const ranked = rankSignals(signals, NOW, 20);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.id).toBe('fresh');
  });

  it('respects the limit when there is plenty', () => {
    const many = Array.from({ length: 30 }, (_, i) => sig({ id: `s-${i}`, observedAt: NOW }));
    expect(rankSignals(many, NOW, 20).length).toBe(20);
  });

  it('carries the computed value so a caller can show its reasoning', () => {
    const ranked = rankSignals([sig({ id: 'a', observedAt: NOW })], NOW);
    expect(ranked[0]!.effectiveValue).toBeGreaterThan(0);
  });
});

describe('expiryFor', () => {
  it('returns an explicit window untouched', () => {
    const hard = new Date(NOW.getTime() + 5 * DAY);
    expect(expiryFor('seasonal', NOW, hard)).toBe(hard);
  });

  it('lands where the curve crosses the stale threshold', () => {
    const expiry = expiryFor('trend', NOW);
    const justBefore = new Date(expiry.getTime() - DAY);
    expect(isSignalStale(sig({ id: 'a', source: 'trend', observedAt: NOW }), justBefore)).toBe(false);
    expect(isSignalStale(sig({ id: 'a', source: 'trend', observedAt: NOW }), new Date(expiry.getTime() + DAY))).toBe(true);
  });
});
