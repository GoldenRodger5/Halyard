/**
 * Staggering. v2 Part E.2.
 *
 *   Idea → platform variants → per-platform slot assignment → stagger → publish
 *
 * "Do not post everything at 9:00:00." Randomised offsets within a slot window
 * cost nothing and remove an obvious tell. Jitter here is *deterministic* — it
 * is derived from the content item id — so a scheduling decision is reproducible
 * and testable rather than genuinely random.
 */
import type { ResolvedSlot } from './timezone.js';

export interface StaggerRules {
  /** Consecutive posts cannibalise each other's reach. */
  minGapSamePlatformMinutes: number;
  /** Avoids a synchronised burst that reads as automated. */
  minGapCrossPlatformSameIdeaMinutes: number;
  maxGapCrossPlatformSameIdeaMinutes: number;
  /** Founder and brand should not look coordinated. */
  minGapFounderVsBrandMinutes: number;
  /** Exact-o'clock posting is an automation fingerprint. */
  jitterMinutes: number;
  /** Per-platform daily ceilings. Pinterest is a search index, not a feed. */
  maxPerPlatformPerDay: Record<string, number>;
}

export const DEFAULT_STAGGER_RULES: StaggerRules = {
  minGapSamePlatformMinutes: 4 * 60,
  minGapCrossPlatformSameIdeaMinutes: 45,
  maxGapCrossPlatformSameIdeaMinutes: 90,
  minGapFounderVsBrandMinutes: 3 * 60,
  jitterMinutes: 7,
  maxPerPlatformPerDay: {
    x: 2,
    instagram: 2,
    tiktok: 1,
    threads: 2,
    youtube: 1,
    // v2 E.2: "Pinterest daily volume 3–5 pins. Different medium: a search
    // index, not a feed."
    pinterest: 5,
  },
};

export interface ScheduleCandidate {
  id: string;
  platform: string;
  persona: 'founder' | 'brand';
  ideaId?: string | null;
  slot: ResolvedSlot;
}

export interface ExistingPost {
  id: string;
  platform: string;
  persona: 'founder' | 'brand';
  ideaId?: string | null;
  scheduledAt: Date;
}

export interface ScheduleDecision {
  id: string;
  scheduledAt: Date | null;
  slotName: string;
  /** Why the scheduler landed where it did, shown in the queue and the calendar. */
  reason: string;
  /** Set when the item could not be placed at all. */
  deferred?: boolean;
}

/**
 * Deterministic jitter in [-jitter, +jitter] minutes, derived from an id.
 * FNV-1a: small, stable across runtimes, and good enough to decorrelate ids
 * that differ by one character.
 */
export function deterministicJitterMinutes(seed: string, jitterMinutes: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const span = jitterMinutes * 2 + 1;
  return (hash % span) - jitterMinutes;
}

const MINUTE = 60_000;

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MINUTE;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 86_400_000) === Math.floor(b.getTime() / 86_400_000);
}

/**
 * Place candidates inside their slot windows, honouring every gap rule.
 *
 * Candidates are placed in the order given; the caller sorts by priority. A
 * candidate that cannot be placed inside its window without violating a rule is
 * returned deferred rather than silently squeezed in.
 */
