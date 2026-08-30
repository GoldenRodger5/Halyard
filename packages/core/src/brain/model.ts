/**
 * The Product Brain's decisions — the half no model can reach.
 *
 * Everything in this file is a pure function over observed evidence. An agent
 * proposes a fact; nothing here asks an agent anything. That split is the whole
 * design:
 *
 *   the model says   "RecipeFix is for people with dietary restrictions"
 *   this file says   "two independent sources agree, so: verified, 0.80"
 *
 * If a model could write `status`, then the first fluent invention would arrive
 * as a product fact carrying a verification stamp, and every downstream
 * consumer — every prompt, every claim check, every marketing line — would
 * treat it as observed. The gap between "a model said it" and "it is true" is
 * exactly the gap this file holds open.
 */
import { isStale, VERIFICATION_TTL_DAYS } from '../explorer/verify.js';

/**
 * The categories the Brain owns.
 *
 * From `HALYARD_MASTER_ARCHITECTURE.md` §3 Team A, with two deliberate
 * omissions.
 *
 * **`features` is not here.** `feature_claims` is the feature inventory and it
 * verifies by replaying a flow in a real browser, which is stronger evidence
 * than corroboration between two pages. Two tables answering "what does this
 * product do" would drift, and the weaker one would win arguments by being
 * easier to write to.
 *
 * **`prohibited_claims` is not here either**, and for a sharper reason. This
 * table holds *observations* — things Halyard noticed about a product. A
 * prohibited claim is an *instruction*: the operator forbidding Halyard from
 * saying something. It already lives in `products.content_rules.forbidden_claims`
 * and is enforced by the slop filter, the copywriter and the setup-kit writer.
 *
 * Putting it here would create a second home for a safety rule *and* a category
 * a model can propose into — and a model proposing into the list of things it
 * must never say is the worst available arrangement of those two facts.
 *
 * The architecture names it under the Product Intelligence Model. This departs
 * from that on the strength of §21: do not rewrite a working subsystem to make
 * its name match the document.
 */
export const FACT_CATEGORIES = [
  'identity',
  'mission',
  'users',
  'personas',
  'jobs_to_be_done',
  'workflows',
  'differentiators',
  'pricing',
  'monetization',
  'competitors',
  'brand_voice',
  'visual_identity',
  'claims',
  'ux_model',
  'conversion_funnel',
  'app_store_positioning',
  'content_pillars',
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** Human labels, for the UI. Kept beside the list so one cannot outlive the other. */
export const CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: 'Identity',
  mission: 'Mission',
  users: 'Users',
  personas: 'Personas',
  jobs_to_be_done: 'Jobs to be done',
  workflows: 'Workflows',
  differentiators: 'Differentiators',
  pricing: 'Pricing',
  monetization: 'Monetization',
  competitors: 'Competitors',
  brand_voice: 'Brand voice',
  visual_identity: 'Visual identity',
  claims: 'Claims',
  ux_model: 'UX model',
  conversion_funnel: 'Conversion funnel',
  app_store_positioning: 'App Store positioning',
  content_pillars: 'Content pillars',
};

export const EVIDENCE_KINDS = [
  'web_page',
  'app_store_listing',
  'connector_surface',
  'connector_artifact',
  'screenshot',
  'repository',
  'operator_brief',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * The same four words `feature_claims` uses.
 *
 * Reused rather than redefined so the system has one vocabulary for belief. A
 * second enum meaning almost the same thing is how two parts of a codebase end
 * up disagreeing about what `verified` costs.
 */
/**
 * §328. `inferred` — a reasoned conclusion, marked as one.
 *
 * The Brain reported "nothing learned about" for competitors, personas and
 * jobs-to-be-done on a product whose site plainly implies all three, because
 * every agent may only record what a page states. That rule is right for a
 * *claim* and too strict for an *understanding*: a movie-diary product
 * competing with Letterboxd is not stated anywhere on its site and is obvious
 * to anybody who reads it.
 *
 * So inference is allowed and is given a status of its own, never `verified`.
 * Nothing published may cite an inferred fact — it exists to make the system
 * *understand* a product, not to put words in its mouth. `EVIDENTIAL_STATUSES`
 * is the list that may back a public claim, and this is deliberately not in it.
 */
export type FactStatus = 'unverified' | 'verified' | 'refuted' | 'unverifiable' | 'inferred';

/**
 * §328. Statuses that may back something a product says in public.
 *
 * An inferred fact may shape *how* a piece is written — which audience it
 * addresses, what it positions against — and may never be *asserted*. The
 * distinction is the same one gotcha 9 draws for metrics: reasoning about
 * something is not the same as observing it.
 */
export const EVIDENTIAL_STATUSES: readonly FactStatus[] = ['verified', 'unverified'];

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  sourceUrl: string | null;
  collectedAt: Date;
}

export interface ProposedFact {
  category: FactCategory;
  key: string;
  value: string;
  detail?: string | null;
}

