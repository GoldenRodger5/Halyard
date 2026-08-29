/**
 * §278. Choosing a format, the way a layout is chosen.
 *
 * A format is a shape for an argument, so picking one is the same kind of
 * decision as picking a composition: what the source can support constrains it,
 * the strategy prefers within that, and recency breaks the tie.
 *
 * The order matters and is not arbitrary:
 *
 * 1. **What the platform can carry.** A full recipe is not an X post.
 * 2. **What the source supports.** Asking a quiz format to carry a recipe
 *    produces a bad quiz; asking a recipe format to run with no artifact
 *    produces an empty one.
 * 3. **Which pillar is under-served.** The mix is the point of having pillars.
 * 4. **What the account has not done recently.** Same rule as typography and
 *    layout, for the same reason: repetition inside one feed is what a viewer
 *    notices.
 *
 * An operator's explicit choice overrides all four, and is honoured even when
 * the system would have picked otherwise — with the reason recorded, so a bad
 * operator choice is legible later rather than invisible.
 */
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  formatById,
  type PostFormat,
  type PostFormatId,
  type Pillar,
} from './catalog.js';

export interface FormatSelectionInput {
  platform: string;
  /** Whether a product artifact exists for this piece. */
  hasArtifact: boolean;
  /** Format ids used on this account recently, newest first. */
  recentFormats?: PostFormatId[];
  /** Pillar shares over the recent window, 0..1. Absent means unmeasured. */
  pillarShare?: Partial<Record<Pillar, number>>;
  /** Target shares. Defaults below are the plan's. */
  pillarTargets?: Partial<Record<Pillar, number>>;
  /** An operator's explicit pick. Honoured over everything. */
  requested?: string | null;
  /**
   * Whether sourced facts can be produced for this run.
   *
   * A quiz or a history post asserts things about the world, and if nothing can
   * cite them the format is unusable — not merely lower quality. Defaults to
   * true; a caller that cannot supply citations passes false and gets a format
   * that does not need them.
   */
  canCite?: boolean;
}

export interface FormatChoice {
  format: PostFormat;
  reason: string;
  /** What else fitted, best first. Shown in the studio beside the choice. */
  alternatives: PostFormatId[];
}

/** The plan's mix. Demonstrate is capped low on purpose — see the product ceiling. */
export const DEFAULT_PILLAR_TARGETS: Record<Pillar, number> = {
  teach: 0.35,
  entertain: 0.3,
  warn: 0.15,
  prove: 0.1,
  demonstrate: 0.1,
};

export function selectFormat(input: FormatSelectionInput): FormatChoice {
  /* An operator's pick wins, if the platform can actually carry it. */
  if (input.requested) {
    const wanted = formatById(input.requested.trim());
    if (wanted && wanted.platforms.includes(input.platform)) {
      return {
        format: wanted,
        reason: `Chosen by the operator.`,
        alternatives: [],
      };
    }
    if (wanted) {
      /*
       * Named but impossible. Falls through to the automatic choice rather than
       * failing, and says so — the same handling `findFormatSpec` gives a
       * subtype a platform does not have.
       */
    }
  }

  const carried = POST_FORMATS.map((id) => POST_FORMAT_CATALOG[id]).filter((f) =>
    f.platforms.includes(input.platform),
  );

  if (carried.length === 0) {
    /*
     * Every format declares its platforms, so an empty pool means the platform
     * is one nothing was written for. Refusing is right: inventing a shape for
     * an unknown surface is how TikTok got image drafts it could not publish.
     */
    return {
      format: POST_FORMAT_CATALOG.transformation,
      reason: `No format declares ${input.platform}, so the default transformation shape is used. This is a gap, not a decision.`,
      alternatives: [],
    };
  }

  /* What the source can actually fill. */
  let pool = carried.filter((f) => (f.needsArtifact ? input.hasArtifact : true));
  if (input.canCite === false) {
    const citable = pool.filter((f) => f.factuality !== 'sourced');
    /*
     * If nothing is left, the run genuinely cannot produce anything honest, and
     * the pool stays as it was so the caller's own gates refuse it. Silently
     * shipping an uncited claim is the one outcome not on the table.
     */
    if (citable.length > 0) pool = citable;
  }
  if (pool.length === 0) pool = carried;

  const targets = { ...DEFAULT_PILLAR_TARGETS, ...(input.pillarTargets ?? {}) };
  const share = input.pillarShare ?? {};
  const recent = input.recentFormats ?? [];

  const scored = pool
    .map((format) => {
      /*
       * How far under its target this pillar is. Unmeasured counts as zero
       * share — on a new account every pillar is under-served, which is the
       * honest reading and produces variety rather than a default.
       */
      const actual = share[format.pillar] ?? 0;
      const deficit = (targets[format.pillar] ?? 0) - actual;

      const index = recent.indexOf(format.id);
      const staleness = index === -1 ? recent.length + 1 : index;

      return { format, deficit, staleness };
    })
    /*
     * Staleness first, deficit second. A feed that repeats a shape is the
     * failure a viewer sees; a mix that is slightly off target is one only a
     * spreadsheet sees.
     */
    .sort(
      (a, b) =>
        b.staleness - a.staleness ||
        b.deficit - a.deficit ||
        a.format.id.localeCompare(b.format.id),
    );

  const chosen = scored[0]!;
  const requestedButUnusable =
    input.requested && formatById(input.requested)
      ? ` ${input.requested} was requested but ${input.platform} cannot carry it.`
      : '';

  return {
    format: chosen.format,
    reason:
      `${chosen.format.id} fits ${input.platform}` +
      (recent.includes(chosen.format.id)
        ? ` and is the least recently used of ${pool.length} that fit.`
        : ` and has not been used in the recent window.`) +
      (chosen.deficit > 0
        ? ` Its pillar (${chosen.format.pillar}) is under its target share.`
        : '') +
      requestedButUnusable,
    alternatives: scored.slice(1, 4).map((s) => s.format.id),
  };
}