export function planSchedule(
  candidates: ScheduleCandidate[],
  existing: ExistingPost[],
  rules: StaggerRules = DEFAULT_STAGGER_RULES,
): ScheduleDecision[] {
  const placed: ExistingPost[] = [...existing];
  const decisions: ScheduleDecision[] = [];

  for (const candidate of candidates) {
    const { slot } = candidate;
    const windowMinutes = Math.max(
      0,
      (slot.endUtc.getTime() - slot.startUtc.getTime()) / MINUTE,
    );

    // Daily ceiling first — cheapest rejection.
    const dailyCap = rules.maxPerPlatformPerDay[candidate.platform] ?? 1;
    const sameDayOnPlatform = placed.filter(
      (p) => p.platform === candidate.platform && sameLocalDay(p.scheduledAt, slot.startUtc),
    ).length;
    if (sameDayOnPlatform >= dailyCap) {
      decisions.push({
        id: candidate.id,
        scheduledAt: null,
        slotName: slot.name,
        deferred: true,
        reason: `${candidate.platform} already has ${sameDayOnPlatform} post${
          sameDayOnPlatform === 1 ? '' : 's'
        } that day, at the ceiling of ${dailyCap}.`,
      });
      continue;
    }

    // Start at the window midpoint, then jitter, then walk forward in 5-minute
    // steps until every gap rule is satisfied or the window is exhausted.
    const jitter = deterministicJitterMinutes(candidate.id, rules.jitterMinutes);
    const midpoint = slot.startUtc.getTime() + (windowMinutes / 2) * MINUTE;
    let attempt = new Date(midpoint + jitter * MINUTE);
    if (attempt < slot.startUtc) attempt = new Date(slot.startUtc);

    let chosen: Date | null = null;
    let blockedBy = '';

    for (let step = 0; step <= Math.ceil(windowMinutes / 5); step++) {
      const probe = new Date(attempt.getTime() + step * 5 * MINUTE);
      if (probe > slot.endUtc) break;
      const conflict = firstConflict(probe, candidate, placed, rules);
      if (!conflict) {
        chosen = probe;
        break;
      }
      blockedBy = conflict;
    }

    // Walking forward failed; try backwards from the jittered start.
    if (!chosen) {
      for (let step = 1; step <= Math.ceil(windowMinutes / 5); step++) {
        const probe = new Date(attempt.getTime() - step * 5 * MINUTE);
        if (probe < slot.startUtc) break;
        const conflict = firstConflict(probe, candidate, placed, rules);
        if (!conflict) {
          chosen = probe;
          break;
        }
        blockedBy = conflict;
      }
    }

    if (!chosen) {
      decisions.push({
        id: candidate.id,
        scheduledAt: null,
        slotName: slot.name,
        deferred: true,
        reason: blockedBy || `No free minute inside the ${slot.name} window.`,
      });
      continue;
    }

    // Seconds are always zeroed. A post at 18:07:00 reads human; 18:07:43 reads
    // like a cron job that happened to fire.
    chosen.setUTCSeconds(0, 0);

    placed.push({
      id: candidate.id,
      platform: candidate.platform,
      persona: candidate.persona,
      ideaId: candidate.ideaId ?? null,
      scheduledAt: chosen,
    });
    decisions.push({
      id: candidate.id,
      scheduledAt: chosen,
      slotName: slot.name,
      reason: `${slot.name} window, ${jitter >= 0 ? '+' : ''}${jitter} min jitter.`,
    });
  }

  return decisions;
}

function firstConflict(
  probe: Date,
  candidate: ScheduleCandidate,
  placed: ExistingPost[],
  rules: StaggerRules,
): string | null {
  for (const other of placed) {
    const gap = minutesBetween(probe, other.scheduledAt);

    if (other.platform === candidate.platform && gap < rules.minGapSamePlatformMinutes) {
      return `Within ${Math.round(gap)} min of another ${candidate.platform} post; minimum is ${
        rules.minGapSamePlatformMinutes
      }.`;
    }

    if (
      other.platform === candidate.platform &&
      other.persona !== candidate.persona &&
      gap < rules.minGapFounderVsBrandMinutes
    ) {
      return `Founder and brand posts on ${candidate.platform} would be ${Math.round(
        gap,
      )} min apart; minimum is ${rules.minGapFounderVsBrandMinutes}.`;
    }

    if (
      candidate.ideaId &&
      other.ideaId === candidate.ideaId &&
      other.platform !== candidate.platform &&
      gap < rules.minGapCrossPlatformSameIdeaMinutes
    ) {
      return `Same idea on ${other.platform} only ${Math.round(gap)} min away; minimum is ${
        rules.minGapCrossPlatformSameIdeaMinutes
      }.`;
    }
  }
  return null;
}

/**
 * Density warnings for the calendar (v1 §8): "3 Instagram posts within 2 hours".
 * Reports what the planner would have prevented but a human drag-and-drop can
 * still create.
 */
export function densityWarnings(
  posts: ExistingPost[],
  rules: StaggerRules = DEFAULT_STAGGER_RULES,
): Array<{ platform: string; at: Date; message: string }> {
  const warnings: Array<{ platform: string; at: Date; message: string }> = [];
  const sorted = [...posts].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (a.platform !== b.platform) continue;
      const gap = minutesBetween(a.scheduledAt, b.scheduledAt);
      if (gap >= rules.minGapSamePlatformMinutes) break;
      warnings.push({
        platform: a.platform,
        at: b.scheduledAt,
        message: `Two ${a.platform} posts ${Math.round(gap)} minutes apart. They will cannibalise each other.`,
      });
    }
  }
  return warnings;
}
