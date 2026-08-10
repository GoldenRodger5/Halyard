import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGGER_RULES,
  densityWarnings,
  deterministicJitterMinutes,
  planSchedule,
  type ExistingPost,
  type ScheduleCandidate,
} from './stagger.js';
import {
  formatInTimeZone,
  localIsoWeekday,
  localWallClockToUtc,
  resolveSlot,
  upcomingSlotOccurrences,
} from './timezone.js';
import { MAX_RESCHEDULES, decideReschedule, publishFailurePolicy } from './reschedule.js';

const NY = 'America/New_York';
const EVENING = { name: 'evening', windowStart: '17:00', windowEnd: '19:30' };

describe('timezone — build pack §1', () => {
  /**
   * The test case the build pack names explicitly: "schedule an evening slot on
   * the day DST changes and confirm it publishes at 18:xx local, not 17:xx or
   * 19:xx."
   */
  it('keeps an 18:00 wall-clock slot at 18:00 local across the spring DST change', () => {
    // 2026-03-08 is the US spring-forward date.
    const before = localWallClockToUtc('2026-03-07', '18:00', NY);
    const after = localWallClockToUtc('2026-03-09', '18:00', NY);

    expect(before.toISOString()).toBe('2026-03-07T23:00:00.000Z'); // EST, UTC-5
    expect(after.toISOString()).toBe('2026-03-09T22:00:00.000Z'); // EDT, UTC-4

    expect(formatInTimeZone(before, NY, 'HH:mm')).toBe('18:00');
    expect(formatInTimeZone(after, NY, 'HH:mm')).toBe('18:00');
  });

  it('keeps an 18:00 wall-clock slot at 18:00 local across the autumn DST change', () => {
    const before = localWallClockToUtc('2026-10-31', '18:00', NY);
    const after = localWallClockToUtc('2026-11-02', '18:00', NY);
    expect(formatInTimeZone(before, NY, 'HH:mm')).toBe('18:00');
    expect(formatInTimeZone(after, NY, 'HH:mm')).toBe('18:00');
    // The UTC instants differ by 49 hours, not 48, because the clocks went back.
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(49);
  });

  it('resolves a slot window to a UTC pair on a given local day', () => {
    const slot = resolveSlot(EVENING, '2026-08-10', NY);
    expect(formatInTimeZone(slot.startUtc, NY, 'HH:mm')).toBe('17:00');
    expect(formatInTimeZone(slot.endUtc, NY, 'HH:mm')).toBe('19:30');
    expect(slot.endUtc.getTime()).toBeGreaterThan(slot.startUtc.getTime());
  });

  it('rolls a window that crosses midnight into the following day', () => {
    const slot = resolveSlot(
      { name: 'late', windowStart: '22:30', windowEnd: '01:00' },
      '2026-08-10',
      NY,
    );
    expect(slot.endUtc.getTime()).toBeGreaterThan(slot.startUtc.getTime());
    expect((slot.endUtc.getTime() - slot.startUtc.getTime()) / 60_000).toBe(150);
  });

  it('respects the weekday mask when listing upcoming occurrences', () => {
    const weekdaysOnly = { ...EVENING, weekdays: [1, 2, 3, 4, 5] };
    const from = new Date('2026-08-07T12:00:00Z'); // a Friday
    const next = upcomingSlotOccurrences(weekdaysOnly, NY, from, 3);
    expect(next).toHaveLength(3);
    for (const occurrence of next) {
      expect([1, 2, 3, 4, 5]).toContain(localIsoWeekday(occurrence.startUtc, NY));
    }
  });

  it('separates audience timezone from operator timezone', () => {
    // A US-audience product posts on US time regardless of where the operator is.
    const instant = localWallClockToUtc('2026-08-10', '18:00', NY);
    expect(formatInTimeZone(instant, NY, 'HH:mm')).toBe('18:00');
    expect(formatInTimeZone(instant, 'Europe/London', 'HH:mm')).toBe('23:00');
  });
});

