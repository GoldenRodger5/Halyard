/**
 * §395. Which still to draw, when several could carry the artifact.
 *
 * Five templates are registered and the generator named one:
 *
 * ```ts
 * if (props && enabledTemplates.includes('transformation_diff_4x5')) { … }
 * ```
 *
 * So every product-grounded still was the same card. `chefNoteProps`,
 * `substitutionRatioProps` and `scalingMathProps` were all written, all
 * exported, and reachable only by an operator picking a template by hand —
 * *declared, built, never called*, which is this codebase's recurring shape and
 * the reason `videoTemplateCoverage.test.ts` exists for compositions.
 *
 * ## Fit, then recency
 *
 * The same order as `chooseLayout` (§293) and `chooseQuizTemplate` (§302),
 * because it is the right order. **Fit is not a preference here** — a template
 * whose props cannot be built renders a card with empty regions rather than
 * failing, which is exactly how §—'s `substitution_ratio` shipped a heading
 * above nothing at all. A still that cannot be filled is never offered.
 *
 * Recency then chooses among what fits, so an account posting stills three
 * times a week does not send the same card every time.
 */

/** A candidate: a template, and the props for it — or null if it cannot be built. */
export interface StillCandidate {
  templateId: string;
  /** Null when the artifact cannot fill this template. Never guessed. */
  props: Record<string, unknown> | null;
}

export interface StillChoice {
  templateId: string;
  props: Record<string, unknown>;
  /** Why this one, in the operator's words. */
  reason: string;
}

/**
 * Choose a still.
 *
 * Returns null when nothing fits, which is a real answer: an artifact with no
 * before-and-after, no quotable line, no ratio and no quantities has no card to
 * make, and inventing one would put an empty template in a feed.
 */
export function chooseStill(input: {
  candidates: StillCandidate[];
  /** Templates the account has switched on. A template off is not a candidate. */
  enabled: string[];
  /** What recent stills drew, most recent first. */
  recent?: string[];
}): StillChoice | null {
  const recent = input.recent ?? [];

  const fits = input.candidates.filter(
    (c) => c.props !== null && input.enabled.includes(c.templateId),
  );
  if (fits.length === 0) return null;

  /*
   * Staleness dominates. A template that has never been used beats one used
   * last week, and the order among equals is the order the candidates were
   * offered — which makes the choice a pure function of its inputs, so a
   * re-render produces the same card.
   */
  const scored = fits
    .map((c, i) => {
      const at = recent.indexOf(c.templateId);
      return { c, staleness: at === -1 ? Number.POSITIVE_INFINITY : at, offered: i };
    })
    .sort((a, b) => b.staleness - a.staleness || a.offered - b.offered);

  const winner = scored[0]!;
  const unused = winner.staleness === Number.POSITIVE_INFINITY;

  return {
    templateId: winner.c.templateId,
    props: winner.c.props!,
    reason: unused
      ? `${winner.c.templateId} fits this artifact and has not been used recently.`
      : `${winner.c.templateId} is the least recently used card this artifact can fill.`,
  };
}
