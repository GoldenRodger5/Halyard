/**
 * The Social Engine: intelligence, and deliberately not action. §209.
 *
 * §3.2 and §8 of the specification ask Halyard to map the social environment
 * around each account — creators worth studying, accounts worth following,
 * communities, publications, recurring questions, collaboration candidates —
 * and to produce ranked recommendations with reasons and evidence.
 *
 * Both sections then say the same thing twice, in different words, and it is
 * the most important sentence in either: **"Public engagement automation is not
 * implied by this intelligence layer."**
 *
 * ## The boundary, enforced rather than described
 *
 * A recommendation here is a row a person reads. There is no code path from one
 * to a follow, a reply, a mention, or a message, and `RECOMMENDATION_KINDS`
 * contains no verb that reaches the network. That is not an omission to be
 * filled in later by whoever needs it — `assertNoAutonomousAction` exists so
 * that adding one is a test failure rather than a quiet capability gain.
 *
 * The existing model already refuses this at the platform layer:
 * `platform/policy.ts` declines to represent "respond to comments" and "answer
 * direct messages" at all, precisely so a capability entry cannot reopen a
 * closed safety decision. This module is the same decision one level up.
 *
 * ## Evidence, or it does not rank
 *
 * A recommendation with no evidence is an opinion about a stranger. Every one
 * carries what was observed, where, and when — and `rankRecommendations` drops
 * the ones that do not, rather than ranking them low. Popularity is explicitly
 * not evidence: §13 of the specification asks that the engine avoid
 * "recommending irrelevant/high-volume accounts merely because they are
 * popular", so reach is a tie-breaker and relevance is the sort key.
 *
 * Pure. No network, no database, no model.
 */
import { effectiveValue, type DiscoverySignal } from '../discovery/freshness.js';

/**
 * What a person might do about a recommendation.
 *
 * Every one of these is something a human does in their own client. There is no
 * `follow_now`, no `reply`, no `dm`, and none may be added — see
 * `assertNoAutonomousAction`.
 */
export const RECOMMENDATION_KINDS = [
  'study',
  'follow',
  'investigate',
  'collaborate',
  'reference',
  'respond',
  'monitor',
  'ignore',
] as const;

export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const SUBJECT_TYPES = [
  'creator',
  'brand',
  'community',
  'publication',
  'topic',
  'conversation',
  'question',
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export interface RecommendationEvidence {
  /** What was actually seen. One line, checkable. */
  observation: string;
  /** Where it was seen — a URL, a handle, a search. */
  source: string;
  observedAt: Date;
  /** Reach, when known. Never the reason for a recommendation; only a tiebreak. */
  audienceSize?: number | null;
}

export interface SocialRecommendation {
  accountId: string;
  platform: string;
  subject: string;
  subjectType: SubjectType;
  kind: RecommendationKind;
  /**
   * How close this is to what the account is actually about, 0..1.
   *
   * The sort key. A large irrelevant account must lose to a small relevant one,
   * which is the failure §13 names.
   */
  relevance: number;
  /** How much the observation is trusted, 0..1. */
  confidence: number;
  /** Why, in words an operator can disagree with. */
  rationale: string;
  evidence: RecommendationEvidence[];
  /** Recommendations decay like every other discovery item. */
  expiresAt?: Date | null;
}

export interface RankedRecommendation extends SocialRecommendation {
  score: number;
  /** Present worth after decay, from `discovery/freshness`. */
  freshness: number;
}

/**
 * Rank by relevance to this account, then confidence, then reach.
 *
 * Reach is last on purpose and cannot promote an irrelevant subject past a
 * relevant one: it only separates two recommendations that are otherwise equal.
 *
 * Recommendations with no evidence are dropped rather than ranked low. A
 * recommendation is a claim about someone else, and an unevidenced one is not a
 * weak claim, it is not a claim.
 */
export function rankRecommendations(
  recommendations: SocialRecommendation[],
  now: Date = new Date(),
  limit?: number,
): RankedRecommendation[] {
  const ranked = recommendations
    .filter((r) => r.evidence.length > 0)
    .map((r) => {
      /*
       * Decay reuses the discovery curve, treating the newest evidence as the
       * observation. One definition of staleness across the system (§206).
       */
      const newest = r.evidence.reduce(
        (latest, e) => (e.observedAt > latest ? e.observedAt : latest),
        r.evidence[0]!.observedAt,
      );
      const signal: DiscoverySignal = {
        id: r.subject,
        source: 'editorial',
        relevance: r.relevance,
        observedAt: newest,
        expiresAt: r.expiresAt ?? null,
        confidence: r.confidence,
      };
      const fresh = effectiveValue(signal, now);

      /*
       * Reach enters as a small logarithmic tiebreak — the difference between
       * 1k and 10k followers matters more than between 900k and 910k, and
       * neither should outweigh being about the right thing.
       */
      const reach = Math.max(
        0,
        ...r.evidence.map((e) => (e.audienceSize == null ? 0 : Math.log10(e.audienceSize + 1))),
      );

      return { ...r, freshness: fresh, score: Math.round((fresh + reach * 0.01) * 10_000) / 10_000 };
    })
    .filter((r) => r.freshness > 0)
    .sort((a, b) => b.score - a.score);

  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/**
 * The kinds that would touch the network if anything executed them.
 *
 * Nothing does. This list exists so the guard below has something to check
 * against, and so a future reader can see that the omission was a decision.
 */
export const FORBIDDEN_AUTONOMOUS_ACTIONS = [
  'follow_now',
  'unfollow',
  'reply',
  'comment',
  'dm',
  'message',
  'mention',
  'like',
  'repost',
  'share',
  'subscribe',
] as const;

/**
 * The safety boundary, as an assertion rather than a paragraph.
 *
 * §3.2 and §8 both state that intelligence does not imply engagement
 * automation. A paragraph saying so is followed until someone needs a feature;
 * a function that throws is followed always. Called from the test suite so that
 * adding an executable verb to `RECOMMENDATION_KINDS` fails the build.
 */
export function assertNoAutonomousAction(kinds: readonly string[] = RECOMMENDATION_KINDS): void {
  for (const kind of kinds) {
    if ((FORBIDDEN_AUTONOMOUS_ACTIONS as readonly string[]).includes(kind)) {
      throw new Error(
        `"${kind}" is an action against a platform, not a recommendation. The Social Engine ` +
          'produces intelligence a person acts on; it does not act. See §209 and platform/policy.ts.',
      );
    }
  }
}

/**
 * Group ranked recommendations for presentation, keeping `ignore` visible.
 *
 * `ignore` is not filtered out. A subject the engine looked at and rejected is
 * more useful to an operator than its silent absence — it is the difference
 * between "we considered them" and "we never saw them", and it stops the same
 * candidate being re-surfaced every run.
 */
export function groupByKind(
  ranked: RankedRecommendation[],
): Record<RecommendationKind, RankedRecommendation[]> {
  const out = Object.fromEntries(
    RECOMMENDATION_KINDS.map((k) => [k, [] as RankedRecommendation[]]),
  ) as Record<RecommendationKind, RankedRecommendation[]>;
  for (const r of ranked) out[r.kind].push(r);
  return out;
}
