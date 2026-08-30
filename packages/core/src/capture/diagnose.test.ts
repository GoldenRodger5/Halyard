/**
 * §329. Three real failures from 2026-08-29, each with a different cause and
 * an identical error message. The diagnosis has to tell them apart.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseAuth, diagnoseCapture } from './diagnose.js';

/* The step timings as they were actually recorded. */
const emptyForm = [
  { step: 'open the account page', action: 'goto', ok: true, ms: 2152 },
  { step: 'open the sign-in form', action: 'click', ok: true, ms: 100 },
  { step: 'enter the email', action: 'fillSecret', ok: true, ms: 0 },
  { step: 'enter the password', action: 'fillSecret', ok: true, ms: 0 },
  { step: 'submit the sign-in', action: 'click', ok: true, ms: 80 },
  {
    step: 'wait for the signed-in state',
    action: 'waitForHidden',
    ok: false,
    ms: 30_120,
    error: 'locator.waitFor: Timeout 30000ms exceeded.',
  },
];

const refusedRequest = [
  { step: 'open the converter', action: 'goto', ok: true, ms: 4209 },
  { step: 'switch to the Link tab', action: 'click', ok: true, ms: 89 },
  { step: 'paste the recipe URL', action: 'fill', ok: true, ms: 17 },
  { step: 'choose gluten-free', action: 'click', ok: true, ms: 104 },
  { step: 'add a second constraint', action: 'click', ok: true, ms: 81, optional: true },
  { step: 'submit', action: 'click', ok: true, ms: 5091 },
  {
    step: 'wait for the adaptation',
    action: 'waitFor',
    ok: false,
    ms: 90_168,
    error: 'none of 1 selector(s) resolved: button:has-text("SWAPPED")',
  },
];

const movedControl = [
  { step: 'open the recipe', action: 'goto', ok: true, ms: 2100 },
  {
    step: 'start the walkthrough',
    action: 'click',
    ok: false,
    ms: 15_040,
    error: 'none of 1 selector(s) resolved: role=button[name=/Start Cooking/]',
  },
];

describe('diagnoseCapture', () => {
  it('names the empty form rather than the wait it surfaced at', () => {
    /*
     * `fillSecret` had no implementation for a week. Playwright's fill takes
     * single-digit milliseconds on a real field and exactly zero when the
     * switch had no case — zero is not fast, it is a step that never ran.
     */
    const d = diagnoseCapture({ steps: emptyForm, totalSeconds: 32 })!;
    expect(d.kind).toBe('input_never_entered');
    expect(d.recovery).toBe('fix_code');
    expect(d.finding).toContain('enter the email');
    /* Never retried automatically: no input will fix missing code. */
    expect(d.automatic).toBe(false);
  });

  it('reads a long wait as a request the product refused', () => {
    /*
     * Everything before the wait succeeded, so the interface is intact and the
     * inputs were accepted. RecipeFix returned a correct `_dietTargets: FAIL`
     * for a protein target bread cannot reach, and the flow waited 90s for a
     * success state that was never coming.
     */
    const d = diagnoseCapture({ steps: refusedRequest, totalSeconds: 100 })!;
    expect(d.kind).toBe('awaited_state_never_came');
    expect(d.recovery).toBe('retry_with_different_input');
    expect(d.automatic).toBe(true);
  });

  it('reads a fast failure on a click as a control that moved', () => {
    const d = diagnoseCapture({ steps: movedControl, totalSeconds: 18 })!;
    expect(d.kind).toBe('element_missing');
    expect(d.recovery).toBe('rediscover_selectors');
  });

  it('says nothing when nothing failed', () => {
    expect(
      diagnoseCapture({ steps: emptyForm.map((s) => ({ ...s, ok: true })), totalSeconds: 32 }),
    ).toBeNull();
  });

  it('ignores an optional step that failed', () => {
    /* An optional chip missing must not be reported as the run's cause. */
    const steps = [
      { step: 'open', action: 'goto', ok: true, ms: 2000 },
      { step: 'a nice-to-have', action: 'click', ok: false, ms: 900, optional: true },
    ];
    expect(diagnoseCapture({ steps, totalSeconds: 5 })).toBeNull();
  });

  it('distinguishes all three real failures from each other', () => {
    /* They produced the same message; the whole point is telling them apart. */
    const kinds = [emptyForm, refusedRequest, movedControl].map(
      (steps) => diagnoseCapture({ steps, totalSeconds: 60 })!.kind,
    );
    expect(new Set(kinds).size).toBe(3);
  });
});

describe('diagnoseAuth', () => {
  it('warns that everything after a failed sign-in is the wrong product state', () => {
    const d = diagnoseAuth(emptyForm)!;
    expect(d.kind).toBe('auth_failed');
    expect(d.finding).toContain('signed out');
  });

  it('is silent when the sign-in worked', () => {
    expect(diagnoseAuth(emptyForm.map((s) => ({ ...s, ok: true })))).toBeNull();
  });
});
