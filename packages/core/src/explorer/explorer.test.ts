/**
 * The Explorer's two deterministic halves: what a discovered flow may do, and
 * what counts as having verified something.
 *
 * Both are pure. That is the design — a model proposes, and these decide — so
 * the safety of pointing a signed-in browser at a live product does not rest on
 * a prompt being followed.
 */
import { describe, expect, it } from 'vitest';
import {
  checkFlowSafety,
  isInScope,
  MAX_STEPS,
  type ExplorerStep,
} from './safety.js';
import { canMarket, isStale, verdictFor, VERIFICATION_TTL_DAYS } from './verify.js';

const ORIGINS = ['https://recipefix.app'];
const safe = (over: Partial<ExplorerStep> = {}): ExplorerStep => ({
  name: 'open the adapter',
  action: 'click',
  target: 'Adapt this recipe',
  ...over,
});

describe('checkFlowSafety', () => {
  it('allows an ordinary read-only flow', () => {
    const verdict = checkFlowSafety(
      [
        { name: 'open', action: 'goto', value: 'https://recipefix.app/adapt' },
        safe(),
        { name: 'confirm the result', action: 'expectText', target: 'Swapped' },
      ],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(true);
  });

  it.each([
    ['Delete recipe', 'step.destructive'],
    ['Remove from saved', 'step.destructive'],
    ['Sign out', 'step.destructive'],
    ['Cancel subscription', 'step.destructive'],
    ['Upgrade to Pro', 'step.transactional'],
    ['Checkout', 'step.transactional'],
    ['Change password', 'step.identity'],
  ])('refuses clicking %s', (target, rule) => {
    const verdict = checkFlowSafety([safe({ target })], { allowedOrigins: ORIGINS });
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusals[0]!.rule).toBe(rule);
  });

  it('reads the selector too, not just the visible label', () => {
    // A model that proposes `button.delete-account` with the friendly name
    // "Continue" is the case a label-only check misses.
    const verdict = checkFlowSafety(
      [safe({ target: 'Continue', selector: 'button.delete-account' })],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(false);
  });

  it('does not refuse an expectation that merely mentions a dangerous word', () => {
    /**
     * "The delete button is not shown to free users" is a legitimate thing to
     * assert. Only interactions can destroy something; an expectation cannot.
     */
    const verdict = checkFlowSafety(
      [{ name: 'no delete for free plans', action: 'expectVisible', target: 'Delete' }],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(true);
  });

  it('refuses the whole flow, not just the offending step', () => {
    /**
     * Dropping step 2 of 4 and running the rest produces a sequence nobody
     * designed, against live state. A flow is a sequence or it is nothing.
     */
    const verdict = checkFlowSafety(
      [safe(), safe({ name: 'tidy up', target: 'Delete all' }), safe(), safe()],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusals).toHaveLength(1);
    expect(verdict.refusals[0]!.stepIndex).toBe(1);
  });

  it('reports every refusal rather than only the first', () => {
    const verdict = checkFlowSafety(
      [safe({ target: 'Delete' }), safe({ target: 'Buy now' })],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.refusals).toHaveLength(2);
  });

  it('never lets a discovered flow type a password', () => {
    // Signing in is the authenticator's job, done before the flow runs.
    const verdict = checkFlowSafety(
      [{ name: 'sign in', action: 'fill', selector: 'input[type=password]', value: 'hunter2' }],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusals[0]!.rule).toBe('step.forbidden_input');
  });

  it('refuses an action outside the vocabulary rather than ignoring it', () => {
    const verdict = checkFlowSafety(
      [{ name: 'run script', action: 'evaluate' as never, target: 'x' }],
      { allowedOrigins: ORIGINS },
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusals[0]!.rule).toBe('action.not_allowed');
  });

  it('refuses an empty flow instead of passing it vacuously', () => {
    // It would report success having done nothing, which is indistinguishable
    // from a verified feature.
    expect(checkFlowSafety([], { allowedOrigins: ORIGINS }).allowed).toBe(false);
  });

  it('refuses a flow that has stopped being a demonstration', () => {
    const many = Array.from({ length: MAX_STEPS + 1 }, () => safe());
    const verdict = checkFlowSafety(many, { allowedOrigins: ORIGINS });
    expect(verdict.refusals.some((r) => r.rule === 'flow.too_long')).toBe(true);
  });
});

describe('isInScope', () => {
  it('allows the product and its subdomains', () => {
    expect(isInScope('https://recipefix.app/adapt', ORIGINS)).toBe(true);
    expect(isInScope('https://app.recipefix.app/x', ORIGINS)).toBe(true);
  });

  it('refuses a lookalike host that merely ends with the same string', () => {
    /**
     * `'evil-recipefix.app'.endsWith('recipefix.app')` is true, which is how a
     * suffix check hands an authenticated browser to someone else.
     */
    expect(isInScope('https://evil-recipefix.app/', ORIGINS)).toBe(false);
    expect(isInScope('https://recipefix.app.attacker.test/', ORIGINS)).toBe(false);
  });

  it('refuses non-http schemes', () => {
    expect(isInScope('file:///etc/passwd', ORIGINS)).toBe(false);
    expect(isInScope('javascript:alert(1)', ORIGINS)).toBe(false);
  });

  it('refuses anything unparseable rather than assuming it is relative', () => {
    expect(isInScope('not a url', ORIGINS)).toBe(false);
  });
});

describe('verdictFor', () => {
  const check = (over: Record<string, unknown> = {}) => ({
    stepName: 'the swapped badge appears',
    kind: 'expectText' as const,
    wanted: 'Swapped',
    observed: true,
    ...over,
  });

  it('verifies a flow that completed with its checks met', () => {
    const verdict = verdictFor({ completed: true, expectations: [check()] });
    expect(verdict.status).toBe('verified');
  });

  it('will not verify a flow that asserted nothing', () => {
    /**
     * The single most likely way this system starts lying: every step
     * succeeded, no expectation existed, and "no failures" reads exactly like
     * "confirmed". Nine navigation steps complete cleanly on a page that has
     * lost the feature entirely.
     */
    const verdict = verdictFor({ completed: true, expectations: [] });
    expect(verdict.status).toBe('unverifiable');
    expect(verdict.summary).toMatch(/checked nothing/);
  });

  it('will not verify on optional checks alone', () => {
    const verdict = verdictFor({
      completed: true,
      expectations: [check({ optional: true })],
    });
    expect(verdict.status).toBe('unverifiable');
  });

  it('refutes when the flow ran to the end and a check failed', () => {
    // A real answer, and the useful one: features get removed and renamed.
    const verdict = verdictFor({
      completed: true,
      expectations: [check({ observed: false })],
    });
    expect(verdict.status).toBe('refuted');
    expect(verdict.failed).toHaveLength(1);
  });

  it('leaves a broken run unverified rather than refuting it', () => {
    /**
     * A flow that broke part-way is ambiguous: the feature may be gone, or a
     * selector moved, or the network hiccuped. Refuting on that would delete
     * real features from the inventory on a flaky run.
     */
    const verdict = verdictFor({
      completed: false,
      error: 'timeout waiting for .result-card',
      expectations: [check({ observed: null })],
    });
    expect(verdict.status).toBe('unverified');
    expect(verdict.summary).toMatch(/tried again/);
  });
});

describe('what may be said publicly', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('lets a fresh verified claim be marketed', () => {
    expect(canMarket('verified', daysAgo(1))).toBe(true);
  });

  it('refuses an unverified claim however plausible', () => {
    expect(canMarket('unverified', daysAgo(1))).toBe(false);
    expect(canMarket('unverifiable', daysAgo(1))).toBe(false);
    expect(canMarket('refuted', daysAgo(1))).toBe(false);
  });

  it('stops trusting a verification that has aged out', () => {
    // The product ships with no release notes, so an old check is a guess.
    expect(isStale(daysAgo(VERIFICATION_TTL_DAYS + 1), now)).toBe(true);
    expect(canMarket('verified', daysAgo(VERIFICATION_TTL_DAYS + 1))).toBe(false);
  });

  it('treats never-verified as stale rather than as recent', () => {
    expect(isStale(null, now)).toBe(true);
  });
});