/**
 * Categories corroboration cannot settle.
 *
 * A mission statement is what the product says about itself; finding it on two
 * pages of the same site proves the site is consistent, not that the mission is
 * true. Marking these `unverifiable` is the honest outcome — and it is very
 * deliberately not the same as hiding them.
 *
 */
export const UNVERIFIABLE_CATEGORIES = new Set<FactCategory>(['mission', 'brand_voice']);

/**
 * How many independent sources make a fact verified.
 *
 * Two, and never one. One source means "observed", which is what `unverified`
 * already says. The whole value of this number is that it cannot be reached by
 * a single confident assertion.
 */
export const CORROBORATION_REQUIRED = 2;

/**
 * How many distinct sources back a fact.
 *
 * Independence is counted by **source**, not by evidence row: the same page
 * fetched twice is one source, and two pages of one site are two. `kind` alone
 * would be too coarse — every page of a site shares `web_page` — and row count
 * would be too generous, since a collector that ran twice would corroborate
 * everything with itself.
 */
export function independentSources(evidence: EvidenceRef[]): number {
  const seen = new Set<string>();
  for (const e of evidence) {
    seen.add(e.sourceUrl ? `${e.kind}:${e.sourceUrl}` : `${e.kind}:${e.id}`);
  }
  return seen.size;
}

/**
 * The status of a fact, from its evidence alone.
 *
 * Note the signature: there is no parameter through which a proposal could
 * express what it believes its own status to be. That absence is the point, and
 * it mirrors `deriveState` in the agent capability model, which likewise never
 * receives `declaredStatus`.
 */
export function deriveFactStatus(input: {
  category: FactCategory;
  evidence: EvidenceRef[];
  refutedBy?: EvidenceRef[] | null;
}): FactStatus {
  // A refutation outranks agreement: something observed to be false is false
  // however many pages repeated it.
  if (input.refutedBy && input.refutedBy.length > 0) return 'refuted';

  if (input.evidence.length === 0) return 'unverified';

  if (UNVERIFIABLE_CATEGORIES.has(input.category)) return 'unverifiable';

  return independentSources(input.evidence) >= CORROBORATION_REQUIRED
    ? 'verified'
    : 'unverified';
}

/**
 * Confidence, as a measurement rather than a self-report.
 *
 * Three inputs, all observed: how many independent sources agree, whether the
 * evidence is recent, and whether the category is one corroboration can settle
 * at all. A model is never asked and has no way to influence this.
 *
 * The scale is deliberately coarse. A number like 0.83 implies a precision the
 * inputs do not support, and precision is exactly how a made-up figure starts
 * looking like a measurement.
 */
