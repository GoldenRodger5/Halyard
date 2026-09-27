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
  /** Shared cross-platform creative package. Several placements can carry one concept. */
  conceptKey: string;
  /** The evidence-safe job of the package; each platform writes its own native variant. */
  conceptIntent: string;
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
  x: ['text'],
  bluesky: ['text'],
  threads: ['text', 'image'],
  // Reach + saves. Static image is a fallback, not the opening-run default.
  instagram: ['video', 'carousel', 'image'],
  tiktok: ['video'],
  youtube: ['video'],
  pinterest: ['pin', 'image'],
};

function supportedFormats(account: LaunchAccount): string[] {
  const preference = FORMAT_PREFERENCE[account.platform] ?? ['text'];
  return preference.filter((format) => account.supportedFormats.includes(format));
}

/**
 * Choose the native finish for one placement. Instagram alternates Reels and
 * carousels when both are available; the other networks keep their natural
 * primary format. An introduction prefers a carousel on Instagram because it
 * can explain the account in a swipeable evergreen piece.
 */
function formatFor(
  account: LaunchAccount,
  dayIndex = 0,
  purpose: LaunchSlotPurpose = 'regular',
): string | null {
  const available = supportedFormats(account);
  if (available.length === 0) return null;
  if (account.platform === 'instagram') {
    if (purpose === 'introduction' && available.includes('carousel')) return 'carousel';
    const growth = ['video', 'carousel'].filter((format) => available.includes(format));
    if (growth.length > 0) return growth[(Math.max(1, dayIndex) - 1) % growth.length]!;
  }
  return available[0]!;
}

/** One product-agnostic editorial brief per creative package. */
const CONCEPT_INTENTS: Record<string, string[]> = {
  transformation: [
    'Show one concrete before-to-after transformation using real product output. Open on the audience problem, make the mechanism visible, and let the changed result be the proof. Never invent user outcomes.',
    'Take one common failure mode and show exactly what changes when the product handles it correctly. Be specific enough that the post is useful without the CTA.',
    'Use one surprising edge case to demonstrate the product. The hook is the unexpected constraint; the payoff is the real, inspectable change the product makes.',
    'Turn a familiar task into a side-by-side: the naive approach versus the product-informed approach. Explain the difference instead of declaring a winner.',
  ],
  education: [
    'Teach one practical rule or mechanism the audience can use even if they never install the product. The product may appear as a compact demonstration, not as the lesson itself.',
    'Explain why the obvious approach often fails, then teach the better principle with one concrete example. Keep claims grounded in supplied evidence.',
    'Answer one narrow high-intent question the audience actually asks. Lead with the answer, show the reasoning, and only then connect it to the product.',
  ],
  community: [
    'Ask one specific, answerable question about the audience problem after giving a useful example first. No generic engagement bait and no empty “what do you think?” prompt.',
    'Create a choose-between-two-scenarios prompt grounded in a real workflow. The audience should be able to answer from experience and teach Halyard something useful.',
  ],
  product: [
    'Demonstrate one verified workflow end to end: starting state, action, and result. Do not list features; show one job being completed.',
    'Show one product detail that removes friction from a real task. The post should make the mechanism understandable before naming the feature.',
  ],
  brand: [
    'Introduce the account through one sharp domain belief or concrete failure mode, not through an announcement. The opening must be useful or surprising even if the reader never learns the product name. Do NOT open with “welcome”, “this account is for”, the product name, or a generic X-needs-changing sentence. Sentence one earns attention. Then say who this is for and what they will repeatedly learn here. Prefer one mechanism/example over a feature list. Evergreen, specific, and restrained.',
  ],
};

const CONCEPT_PACKAGE_SIZE = 4;

export function conceptFor(category: string, ordinal: number): { key: string; intent: string } {
  const options = CONCEPT_INTENTS[category] ?? [
    'Make one specific, evidence-backed piece that earns attention before asking for anything. Show or teach; do not announce.',
  ];
  const packageIndex = Math.floor(ordinal / CONCEPT_PACKAGE_SIZE);
  return {
    key: `${category}:${packageIndex + 1}`,
    intent: options[packageIndex % options.length]!,
  };
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
    if (formatFor(account, 0, 'introduction') === null) {
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
      format: formatFor(account, 0, 'introduction')!,
      purpose: 'introduction',
      conceptKey: `brand:introduction:${account.persona}`,
      conceptIntent: CONCEPT_INTENTS.brand![0]!,
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
  /*
   * Cadence is per social identity, not a global production budget. An
   * Instagram Reel must not consume TikTok's weekly video headroom, and two X
   * accounts do not share an algorithmic posting history. The old global map
   * starved TikTok/Shorts as soon as Instagram used the five-video ceiling.
   */
  const perWeekAccountFormatCounts: Array<Map<string, Record<string, number>>> = [];
  const countsFor = (accountId: string, dayIndex: number): Record<string, number> => {
    const week = Math.floor(dayIndex / 7);
    perWeekAccountFormatCounts[week] ??= new Map();
    const byAccount = perWeekAccountFormatCounts[week]!;
    const counts = byAccount.get(accountId) ?? {};
    byAccount.set(accountId, counts);
    return counts;
  };

  // Introductions count against that account's first-week cadence too.
  for (const account of usable) {
    const counts = countsFor(account.id, 0);
    const format = formatFor(account, 0, 'introduction')!;
    counts[format] = (counts[format] ?? 0) + 1;
  }

  const plannedRegular: Array<{ key: string; dayIndex: number; account: LaunchAccount; format: string }> = [];

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

      const format = formatFor(account, dayIndex, 'regular')!;
      const counts = countsFor(account.id, dayIndex);
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
      plannedRegular.push({ key, dayIndex, account, format });
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

  const seenByCategory = new Map<string, number>();
  plannedRegular.forEach((slot, index) => {
    const account = slot.account;
    const category = interleaved[index] ?? 'education';
    const ordinal = seenByCategory.get(category) ?? 0;
    const concept = conceptFor(category, ordinal);
    seenByCategory.set(category, ordinal + 1);
    meta.set(slot.key, {
      key: slot.key,
      accountId: account.id,
      platform: account.platform,
      persona: account.persona,
      category,
      format: slot.format,
      purpose: 'regular',
      conceptKey: concept.key,
      conceptIntent: concept.intent,
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
  const conceptCount = new Set(placed.map((slot) => slot.conceptKey)).size;
  rationale.push(
    `${placed.length} placements reuse ${conceptCount} creative packages. The evidence-backed idea stays coordinated while each platform gets its own native hook, length and finish.`,
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

  if (brief.days >= 7) {
    for (const account of usable) {
      const selectedFormats = new Set(
        placed.filter((slot) => slot.accountId === account.id).map((slot) => slot.format),
      );
      const debts = cadenceDebt(
        { thisWeek: countsFor(account.id, 0) },
        cadenceRules,
      ).filter((debt) => debt.short > 0 && selectedFormats.has(debt.format));
      for (const debt of debts) {
        warnings.push(
          `${account.platform} (${account.persona}) ${debt.format} is ${debt.short} below its weekly floor of ${debt.floor} in week one. Under-posting that account costs learning and reach.`,
        );
      }
    }
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
