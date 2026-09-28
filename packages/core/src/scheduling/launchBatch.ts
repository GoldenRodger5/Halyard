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
import { addLocalCalendarDays, resolveSlot, type SlotWindow } from './timezone.js';
import { contentFamilyForCategory } from '../creative/package.js';
import { creativeVariationFor, variationKey, type CreativeVariation } from '../creative/variety.js';

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
  /** Product-neutral creative treatment; one category should still vary in execution. */
  treatment: string;
  format: string;
  purpose: LaunchSlotPurpose;
  /** Shared cross-platform creative package. Several placements can carry one concept. */
  conceptKey: string;
  /** The evidence-safe job of the package; each platform writes its own native variant. */
  conceptIntent: string;
  /** Product-neutral creative shape. Subject/evidence still come from the Product Brain. */
  creativeVariation: CreativeVariation;
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

/**
 * Product-neutral cold-start mix used only when a product has not learned or
 * configured its own editorial mix yet. It prevents the worst default: an
 * empty config turning into an all-education account.
 */
export const DEFAULT_COLD_START_MIX = {
  education: 0.35,
  transformation: 0.25,
  community: 0.20,
  product: 0.20,
} as const;

export interface LaunchConceptIntent {
  treatment: string;
  intent: string;
}

/** One product-agnostic editorial brief per creative package. */
const CONCEPT_INTENTS: Record<string, LaunchConceptIntent[]> = {
  transformation: [
    { treatment: 'before_after', intent: 'Show one concrete before-to-after transformation using real product output. Open on the audience problem, make the mechanism visible, and let the changed result be the proof. Never invent user outcomes.' },
    { treatment: 'comparison', intent: 'Turn a familiar task into a side-by-side: the naive approach versus the product-informed approach. Explain the difference instead of declaring a winner.' },
    { treatment: 'process_montage', intent: 'Use one surprising edge case to demonstrate a sequence of meaningful changes. The hook is the unexpected constraint; the payoff is the real, inspectable change.' },
    { treatment: 'feature_demo', intent: 'Take one common failure mode and show exactly what changes when the product handles it correctly. Be specific enough that the post is useful without the CTA.' },
  ],
  education: [
    { treatment: 'how_to', intent: 'Teach one practical rule or mechanism the audience can use even if they never install the product. The product may appear as a compact demonstration, not as the lesson itself.' },
    { treatment: 'myth_fact', intent: 'Challenge one plausible but wrong assumption in the domain. State the misconception quickly, explain the mechanism, and give one evidence-backed example.' },
    { treatment: 'comparison', intent: 'Compare two approaches people genuinely confuse. Give the decision rule that separates them instead of padding the post with a generic pros-and-cons list.' },
    { treatment: 'listicle', intent: 'Give a short, saveable set of concrete checks, signs or rules. Every item must add a different piece of information and the final item should land the strongest payoff.' },
  ],
  community: [
    { treatment: 'comparison', intent: 'Create a choose-between-two-scenarios prompt grounded in a real workflow. Give enough context that the audience can answer from experience and teach Halyard something useful.' },
    { treatment: 'myth_fact', intent: 'Offer one defensible point of view the audience may disagree with, backed by a concrete example. Leave a real question open rather than manufacturing engagement bait.' },
    { treatment: 'listicle', intent: 'Show a few recognizable audience behaviors or failure modes and ask which one people actually encounter. The examples must be useful even without a reply.' },
    { treatment: 'how_to', intent: 'Answer one community question with a compact useful explanation, then invite a specific edge case or counterexample rather than asking “what do you think?”' },
  ],
  product: [
    { treatment: 'feature_demo', intent: 'Demonstrate one verified workflow end to end: starting state, action, and result. Do not list features; show one job being completed.' },
    { treatment: 'tutorial', intent: 'Show the shortest honest path through one high-value workflow. The audience should understand the job and result before the feature name matters.' },
    { treatment: 'comparison', intent: 'Show the real workflow with and without one verified product capability. Keep the comparison factual and make the mechanism visible.' },
    { treatment: 'process_montage', intent: 'Compress a real multi-step product workflow into a visual sequence with a clear starting state and payoff. Use only real capture for product behavior.' },
  ],
  brand: [
    { treatment: 'comparison', intent: 'Introduce the account through one sharp domain belief or concrete failure mode, not through an announcement. The opening must be useful or surprising even if the reader never learns the product name. Do NOT open with “welcome”, “this account is for”, the product name, or a generic X-needs-changing sentence. Sentence one earns attention. Then say who this is for and what they will repeatedly learn here. Prefer one mechanism/example over a feature list. Evergreen, specific, and restrained.' },
  ],
};

const CONCEPT_PACKAGE_SIZE = 4;

export function conceptFor(
  category: string,
  ordinal: number,
): { key: string; intent: string; treatment: string; variation: CreativeVariation } {
  const options = CONCEPT_INTENTS[category] ?? [
    {
      treatment: 'how_to',
      intent: 'Make one specific, evidence-backed piece that earns attention before asking for anything. Show or teach; do not announce.',
    },
  ];
  const packageIndex = Math.floor(ordinal / CONCEPT_PACKAGE_SIZE);
  const selected = options[packageIndex % options.length]!;
  const variation = {
    ...creativeVariationFor(contentFamilyForCategory(category), packageIndex),
    treatment: selected.treatment as CreativeVariation['treatment'],
  };
  return {
    key: `${category}:${packageIndex + 1}`,
    intent: selected.intent,
    treatment: variation.treatment,
    variation,
  };
}

