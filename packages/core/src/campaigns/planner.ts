/**
 * Campaign planning. Milestone 44.
 *
 * A launch is the one time the normal cadence is wrong. The mix exists to stop
 * the feed becoming an advertisement, and for three days that is exactly what
 * you want it to be — so the ceiling lifts for the window and snaps back at
 * `ends_at`, and the trailing mix calculation ignores campaign days entirely so
 * a three-day launch does not distort three weeks of normal posting after it.
 *
 * The *shape* of a launch sequence is known and is computed here, deterministically:
 * teasers, a staggered launch-morning burst, mid-day follow-ups, a thank-you, and
 * a results post. What each slot should actually say is not known, and is written
 * later. That split is the point — the timeline is reviewable and rearrangeable
 * before a single token is spent generating anything into it.
 */
import type { PlatformId } from '../adapters/types.js';

export type CampaignKind = 'launch' | 'feature' | 'seasonal' | 'experiment' | 'other';

export type SlotPurpose =
  | 'teaser'
  | 'launch_announcement'
  | 'launch_support'
  | 'demo'
  | 'follow_up'
  | 'social_proof'
  | 'thank_you'
  | 'results';

export interface CampaignBrief {
  /** The sentence the operator wrote. */
  description: string;
  kind: CampaignKind;
  startsAt: Date;
  endsAt: Date;
  goal?: string;
  /** Accounts that can actually carry a post, in preference order. */
  platforms: Array<{ platform: PlatformId; persona: 'brand' | 'founder' }>;
}

export interface PlannedSlot {
  /** Stable within a plan, so the UI can reorder without re-planning. */
  key: string;
  /** Days relative to `startsAt`. Negative is a teaser. */
  dayOffset: number;
  /** Local hour, before the scheduler's own jitter and slot resolution. */
  hour: number;
  platform: PlatformId;
  persona: 'brand' | 'founder';
  purpose: SlotPurpose;
  format: 'text' | 'image' | 'carousel' | 'video' | 'pin';
  category: string;
  /** What this post is for, in the operator's language. */
  intent: string;
  scheduledAt: Date;
}

export interface CampaignPlan {
  slots: PlannedSlot[];
  /** Why the plan looks like this, shown above the timeline. */
  rationale: string[];
  warnings: string[];
}

/**
 * What each purpose is for, and what it must not become.
 *
 * These are the instructions the copywriter is given per slot, so a launch
 * sequence does not turn into five variations of "we launched".
 */
export const SLOT_INTENT: Record<SlotPurpose, string> = {
  teaser:
    'Show the problem, not the product. Earn attention before there is anything to click.',
  launch_announcement:
    'It is live, what it does, one link. The only post in the sequence allowed to be a plain announcement.',
  launch_support:
    'The same news in the native shape of this platform, not a copy of the announcement.',
  demo: 'Show it working on a real input. No claims that the footage does not prove.',
  follow_up:
    'Answer the question people actually asked in the first few hours, rather than the one you expected.',
  social_proof:
    'Something a real user said, quoted exactly, resolving to a stored row. Never invented.',
  thank_you:
    'Specific and unsentimental. Name what happened; do not perform gratitude.',
  results:
    'The real numbers, including the ones that did not go well. This is the post that earns the next launch.',
};

/** Platform-native default format for a slot. */
function formatFor(platform: PlatformId, purpose: SlotPurpose): PlannedSlot['format'] {
  if (platform === 'youtube' || platform === 'tiktok') return 'video';
  if (platform === 'pinterest') return 'pin';
  if (purpose === 'demo') return platform === 'instagram' ? 'video' : 'image';
  if (purpose === 'results') return platform === 'instagram' ? 'carousel' : 'text';
  if (platform === 'instagram') return 'image';
  return 'text';
}

function categoryFor(purpose: SlotPurpose): string {
  switch (purpose) {
    case 'teaser':
      return 'education';
    case 'demo':
      return 'transformation';
    case 'social_proof':
      return 'community';
    case 'thank_you':
    case 'results':
      return 'founder_insight';
    default:
      return 'product';
  }
}

/**
 * The launch-morning burst is staggered rather than simultaneous.
 *
 * Posting the same news to six platforms at the same minute reads as automation
 * on every one of them, and it wastes the only moment when all of them would
 * have carried it. Twenty-five minutes apart is enough to look deliberate.
 */
const BURST_STAGGER_MINUTES = 25;

