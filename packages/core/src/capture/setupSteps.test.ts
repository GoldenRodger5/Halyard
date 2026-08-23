/**
 * §166. "Not shown" must never become "not run".
 *
 * `setup` withholds screen time. It is not a way to skip work, and the
 * distinction matters because the artifact depends on the setup: without the
 * page load, the banner dismissal and the placeholder clearing, there is no
 * adaptation to film. A flag that quietly stopped those from executing would
 * produce a flow that verifies green and captures nothing.
 */
import { describe, expect, it } from 'vitest';
import { FLOWS } from './flows.js';

const adapt = FLOWS.adapt_and_reveal;

describe('setup steps', () => {
  it('are still part of the flow the browser executes', () => {
    /*
     * The load-bearing assertion. Nothing in the runner filters on `setup`, so
     * a step carrying it is executed exactly like any other — this pins that
     * the flow definition still contains them.
     */
    const names = adapt.steps.map((s) => s.name);
    expect(names).toContain('open the converter');
    expect(names).toContain('dismiss the App Store banner');
    expect(names).toContain('wait for the demo card to clear');
  });

  it('marks navigation and chrome, not the product interaction', () => {
    const setup = adapt.steps.filter((s) => s.setup).map((s) => s.name);
    expect(setup).toContain('open the converter');
    expect(setup).toContain('dismiss the App Store banner');
    expect(setup).toContain('wait for the demo card to clear');

    // The story itself must survive: the input, the constraint, the trigger,
    // the result and the reason are what the piece exists to show.
    for (const kept of [
      'switch to the Link tab',
      'paste the recipe URL',
      'choose gluten-free',
      'submit',
      'let the result settle',
      'expand a swapped ingredient',
    ]) {
      expect(setup, `${kept} must not be setup`).not.toContain(kept);
    }
  });

  it('does not mark the elided wait as setup', () => {
    /*
     * The two mechanisms answer different questions and a step must not claim
     * both. `elide` says "real work happened, here is how long"; `setup` says
     * "there is nothing to say". Marking the adaptation wait as setup would
     * throw away the one honest claim the piece makes about product latency.
     */
    const both = adapt.steps.filter((s) => s.elide && s.setup);
    expect(both).toEqual([]);

    const elided = adapt.steps.find((s) => s.elide);
    expect(elided?.name).toBe('wait for the adaptation');
  });

  it('leaves a step carrying narration visible, because narration is the author saying it matters', () => {
    for (const step of adapt.steps) {
      if (step.narration) expect(step.setup, `${step.name}`).toBeFalsy();
    }
  });

  it('keeps setup opt-in across every flow', () => {
    // No flow should be mostly invisible; that would mean the flow is wrong,
    // not that the footage engine is clever.
    for (const flow of Object.values(FLOWS)) {
      const setup = flow.steps.filter((s) => s.setup).length;
      expect(setup, flow.id).toBeLessThan(flow.steps.length / 2);
    }
  });
});

/**
 * §171. A flow that can run on its own must navigate on its own.
 *
 * `swap_toggle` had no `goto` because it was written to inherit the page
 * `adapt_and_reveal` left behind. `runFlowChain` opens a fresh blank page, so
 * once it ran as a root flow it looked for its selector on `about:blank` — and
 * the failure screenshot was a blank white frame, which sent the diagnosis
 * chasing selector drift for weeks. `flow.path` looks like it navigates and
 * does not; it is metadata for `sourceUrl`.
 */
describe('every independent flow navigates itself', () => {
  it('starts with a goto unless it depends on another flow', () => {
    for (const flow of Object.values(FLOWS)) {
      if (flow.dependsOn) continue;
      const first = flow.steps[0];
      expect(first?.action, `${flow.id} never navigates, so it would run on about:blank`).toBe(
        'goto',
      );
    }
  });

  it('navigates somewhere real', () => {
    for (const flow of Object.values(FLOWS)) {
      if (flow.dependsOn) continue;
      expect(flow.steps[0]?.value, `${flow.id}`).toMatch(/^\//);
    }
  });

  it('treats that navigation as setup, never as story', () => {
    // A page load is not something a viewer wants to watch (§166).
    for (const flow of Object.values(FLOWS)) {
      if (flow.dependsOn) continue;
      expect(flow.steps[0]?.setup, `${flow.id}`).toBe(true);
    }
  });

  it('keeps swap_toggle independent of the flow that used to carry it', () => {
    /*
     * The coupling that let one drifting flow take down the other. The homepage
     * card is always present, so this flow needs no prior adaptation and spends
     * no credit.
     */
    expect(FLOWS.swap_toggle.dependsOn).toBeUndefined();
    expect(FLOWS.swap_toggle.consumesCredit).toBe(false);
  });
});
