/**
 * §365. The ladder's order is the judgement, so the order is what is tested.
 *
 * Each of these asserts a *precedence*, not a rendering: given two things wrong
 * at once, which one Halyard says to do. That is the part a future edit can
 * silently get wrong, and the part that would send an operator to approve
 * fifteen pieces into a system that will not publish any of them.
 */
import { describe, expect, it } from 'vitest';
import { whatNeedsMe, type OperatingState } from './whatNeedsMe.js';

const healthy: OperatingState = {
  hasProduct: true,
  setupIncomplete: [],
  publishingEnabled: true,
  connectedAccounts: 3,
  brokenAccounts: 0,
  failed: 0,
  pendingApproval: 0,
  oldestPendingDays: null,
  inboxWaiting: 0,
  scheduledNext7: 4,
  hasEverPublished: true,
};

describe('what to do next', () => {
  it('always answers', () => {
    expect(whatNeedsMe(healthy).rung).toBe('clear');
    expect(whatNeedsMe({ ...healthy, hasProduct: false }).rung).toBe('no_product');
  });

  it('says nothing needs you rather than inventing urgency', () => {
    const action = whatNeedsMe(healthy);
    expect(action.tone).toBe('calm');
    expect(action.title).toBe('Nothing needs you');
  });

  it('puts the paused kill switch above a full approval queue', () => {
    /*
     * The precedence that matters most. Approving into a paused system
     * produces scheduled posts that will not go out, which looks exactly like
     * progress and is not.
     */
    const action = whatNeedsMe({
      ...healthy,
      publishingEnabled: false,
      pendingApproval: 15,
    });
    expect(action.rung).toBe('paused');
  });

  it('puts an unconnected account above work piling up', () => {
    const action = whatNeedsMe({
      ...healthy,
      connectedAccounts: 0,
      pendingApproval: 9,
      failed: 3,
    });
    expect(action.rung).toBe('no_accounts');
  });

  it('puts the first run above everything except having a product', () => {
    expect(
      whatNeedsMe({ ...healthy, setupIncomplete: ['calibration'], publishingEnabled: false }).rung,
    ).toBe('setup');
    expect(
      whatNeedsMe({ ...healthy, setupIncomplete: ['calibration'], hasProduct: false }).rung,
    ).toBe('no_product');
  });

  it('puts failures above approvals, because a run of them is usually one fix', () => {
    expect(whatNeedsMe({ ...healthy, failed: 4, pendingApproval: 20 }).rung).toBe('failed');
  });

  it('names the age of the oldest waiting piece, once it is worth naming', () => {
    const fresh = whatNeedsMe({ ...healthy, pendingApproval: 2, oldestPendingDays: 0 });
    expect(fresh.because).not.toContain('waiting');
    const stale = whatNeedsMe({ ...healthy, pendingApproval: 2, oldestPendingDays: 4 });
    expect(stale.because).toContain('4 days');
  });

  it('reads an empty schedule differently before and after the first post', () => {
    const cold = whatNeedsMe({ ...healthy, scheduledNext7: 0, hasEverPublished: false });
    expect(cold.because).toContain('Nothing has published yet');
    const lull = whatNeedsMe({ ...healthy, scheduledNext7: 0, hasEverPublished: true });
    expect(lull.because).toContain('a decision rather than an accident');
  });

  it('counts in the singular when there is one of something', () => {
    expect(whatNeedsMe({ ...healthy, pendingApproval: 1 }).title).toBe('Review 1 piece');
    expect(whatNeedsMe({ ...healthy, pendingApproval: 2 }).title).toBe('Review 2 pieces');
    expect(whatNeedsMe({ ...healthy, inboxWaiting: 1 }).title).toBe('1 reply is waiting');
    expect(whatNeedsMe({ ...healthy, inboxWaiting: 3 }).title).toBe('3 replies are waiting');
  });

  it('sends every rung somewhere a person can act', () => {
    /*
     * A card that states a problem and links nowhere is the dead end §172 named
     * as the second principle: the row that reports a problem is the row that
     * fixes it.
     */
    const states: OperatingState[] = [
      { ...healthy, hasProduct: false },
      { ...healthy, setupIncomplete: ['voice'] },
      { ...healthy, publishingEnabled: false },
      { ...healthy, connectedAccounts: 0 },
      { ...healthy, brokenAccounts: 1 },
      { ...healthy, failed: 1 },
      { ...healthy, pendingApproval: 1 },
      { ...healthy, inboxWaiting: 1 },
      { ...healthy, scheduledNext7: 0 },
      healthy,
    ];
    for (const state of states) {
      const action = whatNeedsMe(state);
      expect(action.href.startsWith('/')).toBe(true);
      expect(action.cta.length).toBeGreaterThan(0);
      expect(action.because.length).toBeGreaterThan(20);
    }
    /* Every rung is reachable — no unreachable branch hiding in the ladder. */
    expect(new Set(states.map((s) => whatNeedsMe(s).rung)).size).toBe(states.length);
  });
});
