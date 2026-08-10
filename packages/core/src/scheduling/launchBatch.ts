/**
 * The launch batch. Milestone 51.
 *
 * "Generate my first two weeks" — a full staggered schedule across every
 * connected platform, respecting mix targets and per-format cadence ceilings, so
 * a fortnight gets reviewed in one sitting rather than six posts a day for
 * fourteen days.
 *
 * ## This is mostly wiring, not new machinery
 *
 * `planSchedule`, `checkCadence` and `cadenceDebt` were built in earlier rounds
 * and, as of this milestone, had **no call sites outside their own tests**.
 * Daily generation never set `scheduled_at` at all, so nothing had ever
 * consulted a slot window, a stagger rule or a cadence ceiling in production.
 * The launch batch is the first caller, and finding that out is most of why the
 * milestone was worth doing.
 *
 * ## What it decides, and what it refuses to decide
 *
 * It decides *when*: which slot, which day, which platform, in what order, with
 * every gap rule honoured and every ceiling respected. It does not decide *what*
 * — that is the copywriter's job, running per slot afterwards, exactly the way
 * campaigns already work.
 *
 * A slot it cannot place is returned deferred with the reason, never squeezed
 * in. Fourteen days of content that quietly violates its own cadence rules would
 * be worse than twelve days that admit it.
 */
import { checkCadence, cadenceDebt, DEFAULT_CADENCE, type CadenceRule } from './cadence.js';
import {
  DEFAULT_STAGGER_RULES,
  planSchedule,
  type ExistingPost,
  type ScheduleCandidate,
  type StaggerRules,
} from './stagger.js';
import { localDateString, resolveSlot, type SlotWindow } from './timezone.js';

export interface LaunchAccount {
  id: string;
  platform: string;
  persona: 'founder' | 'brand';
  /** Formats this account can actually carry. */
  supportedFormats: string[];
}

export interface LaunchBatchBrief {
  /** Local day the batch starts on, 'YYYY-MM-DD' in the audience timezone. */
  startDate: string;
  days: number;
  audienceTimeZone: string;
  accounts: LaunchAccount[];
  /** Slot windows per platform, as configured on the product. */
  slots: Record<string, SlotWindow[]>;
  /** category → share of the batch, from brand_voices.mix_targets. */
  mixTargets: Record<string, number>;
  /** Anything already on the calendar in this window. */
  existing?: ExistingPost[];
  cadenceRules?: CadenceRule[];
  staggerRules?: StaggerRules;
}

/**
 * Named distinctly from the campaign planner's `SlotPurpose`, which has eight
 * members and a different meaning. Two unrelated things called the same thing
 * in one namespace is how the wrong one gets imported.
 */
export type LaunchSlotPurpose =
  /** The post that says what this account is. One per account, first. */
  | 'introduction'
  | 'regular';

export interface LaunchSlot {
  /** Stable within a plan, so the same brief produces the same ids. */
  key: string;
  accountId: string;
  platform: string;
  persona: 'founder' | 'brand';
  category: string;
  format: string;
  purpose: LaunchSlotPurpose;
  scheduledAt: Date | null;
  slotName: string;
  reason: string;
  deferred: boolean;
}

export interface LaunchBatchPlan {
  slots: LaunchSlot[];
  /** Why the plan looks the way it does, shown before anything is committed. */
  rationale: string[];
  /** What could not be honoured. Never silent. */
  warnings: string[];
  /** Placed, per platform, for the summary. */
  perPlatform: Record<string, number>;
  perCategory: Record<string, number>;
}

/**
 * Which format each platform gets for a slot.
 *
 * Deliberately narrow. The launch batch is not the place to discover that an
 * account cannot carry a carousel — it picks the first supported format from an
 * ordered preference, and an account supporting nothing gets no slots and a
 * warning rather than slots that fail at render time.
 */
