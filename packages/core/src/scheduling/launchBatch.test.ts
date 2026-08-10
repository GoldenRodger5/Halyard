/**
 * The launch batch. Milestone 51.
 *
 * The planner is deterministic and pure, so these are ordinary unit tests over
 * a real brief. What they mostly check is that the rules it claims to respect
 * are actually respected — a fortnight of content that quietly breaks its own
 * cadence ceiling would look exactly like one that does not.
 */
import { describe, expect, it } from 'vitest';
import {
  allocateCategories,
  interleave,
  planLaunchBatch,
  type LaunchAccount,
  type LaunchBatchBrief,
} from './launchBatch.js';
import { DEFAULT_CADENCE } from './cadence.js';
import type { SlotWindow } from './timezone.js';

const WINDOWS: SlotWindow[] = [
  { name: 'morning', windowStart: '08:00', windowEnd: '10:00' },
  { name: 'evening', windowStart: '18:00', windowEnd: '20:00' },
];

const account = (over: Partial<LaunchAccount> = {}): LaunchAccount => ({
  id: 'acct-x',
  platform: 'x',
  persona: 'brand',
  supportedFormats: ['text', 'image'],
  ...over,
});

const brief = (over: Partial<LaunchBatchBrief> = {}): LaunchBatchBrief => ({
  startDate: '2026-09-01',
  days: 14,
  audienceTimeZone: 'America/New_York',
  accounts: [account()],
  slots: { x: WINDOWS },
  mixTargets: { education: 0.5, transformation: 0.3, product: 0.2 },
  ...over,
});

