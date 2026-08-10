/**
 * Capture flows and staleness. Milestone 41.
 */
import { describe, expect, it } from 'vitest';
import {
  ASSET_STALE_DAYS,
  ELIDE_THRESHOLD_MS,
  FLOWS,
  allFlows,
  assetStaleness,
  elisionCaption,
  looksBlank,
  requiredSelectors,
  shouldElide,
} from './flows.js';

describe('flow definitions', () => {
  it('never depends on a generated class hash', () => {
    // The one rule that makes these last longer than a deploy.
    for (const flow of allFlows()) {
      for (const { selector, step } of requiredSelectors(flow)) {
        expect(selector, `${flow.id} / ${step}`).not.toMatch(/\.[a-z]+-[a-f0-9]{5,}/i);
        expect(selector, `${flow.id} / ${step}`).not.toMatch(/\bcss-[a-z0-9]{5,}/i);
      }
    }
  });

  it('uses only selector forms the runner can resolve', () => {
    for (const flow of allFlows()) {
      for (const { selector, step } of requiredSelectors(flow)) {
        const resolvable =
          /^role=[a-z]+\[name=(".*"|\/.*\/[a-z]*)\]$/s.test(selector) ||
          selector.startsWith('text=') ||
          selector.startsWith('[') ||
          /^[a-z]/i.test(selector);
        expect(resolvable, `${flow.id} / ${step}: ${selector}`).toBe(true);
      }
    }
  });

  it('names every step in language a failure message can use', () => {
    for (const flow of allFlows()) {
      for (const step of flow.steps) {
        expect(step.name.length, `${flow.id}`).toBeGreaterThan(4);
        expect(step.name, `${flow.id}`).not.toMatch(/^step\s*\d/i);
      }
    }
  });

  it('marks exactly one step of the long flow as the stretch the edit cuts', () => {
    const elided = FLOWS.adapt_and_reveal.steps.filter((s) => s.elide);
    expect(elided).toHaveLength(1);
    expect(elided[0]!.name).toMatch(/adaptation/);
  });

  it('does not wait longer for an adaptation than the connector itself would', () => {
    // Both are 90s. A capture that waits past the point the product would have
    // given up is waiting on something broken.
    const wait = FLOWS.adapt_and_reveal.steps.find((s) => s.elide);
    expect(wait!.timeoutMs).toBe(90_000);
  });

  it('waits for the demo card to clear before waiting for a real result', () => {
    // /adapt renders an animated demo that already contains a SWAPPED row. Without
    // this step the flow matches the demo and reports a ten-second adaptation.
    const steps = FLOWS.adapt_and_reveal.steps.map((s) => s.name);
    const clear = steps.findIndex((n) => /demo card to clear/.test(n));
    const wait = steps.findIndex((n) => /wait for the adaptation/.test(n));
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(wait);
  });

  it('routes dependent flows through the flow that produces a result card', () => {
    for (const flow of allFlows()) {
      if (!flow.dependsOn) continue;
      expect(FLOWS[flow.dependsOn], flow.id).toBeDefined();
      expect(FLOWS[flow.dependsOn].dependsOn, 'chains are one level deep').toBeUndefined();
      // A dependent must not spend a second credit; that is the point of chaining.
      expect(flow.consumesCredit, flow.id).toBe(false);
    }
  });

  it('excludes optional steps from what verification requires', () => {
    const optional = FLOWS.adapt_and_reveal.steps.find((s) => s.optional);
    expect(optional).toBeDefined();
    expect(requiredSelectors(FLOWS.adapt_and_reveal).map((s) => s.step)).not.toContain(
      optional!.name,
    );
  });
});

describe('assetStaleness', () => {
  const captured = new Date('2026-01-01T00:00:00Z');

  it('leaves a fresh capture alone', () => {
    const verdict = assetStaleness(captured, 'build-a', 'build-a', new Date('2026-01-20T00:00:00Z'));
    expect(verdict).toMatchObject({ stale: false, reason: null });
  });

  it('goes stale on age', () => {
    const verdict = assetStaleness(captured, null, null, new Date('2026-03-15T00:00:00Z'));
    expect(verdict.stale).toBe(true);
    expect(verdict.ageDays).toBeGreaterThanOrEqual(ASSET_STALE_DAYS);
    expect(verdict.reason).toMatch(/days old/);
  });

  it('goes stale immediately when the app has shipped since, and says which', () => {
    const verdict = assetStaleness(captured, 'build-a', 'build-b', new Date('2026-01-02T00:00:00Z'));
    expect(verdict.stale).toBe(true);
    expect(verdict.reason).toMatch(/Captured on build-a; the app is now on build-b/);
  });

  it('does not claim a version change when it has no version to compare', () => {
    const verdict = assetStaleness(captured, 'build-a', null, new Date('2026-01-02T00:00:00Z'));
    expect(verdict.stale).toBe(false);
  });
});

/**
 * Cutting the wait. Milestone 41, recalibrated after the 26-second measurement.
 */
describe('elision', () => {
  it('leaves a cached adaptation alone, because there is nothing to cut', () => {
    // A repeat of the same URL and diet came back in 2.3 seconds. Cutting that
    // and captioning it "2 seconds later" is worse than showing it.
    expect(shouldElide(2_300)).toBe(false);
    expect(shouldElide(ELIDE_THRESHOLD_MS - 1)).toBe(false);
  });

  it('cuts a cold adaptation, which is the case the edit exists for', () => {
    expect(shouldElide(26_000)).toBe(true);
  });

  it('captions with the measured time rather than a designed one', () => {
    expect(elisionCaption(26_000)).toBe('26 seconds later');
    expect(elisionCaption(9_600)).toBe('10 seconds later');
  });

  it('switches to minutes only when seconds would read badly', () => {
    expect(elisionCaption(96_000)).toBe('1.6 minutes later');
  });
});

/**
 * Blank-frame detection. A verification pass proves the selectors resolved; it
 * does not prove the page painted.
 */
describe('looksBlank', () => {
  it('accepts a real screenshot of a dense page', () => {
    // The captured result card: 1280×900 at deviceScaleFactor 2, 1.27 MB.
    expect(looksBlank(1_266_000, 2560, 1800).blank).toBe(false);
  });

  it('rejects a uniform fill, whatever its dimensions', () => {
    // A flat PNG compresses to single-digit kilobytes at any size.
    const verdict = looksBlank(7_500, 2560, 1800);
    expect(verdict.blank).toBe(true);
    expect(verdict.reason).toMatch(/blank or near-blank/);
    expect(verdict.reason).toMatch(/not been filed/);
  });

  it('scales with the canvas rather than using a fixed byte floor', () => {
    // A small phone screenshot at the same density must still pass.
    expect(looksBlank(70_000, 430, 932).blank).toBe(false);
  });

  it('does not divide by zero on a degenerate size', () => {
    expect(() => looksBlank(0, 0, 0)).not.toThrow();
  });
});
