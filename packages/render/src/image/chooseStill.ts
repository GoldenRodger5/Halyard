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
  /**
   * Whether this still stands on the brand's cream or on a photograph. §422.
   *
   * `photo` only where the template is sparse enough to carry one — see
   * `PHOTO_CAPABLE`. Recorded with the treatment so the next one can alternate.
   */
  ground: 'card' | 'photo';
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
/**
 * Templates sparse enough to stand on a photograph. §422.
 *
 * Not a preference. Rendered side by side and looked at: a quote — one line and
 * an attribution — over a photograph is the strongest thing this system makes,
 * and the same photograph under `transformation_diff` loses the struck original
 * and the reason line into the crust. Both were legible on cream.
 *
 * The rule is text density, and it is checked before recency because a card
 * whose words cannot be read is not a card. `substitution_ratio` and
 * `scaling_math` carry a label, a pair and an explanation each; they stay on
 * cream, and that is the right answer rather than a limitation.
 */
const PHOTO_CAPABLE = new Set(['chef_note_quote']);

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
  /*
   * §422. History entries are `template/ground`, so staleness is measured on
   * the template half. Comparing whole entries would make `chef_note_quote/card`
   * and `chef_note_quote/photo` two different templates, and the chooser would
   * happily alternate one card's two grounds forever without ever reaching the
   * other three.
   */
  const templateOf = (entry: string) => entry.split('/')[0]!;
  const recentTemplates = recent.map(templateOf);

  const scored = fits
    .map((c, i) => {
      const at = recentTemplates.indexOf(c.templateId);
      return { c, staleness: at === -1 ? Number.POSITIVE_INFINITY : at, offered: i };
    })
    .sort((a, b) => b.staleness - a.staleness || a.offered - b.offered);

  const winner = scored[0]!;
  const unused = winner.staleness === Number.POSITIVE_INFINITY;

  /*
   * §422. Cream or a photograph, which is a second axis of variety and not a
   * replacement for the first. A feed of only photographs is its own monotony,
   * and an information card is genuinely better on cream.
   *
   * Alternated against the same history: if the last time this template ran it
   * stood on a photograph, this one is a card. Only where the template can take
   * one at all.
   */
  const canPhoto = PHOTO_CAPABLE.has(winner.c.templateId);
  const lastWasPhoto = recent[0]?.endsWith('/photo') === true;
  const ground: 'card' | 'photo' = canPhoto && !lastWasPhoto ? 'photo' : 'card';

  return {
    templateId: winner.c.templateId,
    props: winner.c.props!,
    ground,
    reason:
      (unused
        ? `${winner.c.templateId} fits this artifact and has not been used recently.`
        : `${winner.c.templateId} is the least recently used card this artifact can fill.`) +
      (canPhoto
        ? ground === 'photo'
          ? ' Standing it on the photograph; the last one was a card.'
          : ' Keeping it on cream; the last one stood on a photograph.'
        : ' This card carries too much text to stand on a photograph.'),
  };
}
