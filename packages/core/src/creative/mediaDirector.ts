/**
 * §296. The media director — which *kind* of picture a beat gets.
 *
 * `CREATIVE_SYSTEM.md` lists the decisions that make a piece: treatment, visual
 * language, typography, opening, motion, voice, audio, variants. Every one is
 * deterministic and every one can explain itself. **The source of the image is
 * not on that list**, and it is the decision a viewer notices first — the
 * difference between a screen recording of the product, a photograph of the
 * thing being discussed, and a typographic card with nothing behind it.
 *
 * The slots for it already exist. `PlannedBeat.media` takes real captured
 * footage and §163 is explicit that there is no default and no placeholder;
 * `PlannedBeat.image` carries provenance and licence per beat, because what a
 * picture is allowed to *say* depends on where it came from. `EVIDENTIAL_ROLES`
 * and `canEvidence()` already say which provenance may back which role.
 *
 * So this is the missing row in that table, not a new subsystem: given a beat's
 * role, what the account actually has, and what the channel demands, choose a
 * source and say why.
 *
 * ## The rule that outranks every preference
 *
 * A beat whose job is to show the product doing something may only carry
 * evidence. `generated` is illustration (§268) and can never fill a `demo`,
 * `proof`, `before`, `after` or `change` beat — not because it would look bad,
 * but because it would be a claim about software nobody observed. That check
 * runs before any preference is considered, and a beat that cannot be evidenced
 * falls back to type rather than to a picture that lies.
 */
import { EVIDENTIAL_ROLES, type ImageProvenance } from '../imagery/types.js';

/** Where a beat's visual can come from, best-evidence first. */
export const MEDIA_SOURCES = [
  'app_capture',
  'real_footage',
  'product_still',
  'generated_still',
  'typographic',
] as const;

export type MediaSource = (typeof MEDIA_SOURCES)[number];

/** What each source is, and what it may be used to claim. */
export const MEDIA_SOURCE_INFO: Record<
  MediaSource,
  { label: string; provenance: ImageProvenance | null; motion: boolean; canEvidence: boolean }
> = {
  app_capture: {
    label: 'Screen recording of the product',
    provenance: 'captured',
    motion: true,
    canEvidence: true,
  },
  real_footage: {
    label: 'Filmed footage — hands, process, the real thing',
    provenance: 'operator',
    motion: true,
    canEvidence: true,
  },
  product_still: {
    label: 'A screenshot of the product',
    provenance: 'product',
    motion: false,
    canEvidence: true,
  },
  generated_still: {
    label: 'A generated photograph, as illustration',
    provenance: 'generated',
    motion: false,
    canEvidence: false,
  },
  typographic: {
    label: 'Type on the brand ground, with no picture',
    provenance: null,
    motion: false,
    canEvidence: false,
  },
};

/** What the account has available right now. */
export interface MediaInventory {
  /** Screen recordings of the product, fresh enough to show. */
  appCaptures: number;
  /** Filmed footage somebody actually shot. */
  realFootage: number;
  /** Stills of the product UI. */
  productStills: number;
  /** Whether generation is configured and affordable for this run. */
  canGenerate: boolean;
}

export interface MediaChoice {
  source: MediaSource;
  reason: string;
  /** What was possible but not chosen, best first. */
  alternatives: MediaSource[];
}

/**
 * Preference by beat role.
 *
 * Not a global ranking, because the best source genuinely differs by what the
 * beat is doing. A `demo` wants the product moving; a `hook` wants something
 * beautiful enough to stop a scroll and does not care whether it is evidence;
 * a `proof` beat wants the strongest evidence available and nothing else.
 */
const PREFERENCE: Record<string, MediaSource[]> = {
  hook: ['real_footage', 'generated_still', 'app_capture', 'product_still', 'typographic'],
  demo: ['app_capture', 'product_still', 'real_footage', 'typographic'],
  proof: ['app_capture', 'product_still', 'real_footage', 'typographic'],
  before: ['real_footage', 'app_capture', 'product_still', 'typographic'],
  after: ['real_footage', 'app_capture', 'product_still', 'typographic'],
  change: ['app_capture', 'real_footage', 'product_still', 'typographic'],
  /* Explanatory beats: a picture helps and nothing needs proving. */
  context: ['generated_still', 'real_footage', 'typographic'],
  detail: ['generated_still', 'real_footage', 'typographic'],
  cta: ['typographic', 'generated_still'],
};