describe('allocateCategories', () => {
  it('divides by largest remainder so the total is exact', () => {
    const allocation = allocateCategories({ a: 0.4, b: 0.3, c: 0.2, d: 0.1 }, 20);
    expect(Object.values(allocation).reduce((a, b) => a + b, 0)).toBe(20);
    expect(allocation).toEqual({ a: 8, b: 6, c: 4, d: 2 });
  });

  it('handles shares that do not sum to one, since operators type percentages', () => {
    const allocation = allocateCategories({ a: 40, b: 60 }, 10);
    expect(allocation).toEqual({ a: 4, b: 6 });
  });

  it('never loses a slot to rounding', () => {
    const allocation = allocateCategories({ a: 1 / 3, b: 1 / 3, c: 1 / 3 }, 10);
    expect(Object.values(allocation).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('files everything under education when no mix is set, rather than inventing one', () => {
    expect(allocateCategories({}, 5)).toEqual({ education: 5 });
  });

  it('allocates nothing when there is nothing to allocate', () => {
    expect(allocateCategories({ a: 1 }, 0)).toEqual({});
  });
});

describe('interleave', () => {
  it('spreads equal values apart instead of running them in blocks', () => {
    expect(interleave(['a', 'a', 'a', 'b', 'b', 'c'])).toEqual(['a', 'b', 'c', 'a', 'b', 'a']);
  });

  it('keeps every element', () => {
    const input = ['a', 'a', 'b', 'b', 'b', 'c', 'd'];
    expect(interleave(input).sort()).toEqual([...input].sort());
  });

  it('survives an empty list', () => {
    expect(interleave([])).toEqual([]);
  });
});

describe('planLaunchBatch', () => {
  it('opens every account with an introduction on day one', () => {
    const plan = planLaunchBatch(
      brief({
        accounts: [
          account(),
          account({ id: 'acct-ig', platform: 'instagram', supportedFormats: ['carousel', 'image'] }),
        ],
        slots: { x: WINDOWS, instagram: WINDOWS },
      }),
    );

    const intros = plan.slots.filter((slot) => slot.purpose === 'introduction');
    expect(intros).toHaveLength(2);
    for (const intro of intros) {
      expect(intro.deferred).toBe(false);
      expect(intro.scheduledAt!.toISOString().slice(0, 10)).toBe('2026-09-01');
    }
  });

  it('is deterministic — the same brief plans the same fortnight', () => {
    const a = planLaunchBatch(brief());
    const b = planLaunchBatch(brief());
    expect(a.slots.map((s) => [s.key, s.scheduledAt?.toISOString()])).toEqual(
      b.slots.map((s) => [s.key, s.scheduledAt?.toISOString()]),
    );
  });

  it('never posts on the exact hour, because that is an automation fingerprint', () => {
    const plan = planLaunchBatch(brief());
    const onTheHour = plan.slots.filter(
      (slot) => slot.scheduledAt && slot.scheduledAt.getUTCMinutes() === 0,
    );
    expect(onTheHour.length).toBe(0);
  });

  it('keeps every post inside a configured slot window', () => {
    const plan = planLaunchBatch(brief());
    for (const slot of plan.slots.filter((s) => !s.deferred)) {
      expect(['morning', 'evening']).toContain(slot.slotName);
    }
  });

  it('respects the per-format weekly ceiling rather than filling every day', () => {
    // Video's ceiling is 5 a week. Fourteen days of TikTok would be 14 without
    // the cadence check, and the whole point of the ceiling is that it binds.
    const plan = planLaunchBatch(
      brief({
        accounts: [account({ id: 'acct-tt', platform: 'tiktok', supportedFormats: ['video'] })],
        slots: { tiktok: WINDOWS },
      }),
    );

    const ceiling = DEFAULT_CADENCE.find((rule) => rule.format === 'video')!.weeklyCeiling;
    const week1 = plan.slots.filter(
      (slot) => !slot.deferred && slot.scheduledAt! < new Date('2026-09-08T00:00:00Z'),
    );
    expect(week1.length).toBeLessThanOrEqual(ceiling);
  });

  it('respects the per-platform daily ceiling', () => {
    const plan = planLaunchBatch(brief());
    const perDay = new Map<string, number>();
    for (const slot of plan.slots.filter((s) => !s.deferred)) {
      const day = slot.scheduledAt!.toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    for (const [day, count] of perDay) {
      expect(count, `${day} has ${count} posts on x`).toBeLessThanOrEqual(2);
    }
  });

  it('keeps four hours between posts on the same platform', () => {
    const plan = planLaunchBatch(brief());
    const times = plan.slots
      .filter((s) => !s.deferred)
      .map((s) => s.scheduledAt!.getTime())
      .sort((a, b) => a - b);

    for (let i = 1; i < times.length; i += 1) {
      const gapHours = (times[i]! - times[i - 1]!) / 3_600_000;
      expect(gapHours).toBeGreaterThanOrEqual(4);
    }
  });

  it('distributes categories by the mix targets and interleaves them', () => {
    const plan = planLaunchBatch(brief());
    const regular = plan.slots.filter((s) => s.purpose === 'regular' && !s.deferred);
    expect(regular.length).toBeGreaterThan(3);

    const categories = new Set(regular.map((s) => s.category));
    expect(categories.size).toBeGreaterThan(1);

    // Not three of the same in a row, which is what blocks look like.
    const inOrder = [...regular].sort(
      (a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime(),
    );
    let run = 1;
    let longest = 1;
    for (let i = 1; i < inOrder.length; i += 1) {
      run = inOrder[i]!.category === inOrder[i - 1]!.category ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(3);
  });

  it('says so when there are no mix targets rather than pretending to balance', () => {
    const plan = planLaunchBatch(brief({ mixTargets: {} }));
    expect(plan.warnings.join(' ')).toContain('No mix targets');
    expect(plan.slots.every((s) => s.category === 'education' || s.purpose === 'introduction')).toBe(
      true,
    );
  });

  it('drops an account whose platform has no slot windows, and names it', () => {
    const plan = planLaunchBatch(
      brief({
        accounts: [account(), account({ id: 'acct-p', platform: 'pinterest', supportedFormats: ['pin'] })],
        slots: { x: WINDOWS },
      }),
    );
    expect(plan.warnings.join(' ')).toContain('pinterest has no slot windows');
    expect(plan.slots.some((s) => s.platform === 'pinterest')).toBe(false);
  });

  it('drops an account that supports none of its platform’s formats, and names it', () => {
    const plan = planLaunchBatch(
      brief({
        accounts: [account({ id: 'acct-tt', platform: 'tiktok', supportedFormats: ['text'] })],
        slots: { tiktok: WINDOWS },
      }),
    );
    expect(plan.warnings.join(' ')).toContain('supports none of the formats');
    expect(plan.slots).toHaveLength(0);
  });

  it('returns an explained empty plan rather than throwing when nothing is connected', () => {
    const plan = planLaunchBatch(brief({ accounts: [], slots: {} }));
    expect(plan.slots).toEqual([]);
    expect(plan.warnings.join(' ')).toContain('No accounts are connected');
    expect(plan.rationale.length).toBeGreaterThan(0);
  });

  it('works around what is already on the calendar instead of double-booking it', () => {
    const existing = [
      {
        id: 'already-there',
        platform: 'x',
        persona: 'brand' as const,
        ideaId: null,
        scheduledAt: new Date('2026-09-02T12:30:00Z'),
      },
    ];
    const plan = planLaunchBatch(brief({ existing }));
    for (const slot of plan.slots.filter((s) => !s.deferred)) {
      const gapHours =
        Math.abs(slot.scheduledAt!.getTime() - existing[0]!.scheduledAt.getTime()) / 3_600_000;
      expect(gapHours).toBeGreaterThanOrEqual(4);
    }
  });

  it('reports a deferred slot with its reason instead of squeezing it in', () => {
    // One window, one platform, a tight fortnight: some slots cannot be placed.
    const plan = planLaunchBatch(
      brief({
        slots: { x: [{ name: 'morning', windowStart: '08:00', windowEnd: '08:15' }] },
        accounts: [account(), account({ id: 'acct-x2', platform: 'x', persona: 'founder' })],
      }),
    );
    const deferred = plan.slots.filter((s) => s.deferred);
    for (const slot of deferred) {
      expect(slot.scheduledAt).toBeNull();
      expect(slot.reason.length).toBeGreaterThan(10);
    }
    if (deferred.length > 0) {
      expect(plan.warnings.join(' ')).toContain('could not be placed');
    }
  });

  it('counts what it placed, per platform and per category', () => {
    const plan = planLaunchBatch(
      brief({
        accounts: [
          account(),
          account({ id: 'acct-ig', platform: 'instagram', supportedFormats: ['carousel'] }),
        ],
        slots: { x: WINDOWS, instagram: WINDOWS },
      }),
    );
    const placed = plan.slots.filter((s) => !s.deferred).length;
    expect(Object.values(plan.perPlatform).reduce((a, b) => a + b, 0)).toBe(placed);
    expect(Object.values(plan.perCategory).reduce((a, b) => a + b, 0)).toBe(placed);
  });

  it('alternates accounts that share a platform rather than colliding them daily', () => {
    // Both X accounts every day would be candidates the 4-hour same-platform
    // gap is guaranteed to reject, filling the deferral list with noise.
    const plan = planLaunchBatch(
      brief({
        accounts: [account(), account({ id: 'acct-x2', persona: 'founder' })],
      }),
    );

    expect(plan.rationale.join(' ')).toContain('alternate days');

    const regularByDay = new Map<string, Set<string>>();
    for (const slot of plan.slots) {
      if (slot.purpose !== 'regular' || slot.deferred) continue;
      const day = slot.scheduledAt!.toISOString().slice(0, 10);
      regularByDay.set(day, (regularByDay.get(day) ?? new Set()).add(slot.accountId));
    }
    for (const [day, accounts] of regularByDay) {
      expect(accounts.size, `${day} scheduled both X accounts`).toBe(1);
    }

    // Both still get a fortnight's worth between them.
    const perAccount = plan.slots.filter((s) => !s.deferred).map((s) => s.accountId);
    expect(new Set(perAccount).size).toBe(2);
  });

  it('reports the mix it actually scheduled, not the one it intended', () => {
    const plan = planLaunchBatch(brief());
    const line = plan.rationale.find((r) => r.startsWith('Categories, as actually scheduled'));
    expect(line).toBeTruthy();

    const total = Object.values(plan.perCategory).reduce((a, b) => a + b, 0);
    expect(total).toBe(plan.slots.filter((s) => !s.deferred).length);
  });

  it('plans a shorter batch when asked for one', () => {
    const week = planLaunchBatch(brief({ days: 7 }));
    const fortnight = planLaunchBatch(brief({ days: 14 }));
    expect(week.slots.length).toBeLessThan(fortnight.slots.length);
  });
});
