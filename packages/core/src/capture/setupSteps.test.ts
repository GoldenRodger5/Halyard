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
      /*
       * §299. A plumbing flow is entirely setup by design — signing in is not
       * a demonstration. It declares that, so the rule stays strict for every
       * flow that is meant to be seen.
       */
      if (flow.plumbing) {
        expect(flow.steps.every((s) => s.setup), flow.id).toBe(true);
        continue;
      }
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

/**
 * §299. Signing in, and the two relationships between flows.
 */
describe('the sign-in flow', () => {
  it('is required by the flow that needs a real adaptation', () => {
    /*
     * The walkthrough render showed the demo card with a sign-in sheet over it:
     * the adapt flow waits correctly for a real adaptation and the real
     * adaptation needs an account, so every demonstration recorded the
     * signed-out state.
     */
    expect(FLOWS.adapt_and_reveal.requires).toBe('sign_in');
  });

  it('keeps `requires` and `dependsOn` as different relationships', () => {
    /*
     * `dependsOn` means "reuses the parent's result, so spends no credit".
     * `sign_in` produces no result to reuse, and an adaptation genuinely does
     * spend a credit whether or not somebody signed in first. Conflating them
     * broke that rule; two words keep both intact.
     */
    expect(FLOWS.adapt_and_reveal.dependsOn).toBeUndefined();
    expect(FLOWS.adapt_and_reveal.consumesCredit).toBe(true);
    expect(FLOWS.sign_in.consumesCredit).toBe(false);
  });

  it('never writes a credential into the flow definition', () => {
    /*
     * The whole reason `fillSecret` exists. A step names *which* secret it
     * wants; the runner is the only thing that sees the value, so a credential
     * cannot reach a log line, a job payload, or this file.
     */
    const serialised = JSON.stringify(FLOWS.sign_in);
    expect(serialised).not.toMatch(/password["']?\s*:\s*["'][^"']{3,}/i);
    for (const step of FLOWS.sign_in.steps) {
      if (step.action === 'fillSecret') {
        expect(['email', 'password'], step.name).toContain(step.value);
      }
    }
  });

  it('declares that it cannot run without credentials', () => {
    /* Skipped rather than failed: an app with no login is a normal case. */
    expect(FLOWS.sign_in.requiresCredentials).toBe(true);
  });
});

describe('§309. the recorded pass is a cold adaptation', () => {
  it('gives the URL-filling step a different value for capture than for verify', () => {
    /*
     * A capture runs verify then record, and RecipeFix caches an adaptation.
     * With one URL the recorded pass was always a cache hit, in a shape the
     * selectors did not match — verify passed and the recording failed on the
     * same steps, seconds apart, every time.
     */
    const step = FLOWS.adapt_and_reveal.steps.find((s) => s.name === 'paste the recipe URL');
    expect(step?.value).toBeTruthy();
    expect(step?.captureValue).toBeTruthy();
    expect(step?.captureValue).not.toBe(step?.value);
  });

  it('never gives a secret step a captureValue, which would be a literal', () => {
    /* `captureValue` is a plain string. A credential must never be one. */
    for (const flow of Object.values(FLOWS)) {
      for (const step of flow.steps) {
        if (step.action === 'fillSecret') expect(step.captureValue).toBeUndefined();
      }
    }
  });
});