describe('stagger — v2 E.2', () => {
  const slot = resolveSlot(EVENING, '2026-08-10', NY);

  function candidate(over: Partial<ScheduleCandidate> = {}): ScheduleCandidate {
    return {
      id: 'item-a',
      platform: 'instagram',
      persona: 'brand',
      ideaId: 'idea-1',
      slot,
      ...over,
    };
  }

  it('places a post inside its window and never on the exact hour boundary', () => {
    const [decision] = planSchedule([candidate()], []);
    expect(decision?.scheduledAt).toBeInstanceOf(Date);
    expect(decision!.scheduledAt!.getTime()).toBeGreaterThanOrEqual(slot.startUtc.getTime());
    expect(decision!.scheduledAt!.getTime()).toBeLessThanOrEqual(slot.endUtc.getTime());
    expect(decision!.scheduledAt!.getUTCSeconds()).toBe(0);
  });

  it('jitters deterministically, within bounds, and differently per item', () => {
    for (const id of ['a', 'b', 'item-1234', 'x']) {
      const j = deterministicJitterMinutes(id, 7);
      expect(j).toBeGreaterThanOrEqual(-7);
      expect(j).toBeLessThanOrEqual(7);
      expect(deterministicJitterMinutes(id, 7)).toBe(j); // stable
    }
    const spread = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => deterministicJitterMinutes(s, 7)),
    );
    expect(spread.size).toBeGreaterThan(3);
  });

  it('enforces the 4-hour minimum gap on the same platform', () => {
    const existing: ExistingPost[] = [
      {
        id: 'existing',
        platform: 'instagram',
        persona: 'brand',
        ideaId: 'other',
        scheduledAt: new Date(slot.startUtc.getTime() + 60 * 60_000),
      },
    ];
    const [decision] = planSchedule([candidate()], existing);
    // The 2.5-hour evening window cannot hold a 4-hour gap, so it defers.
    expect(decision?.deferred).toBe(true);
    expect(decision?.reason).toMatch(/minimum is 240/);
  });

  it('keeps founder and brand at least 3 hours apart on the same platform', () => {
    const wide = resolveSlot({ name: 'all_day', windowStart: '06:00', windowEnd: '22:00' }, '2026-08-10', NY);
    const existing: ExistingPost[] = [
      {
        id: 'brand-post',
        platform: 'x',
        persona: 'brand',
        ideaId: 'other',
        scheduledAt: new Date(wide.startUtc.getTime() + 60 * 60_000),
      },
    ];
    const [decision] = planSchedule(
      [candidate({ id: 'founder-post', platform: 'x', persona: 'founder', slot: wide })],
      existing,
    );
    expect(decision?.scheduledAt).toBeTruthy();
    const gapMinutes =
      Math.abs(decision!.scheduledAt!.getTime() - existing[0]!.scheduledAt.getTime()) / 60_000;
    expect(gapMinutes).toBeGreaterThanOrEqual(DEFAULT_STAGGER_RULES.minGapFounderVsBrandMinutes);
  });

  it('keeps the same idea at least 45 minutes apart across platforms', () => {
    const wide = resolveSlot({ name: 'all_day', windowStart: '06:00', windowEnd: '22:00' }, '2026-08-10', NY);
    const first = planSchedule([candidate({ id: 'ig', platform: 'instagram', slot: wide })], []);
    const second = planSchedule(
      [candidate({ id: 'th', platform: 'threads', slot: wide })],
      [
        {
          id: 'ig',
          platform: 'instagram',
          persona: 'brand',
          ideaId: 'idea-1',
          scheduledAt: first[0]!.scheduledAt!,
        },
      ],
    );
    const gap =
      Math.abs(second[0]!.scheduledAt!.getTime() - first[0]!.scheduledAt!.getTime()) / 60_000;
    expect(gap).toBeGreaterThanOrEqual(
      DEFAULT_STAGGER_RULES.minGapCrossPlatformSameIdeaMinutes,
    );
  });

  it('never schedules two items at the same minute', () => {
    const wide = resolveSlot({ name: 'all_day', windowStart: '05:00', windowEnd: '23:00' }, '2026-08-10', NY);
    const decisions = planSchedule(
      [
        candidate({ id: 'a', platform: 'x', ideaId: 'i1', slot: wide }),
        candidate({ id: 'b', platform: 'instagram', ideaId: 'i1', slot: wide }),
        candidate({ id: 'c', platform: 'pinterest', ideaId: 'i1', slot: wide }),
      ],
      [],
    );
    const times = decisions.filter((d) => d.scheduledAt).map((d) => d.scheduledAt!.getTime());
    expect(new Set(times).size).toBe(times.length);
  });

  it('applies the Pinterest daily ceiling of 5 rather than the feed ceiling of 2', () => {
    expect(DEFAULT_STAGGER_RULES.maxPerPlatformPerDay.pinterest).toBe(5);
    expect(DEFAULT_STAGGER_RULES.maxPerPlatformPerDay.instagram).toBe(2);
  });

  it('defers rather than exceeding the daily ceiling', () => {
    const existing: ExistingPost[] = [0, 1].map((i) => ({
      id: `existing-${i}`,
      platform: 'instagram',
      persona: 'brand' as const,
      ideaId: 'other',
      scheduledAt: new Date(slot.startUtc.getTime() - i * 6 * 3_600_000),
    }));
    const [decision] = planSchedule([candidate()], existing);
    expect(decision?.deferred).toBe(true);
    expect(decision?.reason).toMatch(/ceiling of 2/);
  });
});