export function planCampaign(brief: CampaignBrief): CampaignPlan {
  const slots: PlannedSlot[] = [];
  const rationale: string[] = [];
  const warnings: string[] = [];

  const platforms = brief.platforms;
  if (platforms.length === 0) {
    return {
      slots: [],
      rationale: [],
      warnings: [
        'No connected account can carry a post, so there is nothing to plan. Connect at least one account on /accounts.',
      ],
    };
  }

  const days = Math.max(
    1,
    Math.round((brief.endsAt.getTime() - brief.startsAt.getTime()) / 86_400_000),
  );

  const at = (dayOffset: number, hour: number, minuteOffset = 0): Date => {
    const date = new Date(brief.startsAt);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minuteOffset, 0, 0);
    return date;
  };

  const push = (
    dayOffset: number,
    hour: number,
    platform: { platform: PlatformId; persona: 'brand' | 'founder' },
    purpose: SlotPurpose,
    minuteOffset = 0,
  ): void => {
    slots.push({
      key: `${purpose}-${platform.platform}-${dayOffset}-${slots.length}`,
      dayOffset,
      hour,
      platform: platform.platform,
      persona: platform.persona,
      purpose,
      format: formatFor(platform.platform, purpose),
      category: categoryFor(purpose),
      intent: SLOT_INTENT[purpose],
      scheduledAt: at(dayOffset, hour, minuteOffset),
    });
  };

  const brand = platforms.filter((p) => p.persona === 'brand');
  const founder = platforms.find((p) => p.persona === 'founder');
  const primary = brand[0] ?? platforms[0]!;

  // ── Teasers, before the window opens ─────────────────────────────────────
  if (brief.kind === 'launch' || brief.kind === 'feature') {
    push(-2, 9, primary, 'teaser');
    if (founder) push(-1, 17, founder, 'teaser');
    rationale.push(
      'Two teasers before the window, showing the problem rather than the product. A launch that starts on launch day is talking to nobody.',
    );
  }

  // ── Launch morning: every platform, staggered ────────────────────────────
  platforms.forEach((platform, index) => {
    push(
      0,
      9,
      platform,
      index === 0 ? 'launch_announcement' : 'launch_support',
      index * BURST_STAGGER_MINUTES,
    );
  });
  rationale.push(
    `The launch-morning burst goes to all ${platforms.length} platforms ${BURST_STAGGER_MINUTES} minutes apart. Simultaneous posting reads as automation on every one of them.`,
  );

  // ── Same day: a demo, and the founder's own account ──────────────────────
  const demoPlatform =
    platforms.find((p) => p.platform === 'instagram' || p.platform === 'tiktok') ?? primary;
  push(0, 13, demoPlatform, 'demo');
  if (founder) push(0, 19, founder, 'follow_up');

  // ── The days between ─────────────────────────────────────────────────────
  for (let day = 1; day < days; day++) {
    const platform = platforms[day % platforms.length]!;
    // Alternate between answering questions and showing evidence, so the middle
    // of a campaign is not four days of the same post.
    push(day, 11, platform, day % 2 === 1 ? 'follow_up' : 'social_proof');
  }
  if (days > 2) {
    rationale.push(
      'The middle days alternate between answering what people actually asked and showing evidence, rather than repeating the announcement.',
    );
  }

  // ── Close ────────────────────────────────────────────────────────────────
  push(Math.max(1, days - 1), 16, founder ?? primary, 'thank_you');
  // The results post lands after the window closes, deliberately: it is about
  // the campaign, so it cannot be written during it.
  push(days + 2, 10, founder ?? primary, 'results');
  rationale.push(
    'The results post sits three days after the window closes. It is about the campaign, so it cannot honestly be written during it.',
  );

  // ── Warnings ─────────────────────────────────────────────────────────────
  if (!founder) {
    warnings.push(
      'No founder account is connected, so the thank-you and results posts are planned on the brand account. Both read better in the first person.',
    );
  }
  if (platforms.length < 3) {
    warnings.push(
      `Only ${platforms.length} account${platforms.length === 1 ? '' : 's'} can carry a post, so the launch-morning burst is thin. Connect more on /accounts.`,
    );
  }
  const socialProofSlots = slots.filter((s) => s.purpose === 'social_proof').length;
  if (socialProofSlots > 0) {
    warnings.push(
      `${socialProofSlots} slot${socialProofSlots === 1 ? '' : 's'} plan to quote a real user. Those stay unwritten unless /social-proof has something that resolves to a stored row — nothing here will invent a testimonial.`,
    );
  }

  slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return { slots, rationale, warnings };
}

// ── The mix override ───────────────────────────────────────────────────────

export interface MixOverrideInput {
  /** The normal ceiling, 0.15. */
  baseCeiling: number;
  /** The campaign's own ceiling, if one is running. */
  campaign?: {
    productMixCeiling: number;
    startsAt: Date;
    endsAt: Date;
    status: string;
  } | null;
  now?: Date;
}

export interface MixOverride {
  ceiling: number;
  active: boolean;
  /** Why the ceiling is what it is, shown on /ideas next to a blocked idea. */
  reason: string;
}

/**
 * The product-content ceiling, which lifts during a campaign and snaps back.
 *
 * "Reverts at ends_at" is literal: the comparison is against the window, not
 * against a flag someone has to remember to turn off. A campaign left in
 * `running` after its end date does not keep the ceiling raised.
 */
export function effectiveProductCeiling(input: MixOverrideInput): MixOverride {
  const now = input.now ?? new Date();
  const campaign = input.campaign;

  if (!campaign) {
    return {
      ceiling: input.baseCeiling,
      active: false,
      reason: `No campaign is running, so the normal ${Math.round(input.baseCeiling * 100)}% product ceiling applies.`,
    };
  }

  if (campaign.status === 'abandoned' || campaign.status === 'complete') {
    return {
      ceiling: input.baseCeiling,
      active: false,
      reason: `The campaign is ${campaign.status}, so the normal ceiling applies again.`,
    };
  }

  const inWindow = now >= campaign.startsAt && now <= campaign.endsAt;
  if (!inWindow) {
    return {
      ceiling: input.baseCeiling,
      active: false,
      reason:
        now < campaign.startsAt
          ? `The campaign has not started, so the normal ${Math.round(input.baseCeiling * 100)}% ceiling still applies.`
          : `The campaign window closed, so the ceiling reverted to ${Math.round(input.baseCeiling * 100)}%.`,
    };
  }

  return {
    ceiling: campaign.productMixCeiling,
    active: true,
    reason: `A campaign is running until ${campaign.endsAt.toISOString().slice(0, 10)}, so product content may reach ${Math.round(campaign.productMixCeiling * 100)}% instead of ${Math.round(input.baseCeiling * 100)}%. It reverts on its own when the window closes.`,
  };
}