const DEFAULT_PREFERENCE: MediaSource[] = [
  'generated_still',
  'real_footage',
  'app_capture',
  'typographic',
];

function available(source: MediaSource, inventory: MediaInventory): boolean {
  switch (source) {
    case 'app_capture':
      return inventory.appCaptures > 0;
    case 'real_footage':
      return inventory.realFootage > 0;
    case 'product_still':
      return inventory.productStills > 0;
    case 'generated_still':
      return inventory.canGenerate;
    case 'typographic':
      /* Always available. It is the floor, not a failure. */
      return true;
  }
}

export interface MediaDecisionInput {
  /** The beat's role, from the creative plan. */
  role: string;
  inventory: MediaInventory;
  /**
   * Whether this channel needs the frame to move.
   *
   * `short_video` and `long_video` do; a carousel slide does not. A still in a
   * moving channel is not disqualified — Ken Burns gives it motion — but a
   * moving source wins the tie, because real motion beats simulated motion.
   */
  needsMotion?: boolean;
  /** An operator's explicit choice, honoured over everything below it. */
  requested?: MediaSource | null;
}

export function chooseMediaSource(input: MediaDecisionInput): MediaChoice {
  const evidential = EVIDENTIAL_ROLES.includes(input.role);

  /*
   * The operator wins, unless the beat is evidential and the pick cannot
   * evidence. That is not a preference being overridden — it is a claim about
   * the product that nobody observed, and no operator choice makes that true.
   */
  if (input.requested) {
    const info = MEDIA_SOURCE_INFO[input.requested];
    const usable = available(input.requested, input.inventory);
    if (evidential && !info.canEvidence) {
      return {
        source: 'typographic',
        reason: `${input.requested} cannot evidence a ${input.role} beat, and an unevidenced product claim is not something an operator choice can authorise.`,
        alternatives: [],
      };
    }
    if (usable) {
      return { source: input.requested, reason: 'Chosen by the operator.', alternatives: [] };
    }
    /* Asked for and not available: fall through, and say so below. */
  }

  const preference = PREFERENCE[input.role] ?? DEFAULT_PREFERENCE;

  const viable = preference.filter((source) => {
    if (!available(source, input.inventory)) return false;
    /*
     * The rule that outranks preference. A generated photograph in a `proof`
     * beat is the fabrication case §268 exists to prevent.
     */
    if (evidential && !MEDIA_SOURCE_INFO[source].canEvidence) return false;
    return true;
  });

  if (viable.length === 0) {
    return {
      source: 'typographic',
      reason: evidential
        ? `Nothing available can evidence a ${input.role} beat, so it is set in type rather than illustrated with something that cannot back it.`
        : 'No usable visual source, so the beat is typographic.',
      alternatives: [],
    };
  }

  /*
   * In a channel where motion is the medium, a moving source wins a tie. Ken
   * Burns makes a still move, and a real recording of the thing happening is
   * still worth more than a photograph pushed slowly across the frame.
   */
  const ordered = input.needsMotion
    ? [...viable].sort((a, b) => Number(MEDIA_SOURCE_INFO[b].motion) - Number(MEDIA_SOURCE_INFO[a].motion))
    : viable;

  const chosen = ordered[0]!;
  const requestedButMissing =
    input.requested && input.requested !== chosen
      ? ` ${input.requested} was requested and is not available.`
      : '';

  return {
    source: chosen,
    reason:
      `${MEDIA_SOURCE_INFO[chosen].label} suits a ${input.role} beat` +
      (evidential ? ', and it can back a claim about the product.' : '.') +
      (input.needsMotion && MEDIA_SOURCE_INFO[chosen].motion
        ? ' It moves, which this channel needs.'
        : '') +
      requestedButMissing,
    alternatives: ordered.slice(1, 4),
  };
}
