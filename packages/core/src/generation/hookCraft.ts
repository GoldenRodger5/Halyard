/**
 * §443. Ranking hooks when there is nothing measured to rank them by.
 *
 * ## The gap
 *
 * `generateHookVariants` produces eight and `surfaceBestVariants` filters to
 * five, which reads like an audition and is not one yet. `scoreVariant` is:
 *
 *     const match = matchPerformance(...);
 *     if (!match || match.samples < 3) return 0.5;
 *     return match.viewThroughRate;
 *
 * Halyard has published nothing and measured nothing — `halyard_empirical`
 * claims are zero everywhere **by design** (gotcha 9) — so `match` is always
 * undefined and every variant scores exactly 0.5. Eight hooks tie, and the sort
 * keeps them in the order the model happened to emit them. The strongest hook
 * wins only by luck.
 *
 * That 0.5 is the right prior and must not be replaced by an invented number.
 * The mistake would be to fabricate a performance estimate; the fix is to rank
 * on something that is not a performance claim at all.
 *
 * ## What this is instead
 *
 * A **craft** score: stated rules about the first three seconds, applied
 * deterministically. It never claims a hook will retain anybody. It claims that
 * a hook naming a concrete thing in its first three words is better *built*
 * than one that opens on a preamble — which is a judgement about the writing,
 * checkable by reading it, and true independent of any measurement.
 *
 * The distinction matters and is the same one gotcha 9 draws elsewhere: `null`
 * means unmeasured, `0` means measured zero, and a craft score is neither. It
 * is a third thing — an opinion, stated with its reasons, that can be
 * overruled the moment a real observation exists.
 *
 * `findHookProblem` is the other half and is binary: it disqualifies. This
 * grades what survives.
 *
 * ## Where the rules come from
 *
 * The first three seconds drive roughly 80% of completion variance, and 30-50%
 * of viewers leave inside that window — `retentionQC.ts` states both in its own
 * header and acts on neither before the hook is written, which is exactly the
 * shape this codebase keeps finding. These are those findings applied at the
 * only point where they can still change something.
 */
export interface CraftScore {
  /** 0..1. Not a prediction, and never presented as one. */
  score: number;
  /** What was good and what was not, in the order it was weighed. */
  notes: Array<{ rule: string; delta: number; because: string }>;
}

/** Four to seven words reads at a glance. `retentionQC.FIRST_FRAME_WORDS`. */
const IDEAL_WORDS = { min: 4, max: 7 };

/**
 * Openers that now signal low quality rather than curiosity.
 *
 * Every one of these was effective and is now so common that platforms' own
 * creator guidance names them. A hook is a promise; these are the phrasings
 * that promise without saying anything, so the viewer has learned to discount
 * them before reading the rest.
 */
const TIRED_OPENERS =
  /^(did you know|here'?s (why|how|what)|you won'?t believe|this is (why|how)|stop scrolling|wait for it|nobody talks about|the truth about|what if i told you|pov[:\s])/i;

/** A hook asserts. A hedge is the writer declining to. */
const HEDGES = /\b(might|maybe|perhaps|possibly|could be|seems to|arguably|sort of|kind of|probably)\b/i;

/**
 * A question a viewer answers by scrolling.
 *
 * "Do you know what baking soda was sold as?" is answered "no" in a quarter of
 * a second and the thumb keeps moving. "Baking soda was sold as a medicine" is
 * not a question and cannot be dismissed, which is why the statement form wins
 * far more often than the interrogative one.
 */
const CLOSED_QUESTION = /^(do|did|are|is|have|has|can|would|will|should)\s+(you|we|they|it)\b/i;

/**
 * Nouns that name a category instead of a member of it.
 *
 * The distinction that matters is not concrete-versus-abstract as a property of
 * words — "medicine" is abstract and "baking soda was sold as medicine" is a
 * perfectly concrete hook. It is whether the line **refers without naming**.
 * "This ingredient has a surprising history" describes the post; "baking soda
 * was sold as medicine" is the post. The first defers the subject to a payoff
 * the viewer has to stay for, which is a bet a scrolling thumb declines.
 */
const CATEGORY_NOUNS =
  /\b(ingredient|thing|item|product|food|trick|hack|secret|method|technique|mistake|reason|way|tip|fact|step|habit|rule|detail|feature)s?\b/i;

/** "this X", "one X", "a certain X" — a pointer where a name belongs. */
const REFERS_WITHOUT_NAMING = new RegExp(
  `^(this|that|these|those|one|a|an|the|some|every|any)\\s+(\\w+\\s+)?${CATEGORY_NOUNS.source.slice(2, -3)}s?\\b`,
  'i',
);