/**
 * The categories to fill, in the order they should be filled.
 *
 * Derived from the mix targets by largest-remainder, so a 40/30/20/10 target
 * over twenty slots gives 8/6/4/2 rather than whatever rounding happens to
 * produce. With no targets set it uses DEFAULT_COLD_START_MIX: a transparent,
 * product-neutral prior that prevents a blank config from becoming a monotonous
 * single-category account while measured learning is still empty.
 */
export function allocateCategories(
  mixTargets: Record<string, number>,
  total: number,
): Record<string, number> {
  if (total <= 0) return {};
  const configured = Object.entries(mixTargets).filter(([, share]) => share > 0);
  const entries =
    configured.length > 0
      ? configured
      : Object.entries(DEFAULT_COLD_START_MIX);

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
      treatment: CONCEPT_INTENTS.brand![0]!.treatment,
      format: formatFor(account, 0, 'introduction')!,
      purpose: 'introduction',
      conceptKey: `brand:introduction:${account.persona}`,
      conceptIntent: CONCEPT_INTENTS.brand![0]!.intent,
      creativeVariation: {
        ...creativeVariationFor(contentFamilyForCategory('brand'), 0),
        treatment: CONCEPT_INTENTS.brand![0]!.treatment as CreativeVariation['treatment'],
      },
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
    const localDate = addLocalCalendarDays(brief.startDate, dayIndex, brief.audienceTimeZone);

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

  /*
   * A package may travel across platforms, but it must not come back to the
   * same social identity as a second post. Reusing one premise twice in the
   * same feed is coordinated in the database and repetitive to a person.
   *
   * Package bins are therefore capped both by size and by account identity.
   * With six platforms one useful idea can still get native variants; with one
   * account Halyard creates a new package for every placement instead of
   * manufacturing repetition to hit a reuse target.
   */
  const packageBins = new Map<
    string,
    Array<{ packageIndex: number; accounts: Set<string>; count: number }>
  >();

  plannedRegular.forEach((slot, index) => {
    const account = slot.account;
    const category = interleaved[index] ?? 'education';
    const bins = packageBins.get(category) ?? [];
    let bin = bins.find(
      (candidate) =>
        candidate.count < CONCEPT_PACKAGE_SIZE && !candidate.accounts.has(account.id),
    );
    if (!bin) {
      bin = { packageIndex: bins.length, accounts: new Set<string>(), count: 0 };
      bins.push(bin);
      packageBins.set(category, bins);
    }
    bin.accounts.add(account.id);
    bin.count += 1;

    // `conceptFor` remains the canonical key/intent generator. Starting at the
    // package boundary selects the corresponding package without pretending
    // four sequential occurrences are always safe to group.
    const concept = conceptFor(category, bin.packageIndex * CONCEPT_PACKAGE_SIZE);
    meta.set(slot.key, {
      key: slot.key,
      accountId: account.id,
      platform: account.platform,
      persona: account.persona,
      category,
      treatment: concept.treatment,
      format: slot.format,
      purpose: 'regular',
      conceptKey: concept.key,
      conceptIntent: concept.intent,
      creativeVariation: concept.variation,
    });
  });

  if (Object.keys(brief.mixTargets).length === 0) {
    rationale.push(
      'No product-specific mix targets are configured yet, so this cold start uses the product-neutral editorial mix: education 35%, transformation 25%, community 20%, product proof 20%. Measured account performance can replace that prior later.',
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
  const variationCount = new Set(placed.map((slot) => variationKey(slot.creativeVariation))).size;
  rationale.push(
    `${variationCount} distinct creative shapes are present across those packages — treatment, opening, media mode, audio mode and caption job rotate deliberately instead of one category mapping to one template.`,
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
 * Choose the first cold-start production set without knowing anything about a
 * product vertical.
 *
 * The full launch remains on the calendar, but a new product should not buy
 * media for every placement before Halyard has learned whether any recipe is
 * worth repeating. Selection is deliberately product-neutral: cover distinct
 * media shapes first, then distinct platforms, categories and treatments.
 *
 * Introductions are fallback-only. They are important to the account, but a
 * calibration dollar is better spent proving a reusable editorial shape than
 * producing six versions of "hello" before the product has a visual language.
 */
export function selectLaunchCalibrationSlots(
  slots: LaunchSlot[],
  maxSlots = 6,
): LaunchSlot[] {
  if (maxSlots <= 0) return [];

  const placed = slots.filter((slot) => !slot.deferred && slot.scheduledAt);
  const regular = placed.filter((slot) => slot.purpose === 'regular');
  const pool = regular.length > 0 ? regular : placed;

  const selected: LaunchSlot[] = [];
  const remaining = [...pool];
  const formats = new Set<string>();
  const platforms = new Set<string>();
  const categories = new Set<string>();
  const treatments = new Set<string>();

  while (remaining.length > 0 && selected.length < maxSlots) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const [index, slot] of remaining.entries()) {
      let score = 0;
      if (!formats.has(slot.format)) score += 12;
      if (!platforms.has(slot.platform)) score += 10;
      if (!categories.has(slot.category)) score += 5;
      if (!treatments.has(slot.treatment)) score += 3;

      // Earlier scheduled work is the deterministic tie-breaker: calibration
      // should unlock the next wave, not a later one.
      const time = new Date(slot.scheduledAt ?? 0).getTime();
      const tieBreak = Number.isFinite(time) ? -time / 1e15 : 0;
      score += tieBreak;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    if (!picked) break;
    selected.push(picked);
    formats.add(picked.format);
    platforms.add(picked.platform);
    categories.add(picked.category);
    treatments.add(picked.treatment);
  }

  return selected;
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
