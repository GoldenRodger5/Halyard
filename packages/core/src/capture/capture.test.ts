/**
 * Capture flows and staleness. Milestone 41.
 */
import { describe, expect, it } from 'vitest';
import { FLOWS, allFlows, assetStaleness, requiredSelectors, ASSET_STALE_DAYS } from './flows.js';

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

  it('marks exactly one step of the long flow as the speed ramp', () => {
    const ramps = FLOWS.adapt_and_reveal.steps.filter((s) => s.ramp);
    expect(ramps).toHaveLength(1);
    expect(ramps[0]!.name).toMatch(/adaptation/);
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