/** A number, a year, or a proper noun — something a reader could look up. */
function namesSomething(text: string): boolean {
  if (/\d/.test(text)) return true;
  const words = text.trim().split(/\s+/);
  return words.slice(1).some((w) => /^[A-Z][a-z]{2,}/.test(w));
}

/**
 * Whether the line points at its subject rather than naming it.
 *
 * Checked at the start, because that is where it does the damage: a category
 * noun late in a sentence whose subject was already named is fine.
 */
function refersWithoutNaming(text: string): boolean {
  return REFERS_WITHOUT_NAMING.test(text.trim());
}

/**
 * Score the craft of one hook.
 *
 * Starts at a neutral 0.5 — the same prior `scoreVariant` uses, deliberately,
 * so a hook that is neither well nor badly built ranks exactly where an
 * unmeasured hook ranked before this existed. Everything here moves it from
 * there, with a reason attached to every move.
 */
export function scoreHookCraft(textHook: string): CraftScore {
  const notes: CraftScore['notes'] = [];
  const text = textHook.trim();
  let score = 0.5;

  const add = (rule: string, delta: number, because: string) => {
    score += delta;
    notes.push({ rule, delta, because });
  };

  const words = text.split(/\s+/).filter(Boolean);

  if (words.length >= IDEAL_WORDS.min && words.length <= IDEAL_WORDS.max) {
    add('craft.glanceable', 0.12, `${words.length} words reads at a glance.`);
  } else if (words.length > IDEAL_WORDS.max) {
    /* Proportional, because eight words is nearly fine and eighteen is not. */
    const over = words.length - IDEAL_WORDS.max;
    add(
      'craft.too_long_to_glance',
      -Math.min(0.2, over * 0.03),
      `${words.length} words. Frame one is a thumbnail and four to seven is what survives a small preview.`,
    );
  } else {
    add('craft.too_terse', -0.05, `${words.length} words is not enough to carry a promise.`);
  }

  if (namesSomething(text)) {
    add(
      'craft.names_something',
      0.16,
      'Carries a number, a year or a proper noun — something a reader could go and check. The single largest difference between a hook that stops a thumb and one that describes a category.',
    );
  }

  if (refersWithoutNaming(text)) {
    add(
      'craft.refers_without_naming',
      -0.16,
      'Points at its subject instead of naming it. "This ingredient has a surprising history" describes the post; "baking soda was sold as medicine" is the post. The first asks a scrolling viewer to stay for the subject, which is a bet they decline.',
    );
  }

  if (TIRED_OPENERS.test(text)) {
    add(
      'craft.tired_opener',
      -0.18,
      'Opens on a phrasing that now reads as filler. It promises without saying anything, and viewers discount it before reading the rest.',
    );
  }

  if (CLOSED_QUESTION.test(text)) {
    add(
      'craft.scrollable_question',
      -0.1,
      'A question a viewer answers by scrolling past. The statement form of the same idea cannot be dismissed.',
    );
  }

  if (HEDGES.test(text)) {
    add('craft.hedged', -0.08, 'Hedged. A hook asserts; a hedge is the writer declining to.');
  }

  /*
   * The subject in the first three words. The eye lands on the left of the
   * frame and gets a fraction of a second before the thumb decides, so a
   * preamble spends the only part of the hook that is reliably read.
   */
  const opening = words.slice(0, 3).join(' ');
  if (namesSomething(opening)) {
    add('craft.front_loaded', 0.08, 'The specific thing is in the first three words, where the eye lands.');
  } else if (!refersWithoutNaming(text) && !CATEGORY_NOUNS.test(opening)) {
    /*
     * Not as strong as naming a proper noun, and still worth something: an
     * opening that is about *something* beats one that is about a category,
     * even when the something has no capital letter. "Baking soda was" is not
     * a proper noun and it is not "this ingredient" either.
     */
    add('craft.opens_on_subject', 0.06, 'Opens on its subject rather than on a category or a preamble.');
  }

  return {
    score: Number(Math.max(0, Math.min(1, score)).toFixed(3)),
    notes,
  };
}

/**
 * The audition: score a set, keep the order, say why the winner won.
 *
 * Returned rather than logged because the four that lost are the first real
 * signal this system has about its own taste — and because an operator who can
 * read "kept the one naming 1846; the others opened on a category" can disagree
 * with the ranking, which is the only way it ever improves.
 */
export function auditionHooks(
  hooks: Array<{ textHook: string }>,
): Array<{ textHook: string; craft: CraftScore }> {
  return hooks
    .map((hook) => ({ textHook: hook.textHook, craft: scoreHookCraft(hook.textHook) }))
    .sort((a, b) => b.craft.score - a.craft.score);
}