const FORMAT_PREFERENCE: Record<string, string[]> = {
  x: ['text', 'image'],
  bluesky: ['text', 'image'],
  threads: ['text', 'image'],
  instagram: ['carousel', 'image', 'video'],
  tiktok: ['video'],
  youtube: ['video'],
  pinterest: ['pin', 'image'],
};

function formatFor(account: LaunchAccount): string | null {
  const preference = FORMAT_PREFERENCE[account.platform] ?? ['text'];
  return preference.find((format) => account.supportedFormats.includes(format)) ?? null;
}

/**
 * The categories to fill, in the order they should be filled.
 *
 * Derived from the mix targets by largest-remainder, so a 40/30/20/10 target
 * over twenty slots gives 8/6/4/2 rather than whatever rounding happens to
 * produce. With no targets set it returns a single 'education' bucket, which is
 * honest: an unspecified mix is not a mix.
 */
export function allocateCategories(
  mixTargets: Record<string, number>,
  total: number,
): Record<string, number> {
  const entries = Object.entries(mixTargets).filter(([, share]) => share > 0);
  if (entries.length === 0 || total <= 0) {
    return total > 0 ? { education: total } : {};
  }

  const sum = entries.reduce((acc, [, share]) => acc + share, 0);
  const exact = entries.map(([category, share]) => ({
    category,
    exact: (share / sum) * total,
  }));

  const allocation: Record<string, number> = {};
  let assigned = 0;
  for (const item of exact) {
    allocation[item.category] = Math.floor(item.exact);
    assigned += allocation[item.category]!;
  }

  // Largest remainder first, so the rounding error lands where it is smallest.
  const byRemainder = [...exact].sort(
    (a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)),
  );
  let index = 0;
  while (assigned < total && byRemainder.length > 0) {
    const item = byRemainder[index % byRemainder.length]!;
    allocation[item.category] = (allocation[item.category] ?? 0) + 1;
    assigned += 1;
    index += 1;
  }

  return allocation;
}

/** Local 'YYYY-MM-DD' for `offset` days after `startDate`. */
function addDays(startDate: string, offset: number, timeZone: string): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const base = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12);
  return localDateString(new Date(base + offset * 86_400_000), timeZone);
}

/**
 * Plan a launch batch.
 *
 * Deterministic and free of side effects — no clock, no LLM, no database. The
 * same brief always produces the same plan, which is what makes it reviewable
 * before anything is committed and testable afterwards.
 */