describe('densityWarnings — v1 §8 calendar', () => {
  it('flags two same-platform posts inside the minimum gap', () => {
    const base = new Date('2026-08-10T22:00:00Z');
    const warnings = densityWarnings([
      { id: 'a', platform: 'instagram', persona: 'brand', scheduledAt: base },
      { id: 'b', platform: 'instagram', persona: 'brand', scheduledAt: new Date(base.getTime() + 45 * 60_000) },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/45 minutes apart/);
  });

  it('says nothing about different platforms', () => {
    const base = new Date('2026-08-10T22:00:00Z');
    expect(
      densityWarnings([
        { id: 'a', platform: 'instagram', persona: 'brand', scheduledAt: base },
        { id: 'b', platform: 'x', persona: 'brand', scheduledAt: base },
      ]),
    ).toHaveLength(0);
  });
});

describe('reschedule policy — build pack §3', () => {
  const nextSlots = [
    resolveSlot(EVENING, '2026-08-11', NY),
    resolveSlot(EVENING, '2026-08-12', NY),
  ];

  it('publishes when approved, rendered, and due', () => {
    const outcome = decideReschedule({
      status: 'approved',
      scheduledAt: new Date('2026-08-10T22:00:00Z'),
      now: new Date('2026-08-10T22:00:30Z'),
      rescheduleCount: 0,
      rendersComplete: true,
      nextSlots,
    });
    expect(outcome.action).toBe('publish_now');
  });

  it('waits up to 20 minutes for an incomplete render', () => {
    const outcome = decideReschedule({
      status: 'approved',
      scheduledAt: new Date('2026-08-10T22:00:00Z'),
      now: new Date('2026-08-10T22:05:00Z'),
      rescheduleCount: 0,
      rendersComplete: false,
      nextSlots,
    });
    expect(outcome.action).toBe('wait');
  });

  it('reschedules once the render grace period is exhausted', () => {
    const outcome = decideReschedule({
      status: 'approved',
      scheduledAt: new Date('2026-08-10T22:00:00Z'),
      now: new Date('2026-08-10T22:25:00Z'),
      rescheduleCount: 0,
      rendersComplete: false,
      nextSlots,
    });
    expect(outcome.action).toBe('reschedule');
  });

  it('moves a still-unapproved item to the next slot', () => {
    const outcome = decideReschedule({
      status: 'pending_approval',
      scheduledAt: new Date('2026-08-10T22:00:00Z'),
      now: new Date('2026-08-10T23:00:00Z'),
      rescheduleCount: 1,
      rendersComplete: true,
      nextSlots,
    });
    expect(outcome.action).toBe('reschedule');
    expect(outcome).toMatchObject({ slotName: 'evening' });
  });

  it('expires rather than publishing something approved four days ago', () => {
    const outcome = decideReschedule({
      status: 'pending_approval',
      scheduledAt: new Date('2026-08-10T22:00:00Z'),
      now: new Date('2026-08-10T23:00:00Z'),
      rescheduleCount: MAX_RESCHEDULES,
      rendersComplete: true,
      nextSlots,
    });
    expect(outcome.action).toBe('expire');
  });
});

describe('publish failure policy — build pack §3', () => {
  it('never retries an auth failure and pauses the account queue', () => {
    const policy = publishFailurePolicy('auth', 1);
    expect(policy.retry).toBe(false);
    expect(policy.setAccountState).toBe('error');
    expect(policy.pauseAccountQueue).toBe(true);
    expect(policy.notify).toBe('auth_failure');
  });

  it('never retries a malformed response — that double-posts', () => {
    const policy = publishFailurePolicy('malformed_response', 1);
    expect(policy.retry).toBe(false);
    expect(policy.markReconciliation).toBe(true);
  });

  it('honours Retry-After on a rate limit', () => {
    expect(publishFailurePolicy('rate_limit', 1, 900).backoffSeconds).toBe(900);
    expect(publishFailurePolicy('rate_limit', 4).retry).toBe(false);
  });

  it('hard-aborts a duplicate and raises the alert', () => {
    const policy = publishFailurePolicy('duplicate', 1);
    expect(policy.retry).toBe(false);
    expect(policy.notify).toBe('duplicate_publish_abort');
  });
});