export function computeConfidence(input: {
  category: FactCategory;
  evidence: EvidenceRef[];
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  if (input.evidence.length === 0) return 0;

  const sources = independentSources(input.evidence);
  const freshest = input.evidence.reduce<Date | null>(
    (best, e) => (best === null || e.collectedAt > best ? e.collectedAt : best),
    null,
  );

  // Corroboration, capped: a fourth agreeing page is not meaningfully more
  // convincing than a third.
  let score = Math.min(sources, 3) * 0.25;

  // Stale evidence is weaker evidence. The same TTL the feature inventory uses,
  // because a fact about a product that ships without release notes decays at
  // the same rate whichever table it sits in.
  if (isStale(freshest, now)) score -= 0.25;

  /**
   * A ceiling for categories nothing can corroborate.
   *
   * Without it, a mission statement repeated on three pages would score higher
   * than a verified price — which would be the site's consistency masquerading
   * as the world's agreement.
   */
  if (UNVERIFIABLE_CATEGORIES.has(input.category)) score = Math.min(score, 0.5);

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export interface StoredFact {
  id: string;
  category: FactCategory;
  key: string;
  value: string;
  status: FactStatus;
  confidence: number;
  lastVerifiedAt: Date | null;
  agentId: string;
}

/**
 * Are two values the same fact stated twice?
 *
 * Defined here, once, because **two functions must agree on it**: `planFactWrites`
 * merges proposals that say the same thing, and `findContradictions` reports
 * ones that do not. If those two normalised differently, a pair of values could
 * merge in one pass and conflict in the other — which is how a fact ends up both
 * corroborated and contradicted by the same two observations.
 *
 * Deliberately strict: case and trailing punctuation only. A looser comparison
 * (substring, token overlap, edit distance) would let two genuinely different
 * statements merge and *raise* the confidence of the survivor, which is the
 * exact opposite of what corroboration is for. Two near-identical values that
 * fail this become a visible contradiction, and a contradiction an operator can
 * see beats a silent merge.
 */
export function sameValue(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ');
  if (norm(a) === norm(b)) return true;
  /*
   * §328. Paraphrases of one fact are one fact.
   *
   * Kinolog's Brain recorded `export` three times — "Kinolog lets users export
   * their data", "Users can export their Kinolog data", "Users can export their
   * Kinolog data" — because exact-match comparison treats a rewording as a
   * competing value, and the code that follows then writes both and expects the
   * contradiction pass to sort it out. A paraphrase is not a contradiction, so
   * nothing ever did.
   *
   * The effect is worse than untidy. It makes a Brain look richer than it is —
   * 23 identity facts of which about half were the same sentence — and it feeds
   * the same point to a writer several times, which is how a piece ends up
   * repeating itself.
   */
  /*
   * §328. Numbers decide, before any similarity is considered.
   *
   * Caught by its own test: "Plus costs $2.99 a month" and "Plus costs $4.99 a
   * month" share every content word and would have merged into one fact —
   * hiding a contradiction the reconciler exists to surface, and picking one of
   * two prices arbitrarily. The same holds for "500 films" against "100 films".
   *
   * A rewording changes the words and never the figures. So two statements
   * carrying different numbers are different facts however similar they read,
   * and this is checked first because getting it wrong publishes a wrong price.
   */
  if (!sameNumbers(a, b)) return false;
  return contentOverlap(a, b) >= 0.8;
}

/** The figures in a statement, which a paraphrase never alters. */
function sameNumbers(a: string, b: string): boolean {
  const numbers = (s: string) =>
    (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));
  const left = numbers(a);
  const right = numbers(b);
  /* One statement carrying detail the other omits is still the same fact. */
  if (left.length === 0 || right.length === 0) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.every((n) => longer.includes(n));
}

/** Words that carry no meaning of their own, for the comparison below. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'can', 'could',
  'will', 'would', 'may', 'might', 'to', 'of', 'in', 'on', 'for', 'with',
  'from', 'their', 'they', 'them', 'it', 'its', 'this', 'that', 'and', 'or',
  'as', 'at', 'by', 'own', 'any', 'all', 'you', 'your', 'users', 'user',
]);

/**
 * How much two statements say the same thing, 0..1.
 *
 * Content words only, so "Kinolog lets users export their data" and "Users can
 * export their Kinolog data" reduce to {kinolog, lets, export, data} against
 * {export, kinolog, data} and overlap almost completely — which is correct,
 * because they *are* the same fact.
 *
 * Measured against the **shorter** statement, so a short fact that is entirely
 * contained in a longer one counts as the same fact rather than a different
 * one. "Kinolog imports Letterboxd history" is not a separate fact from
 * "Kinolog imports Letterboxd history, including ratings and watch dates" — the
 * longer one is the same claim with detail, and keeping both records the claim
 * twice while making the detailed one look like a competing variant.
 */
export function contentOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w)),
    );

  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export interface Contradiction {
  key: string;
  category: FactCategory;
  left: StoredFact;
  right: StoredFact;
  why: string;
}

/**
 * Facts that disagree, found by comparison rather than by asking.
 *
 * This is code's job and not an agent's. "Do these two statements conflict"
 * sounds like a judgement, but for facts sharing a `(category, key)` it is an
 * exact question with an exact answer: they are the same slot, and they say
 * different things.
 *
 * The reconciler agent is handed *this* list. It explains which side to
 * believe; it does not go looking, because an agent asked to compare everything
 * would be free to find conflicts that are not there and miss ones that are.
 */
export function findContradictions(facts: StoredFact[]): Contradiction[] {
  const bySlot = new Map<string, StoredFact[]>();
  for (const fact of facts) {
    const slot = `${fact.category}:${fact.key}`;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), fact]);
  }

  const out: Contradiction[] = [];
  for (const [slot, group] of bySlot) {
    if (group.length < 2) continue;

    /** One representative per distinct value, by the shared definition above. */
    const distinct: StoredFact[] = [];
    for (const fact of group) {
      if (!distinct.some((seen) => sameValue(seen.value, fact.value))) distinct.push(fact);
    }
    if (distinct.length < 2) continue;

    const [left, right] = distinct;
    out.push({
      key: group[0]!.key,
      category: group[0]!.category,
      left: left!,
      right: right!,
      why: `Two facts occupy ${slot} with different values: "${left!.value}" (${left!.agentId}) and "${right!.value}" (${right!.agentId}).`,
    });
  }
  return out;
}

/**
 * Whether a fact may be said in public.
 *
 * The same rule `canMarket` applies to feature claims, and the same reason: a
 * product fact is *believed by construction* everywhere downstream, so the bar
 * for repeating it outside Halyard is verification, not existence.
 *
 * `unverifiable` deliberately fails this. A mission statement is fine to show
 * an operator and not fine to assert as a checked fact in a post.
 */
export function canStatePublicly(fact: {
  status: FactStatus;
  lastVerifiedAt: Date | null;
}, now: Date = new Date()): boolean {
  return fact.status === 'verified' && !isStale(fact.lastVerifiedAt, now);
}

export { isStale, VERIFICATION_TTL_DAYS };