export function planLaunchBatch(brief: LaunchBatchBrief): LaunchBatchPlan {
  const rationale: string[] = [];
  const warnings: string[] = [];
  const cadenceRules = brief.cadenceRules ?? DEFAULT_CADENCE;
  const staggerRules = brief.staggerRules ?? DEFAULT_STAGGER_RULES;

  const usable = brief.accounts.filter((account) => {
    if (formatFor(account) === null) {
      warnings.push(
        `${account.platform} (${account.persona}) supports none of the formats this platform takes, so it got no posts. Check supported_formats on the account.`,
      );
      return false;
    }
    if ((brief.slots[account.platform] ?? []).length === 0) {
      warnings.push(
        `${account.platform} has no slot windows configured, so nothing could be scheduled there.`,
      );
      return false;
    }
    return true;
  });

  if (usable.length === 0) {
    return {
      slots: [],
      rationale: ['Nothing to plan: no connected account can carry a post yet.'],
      warnings: warnings.length > 0 ? warnings : ['No accounts are connected.'],
      perPlatform: {},
      perCategory: {},
    };
  }

  // ── 1. Introductions ─────────────────────────────────────────────────────
  //
  // One per account, on day one, before anything else. An account whose first
  // post is a tip about bread is an account nobody can tell the purpose of.
  const candidates: ScheduleCandidate[] = [];
  const meta = new Map<string, Omit<LaunchSlot, 'scheduledAt' | 'slotName' | 'reason' | 'deferred'>>();

  const introDay = brief.startDate;
  for (const account of usable) {
    const windows = brief.slots[account.platform]!;
    const window = windows[0]!;
    const key = `launch:${account.id}:intro`;
    candidates.push({
      id: key,
      platform: account.platform,
      persona: account.persona,
      ideaId: null,
      slot: resolveSlot(window, introDay, brief.audienceTimeZone),
    });
    meta.set(key, {
      key,
      accountId: account.id,
      platform: account.platform,
      persona: account.persona,
      category: 'brand',
      format: formatFor(account)!,
      purpose: 'introduction',
    });
  }
  rationale.push(
    `Every account opens with one post saying what it is, all on day one. Somebody who finds the account on day three should be able to tell what it is for.`,
  );

  // ── 2. The rest of the fortnight ─────────────────────────────────────────
  //
  // Cadence is a *weekly* rule, so it is tracked per rolling week rather than
  // across the whole batch. A format at its ceiling stops being offered rather
  // than being scheduled and rejected later.
  const perWeekFormatCounts: Array<Record<string, number>> = [];
  const weekOf = (dayIndex: number): Record<string, number> => {
    const week = Math.floor(dayIndex / 7);
    perWeekFormatCounts[week] ??= {};
    return perWeekFormatCounts[week]!;
  };

  // Introductions count against the first week's cadence too.
  for (const account of usable) {
    const counts = weekOf(0);
    const format = formatFor(account)!;
    counts[format] = (counts[format] ?? 0) + 1;
  }

  const plannedRegular: Array<{ key: string; dayIndex: number; account: LaunchAccount }> = [];

  /**
   * Accounts that share a platform take turns by day.
   *
   * The brand and founder X accounts must be three hours apart and any two
   * posts on one platform four hours apart, so offering both every day produces
   * a pile of candidates the placer is guaranteed to reject. Alternating gives
   * the same volume across the fortnight without the collisions, and the
   * deferral list stays meaningful instead of being mostly noise.
   */
  const sharingPlatform = new Map<string, LaunchAccount[]>();
  for (const account of usable) {
    sharingPlatform.set(account.platform, [
      ...(sharingPlatform.get(account.platform) ?? []),
      account,
    ]);
  }
  for (const [platform, group] of sharingPlatform) {
    if (group.length > 1) {
      rationale.push(
        `${platform} has ${group.length} accounts, so they alternate days rather than both posting every day. Two posts from the same brand hours apart read as one account with a scheduler.`,
      );
    }
  }

  for (let dayIndex = 1; dayIndex < brief.days; dayIndex += 1) {
    const localDate = addDays(brief.startDate, dayIndex, brief.audienceTimeZone);

    for (const account of usable) {
      const group = sharingPlatform.get(account.platform)!;
      if (group.length > 1) {
        const turn = group.findIndex((a) => a.id === account.id);
        if (dayIndex % group.length !== turn) continue;
      }

      const format = formatFor(account)!;
      const counts = weekOf(dayIndex);
      const verdict = checkCadence(format, { thisWeek: counts }, cadenceRules);
      if (!verdict.allowed) continue;

      const windows = brief.slots[account.platform]!;
      // Rotate the slot so a platform is not always in the same window, which
      // is both an automation tell and a way to never learn anything about
      // which window works.
      const window = windows[dayIndex % windows.length]!;
      const key = `launch:${account.id}:d${dayIndex}`;

      candidates.push({
        id: key,
        platform: account.platform,
        persona: account.persona,
        ideaId: null,
        slot: resolveSlot(window, localDate, brief.audienceTimeZone),
      });
      counts[format] = (counts[format] ?? 0) + 1;
      plannedRegular.push({ key, dayIndex, account });
    }
  }

  // ── 3. Categories ────────────────────────────────────────────────────────
  //
  // Assigned across the regular slots only. Introductions are not part of the
  // mix: they are structural.
  const allocation = allocateCategories(brief.mixTargets, plannedRegular.length);
  const queue: string[] = [];
  for (const [category, count] of Object.entries(allocation)) {
    for (let i = 0; i < count; i += 1) queue.push(category);
  }
  // Interleave rather than run in blocks, so a week is not all one category.
  const interleaved = interleave(queue);

  plannedRegular.forEach((slot, index) => {
    const account = slot.account;
    meta.set(slot.key, {
      key: slot.key,
      accountId: account.id,
      platform: account.platform,
      persona: account.persona,
      category: interleaved[index] ?? 'education',
      format: formatFor(account)!,
      purpose: 'regular',
    });
  });

  if (Object.keys(brief.mixTargets).length === 0) {
    warnings.push(
      'No mix targets are set on the brand voice, so every post was filed under education. Set them at /products so the batch is balanced on purpose rather than by default.',
    );
  }

  // ── 4. Placement ─────────────────────────────────────────────────────────
  const decisions = planSchedule(candidates, brief.existing ?? [], staggerRules);

  const slots: LaunchSlot[] = decisions.map((decision) => {
    const base = meta.get(decision.id)!;
    return {
      ...base,
      scheduledAt: decision.scheduledAt,
      slotName: decision.slotName,
      reason: decision.reason,
      deferred: decision.deferred === true,
    };
  });

  const placed = slots.filter((slot) => !slot.deferred);
  const deferred = slots.filter((slot) => slot.deferred);

  const perPlatform: Record<string, number> = {};
  const perCategory: Record<string, number> = {};
  for (const slot of placed) {
    perPlatform[slot.platform] = (perPlatform[slot.platform] ?? 0) + 1;
    perCategory[slot.category] = (perCategory[slot.category] ?? 0) + 1;
  }

  rationale.push(
    `${placed.length} posts across ${Object.keys(perPlatform).length} platforms over ${brief.days} days. Times are jittered inside each slot window, because posting on the exact hour is an automation fingerprint.`,
  );

  if (Object.keys(brief.mixTargets).length > 0) {
    // Counted after placement rather than from the allocation. A slot that was
    // dropped is not in the batch, and reporting the intended split as though
    // it were delivered is the kind of small lie that makes the whole screen
    // untrustworthy.
    const mix = Object.entries(perCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, n]) => `${n} ${category}`)
      .join(', ');
    if (mix) rationale.push(`Categories, as actually scheduled: ${mix}.`);
  }

  if (deferred.length > 0) {
    warnings.push(
      `${deferred.length} slot${deferred.length === 1 ? '' : 's'} could not be placed without breaking a spacing rule and ${deferred.length === 1 ? 'was' : 'were'} dropped rather than squeezed in.`,
    );
  }

  const debts = cadenceDebt(
    { thisWeek: perWeekFormatCounts[0] ?? {} },
    cadenceRules,
  ).filter((debt) => debt.short > 0 && usable.some((a) => formatFor(a) === debt.format));
  for (const debt of debts) {
    warnings.push(
      `${debt.format} is ${debt.short} below its weekly floor of ${debt.floor} in week one. Under-posting a format costs reach on the platforms that carry it.`,
    );
  }

  return { slots, rationale, warnings, perPlatform, perCategory };
}

/**
 * Spread a sorted list so equal values are as far apart as possible.
 *
 * `[a,a,a,b,b,c]` becomes `[a,b,c,a,b,a]`. Without this, a 50% education target
 * produces seven consecutive education posts and then a week of everything else,
 * which is a worse fortnight than the same posts in a different order.
 */
export function interleave(items: string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const group = groups.get(item) ?? [];
    group.push(item);
    groups.set(item, group);
  }

  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let placed = 0;
  while (placed < items.length) {
    for (const group of ordered) {
      const next = group.shift();
      if (next !== undefined) {
        out.push(next);
        placed += 1;
      }
    }
  }
  return out;
}
