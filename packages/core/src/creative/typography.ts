/**
 * Typography systems. §226.
 *
 * ## Why one font pairing was the single biggest sameness driver
 *
 * Every video Halyard has made set its headings in Instrument Serif and its
 * body in Inter, because those were the only two families on disk. Motion
 * varied (§220), the register varied (§211), the treatment varied (§203) — and
 * every frame still opened with the same serif, so every video still looked
 * like the same video. Type is the first thing a viewer reads and the last
 * thing that varies; getting it wrong makes every other variation invisible.
 *
 * ## Why systems rather than a font picker
 *
 * A pairing is not two independent choices. A high-contrast display serif
 * wants a quiet grotesque under it and looks wrong under a second display
 * face; a condensed extra-bold wants tight tracking and a lot of size contrast
 * or it reads as shouting. So the unit of choice is a *system* — faces,
 * weights, tracking, case and size relationships that were designed to sit
 * together — and a director picks one system, never a face.
 *
 * ## The constraint that shaped this
 *
 * Five families ship with the render package, all SIL OFL (see
 * `packages/render/assets/fonts/PROVENANCE.md`). Variable faces, so a system
 * can ask for weight 800 without another file. Systems are built from what is
 * actually on disk — a system naming a face that is not bundled renders in a
 * fallback and silently loses its identity, which is the same class of failure
 * as §224's 700-weight serif that loads at 400.
 */

/** The families actually bundled. A system may only name one of these. */
export const AVAILABLE_FAMILIES = [
  'Inter',
  'Instrument Serif',
  'Archivo',
  'Fraunces',
  'Bricolage Grotesque',
  'Sora',
  'DM Sans',
] as const;
export type FontFamily = (typeof AVAILABLE_FAMILIES)[number];

export interface TypeRole {
  family: FontFamily;
  weight: number;
  /** em. Negative tightens; display sizes usually want it. */
  tracking: number;
  /** Multiplier on the computed size for this role. */
  scale: number;
  case: 'none' | 'upper';
  italic?: boolean;
}

export interface TypographySystem {
  id: string;
  /** What it feels like, in the words a director would use. */
  mood: string;
  /** The line the piece opens on, and the line it lands on. */
  display: TypeRole;
  /** Card headings, step labels, before/after values. */
  heading: TypeRole;
  /** Supporting copy: reasons, notes, captions. */
  body: TypeRole;
  /** Eyebrows, counters, kickers. Often the only uppercase in the system. */
  label: TypeRole;
}

/**
 * The systems, each built to be recognisably not the others.
 *
 * Deliberately few. Twenty systems would be as unusable as one — the point is
 * that a viewer scrolling an account sees variety, and a person maintaining it
 * can hold the whole set in their head.
 */
export const TYPOGRAPHY_SYSTEMS: TypographySystem[] = [
  {
    id: 'editorial_serif',
    mood: 'Considered, magazine-like. Lets the words be the picture.',
    display: { family: 'Instrument Serif', weight: 400, tracking: -0.01, scale: 1, case: 'none' },
    heading: { family: 'Instrument Serif', weight: 400, tracking: -0.005, scale: 0.72, case: 'none' },
    body: { family: 'Inter', weight: 400, tracking: 0, scale: 0.34, case: 'none' },
    label: { family: 'Inter', weight: 600, tracking: 0.12, scale: 0.2, case: 'upper' },
    },
  {
    id: 'display_contrast',
    mood: 'High-contrast serif over a quiet grotesque. Premium instructional.',
    display: { family: 'Fraunces', weight: 700, tracking: -0.02, scale: 1.05, case: 'none' },
    heading: { family: 'Fraunces', weight: 600, tracking: -0.015, scale: 0.7, case: 'none' },
    body: { family: 'DM Sans', weight: 500, tracking: 0, scale: 0.33, case: 'none' },
    label: { family: 'DM Sans', weight: 700, tracking: 0.14, scale: 0.19, case: 'upper' },
    },
  {
    id: 'grotesque_punch',
    mood: 'Heavy grotesque, tight and loud. Made to be read at a scroll.',
    display: { family: 'Archivo', weight: 800, tracking: -0.035, scale: 1.12, case: 'none' },
    heading: { family: 'Archivo', weight: 700, tracking: -0.025, scale: 0.74, case: 'none' },
    body: { family: 'Archivo', weight: 500, tracking: -0.005, scale: 0.34, case: 'none' },
    label: { family: 'Archivo', weight: 700, tracking: 0.1, scale: 0.2, case: 'upper' },
    },
  {
    id: 'creator_condensed',
    mood: 'Condensed and fast. The look of somebody editing on their phone.',
    display: { family: 'Bricolage Grotesque', weight: 800, tracking: -0.03, scale: 1.15, case: 'none' },
    heading: { family: 'Bricolage Grotesque', weight: 700, tracking: -0.02, scale: 0.76, case: 'none' },
    body: { family: 'Inter', weight: 600, tracking: -0.005, scale: 0.33, case: 'none' },
    label: { family: 'Bricolage Grotesque', weight: 800, tracking: 0.08, scale: 0.21, case: 'upper' },
    },
  {
    id: 'geometric_clean',
    mood: 'Even, geometric, unfussy. For product and UI, where the picture leads.',
    display: { family: 'Sora', weight: 600, tracking: -0.02, scale: 0.98, case: 'none' },
    heading: { family: 'Sora', weight: 600, tracking: -0.01, scale: 0.68, case: 'none' },
    body: { family: 'Inter', weight: 400, tracking: 0, scale: 0.32, case: 'none' },
    label: { family: 'Sora', weight: 600, tracking: 0.16, scale: 0.18, case: 'upper' },
    },
  {
    id: 'warm_humanist',
    mood: 'Soft and friendly. For food, for anything that should feel like a person.',
    display: { family: 'DM Sans', weight: 700, tracking: -0.025, scale: 1.02, case: 'none' },
    heading: { family: 'DM Sans', weight: 600, tracking: -0.015, scale: 0.7, case: 'none' },
    body: { family: 'DM Sans', weight: 400, tracking: 0, scale: 0.34, case: 'none' },
    label: { family: 'DM Sans', weight: 700, tracking: 0.13, scale: 0.19, case: 'upper' },
    },
];

/**
 * Which systems belong with which visual language. §227.
 *
 * ## Why this is a table rather than a field on each system
 *
 * The first version listed languages on each system, and the coverage was
 * invisible: six of the thirteen languages ended up with exactly *one*
 * compatible system, which means typography never varied for them at all —
 * the appearance of variety with none delivered, which is the same defect the
 * module was written to end.
 *
 * Written this way the coverage is readable, and `typography.test.ts` requires
 * every language to have at least three. That number is not arbitrary: two
 * systems alternate, which a viewer reads as a pattern; three or more rotate.
 *
 * ## The compatibility rule
 *
 * A pairing is here when it is coherent, not to make a number. A high-contrast
 * display serif under a fast-cut creator edit is not a bold choice, it is a
 * mismatch — so `fast_cut_creator` does not list `display_contrast`, and no
 * amount of wanting a third option puts it there. Where a language genuinely
 * has only a few coherent partners, the answer is another *system*, not a
 * looser rule.
 */
export const TYPOGRAPHY_FOR_LANGUAGE: Record<string, string[]> = {
  /* Considered and observational. Anything but the loudest condensed face. */
  documentary: ['editorial_serif', 'warm_humanist', 'display_contrast', 'geometric_clean'],
  /* Confident, hard-cut. Big type of any kind, but nothing soft. */
  editorial_cut: ['editorial_serif', 'display_contrast', 'grotesque_punch'],
  /* Momentum. Needs weight; a light serif cannot keep up with a slide. */
  kinetic: ['grotesque_punch', 'creator_condensed', 'geometric_clean'],
  /* Footage leads, so the type stays out of the way. */
  product_led: ['geometric_clean', 'editorial_serif', 'warm_humanist'],
  /* The line is the picture. Display faces only. */
  typographic: ['display_contrast', 'grotesque_punch', 'editorial_serif'],
  /* Food is warm and slow. The condensed shout is wrong here. */
  editorial_food: ['warm_humanist', 'editorial_serif', 'display_contrast'],
  /* Feed-native and fast. */
  energetic_short: ['grotesque_punch', 'creator_condensed', 'geometric_clean'],
  /* Room to breathe; high contrast earns its place. */
  cinematic: ['editorial_serif', 'display_contrast', 'warm_humanist'],
  /* Light on its feet. Nothing austere. */
  playful: ['warm_humanist', 'creator_condensed', 'grotesque_punch'],
  /* Precise and squared off. */
  clean_modern: ['geometric_clean', 'warm_humanist', 'editorial_serif'],
  /* The loudest. Weight is the whole point. */
  bold_social: ['grotesque_punch', 'creator_condensed', 'display_contrast'],
  /* Taught in steps: legible before it is loud. */
  premium_instructional: ['display_contrast', 'geometric_clean', 'editorial_serif'],
  /* A person on a phone. Nothing that reads as art-directed. */
  fast_cut_creator: ['creator_condensed', 'grotesque_punch', 'warm_humanist'],
};

export function typographyById(id: string): TypographySystem | null {
  return TYPOGRAPHY_SYSTEMS.find((s) => s.id === id) ?? null;
}

export interface TypographyChoice {
  system: TypographySystem;
  /** Why, in one line an operator can disagree with. */
  reason: string;
  /** What else fitted, so the choice is answerable against alternatives. */
  alternatives: string[];
}

/**
 * Choose a typography system.
 *
 * Compatible systems first, then the one used least recently. Recency is the
 * whole mechanism: with six systems and no memory, the same one wins every
 * time and the change is theatre.
 *
 * `recentSystemIds` is most-recent-first, which is the order a
 * `order by created_at desc` gives, so a caller does not have to reverse it.
 */
export function selectTypography(input: {
  visualLanguage: string;
  recentSystemIds?: string[];
  /** Set when the operator pinned one in the Studio. Honoured over everything. */
  pinned?: string | null;
}): TypographyChoice {
  if (input.pinned) {
    const forced = typographyById(input.pinned);
    if (forced) {
      return { system: forced, reason: 'Pinned by the operator.', alternatives: [] };
    }
  }

  const allowed = TYPOGRAPHY_FOR_LANGUAGE[input.visualLanguage] ?? [];
  const compatible = TYPOGRAPHY_SYSTEMS.filter((s) => allowed.includes(s.id));
  /*
   * A language nothing was written for falls back to the whole set rather than
   * to a default system. A default here would mean a new visual language
   * silently inherits the editorial serif and looks like everything else —
   * which is the exact failure this module exists to end.
   */
  const pool = compatible.length > 0 ? compatible : TYPOGRAPHY_SYSTEMS;
  const recent = input.recentSystemIds ?? [];

  const scored = pool
    .map((system) => {
      const index = recent.indexOf(system.id);
      /* Unused beats used; among used, older beats newer. */
      const staleness = index === -1 ? recent.length + 1 : index;
      return { system, staleness };
    })
    .sort((a, b) => b.staleness - a.staleness || a.system.id.localeCompare(b.system.id));

  const chosen = scored[0]!;
  const lastUsed = recent.indexOf(chosen.system.id);
  return {
    system: chosen.system,
    reason:
      compatible.length === 0
        ? `No system declares '${input.visualLanguage}', so the choice is across all of them; ${chosen.system.id} is the least recently used.`
        : lastUsed === -1
          ? `${chosen.system.id} fits ${input.visualLanguage} and has not been used in the recent window.`
          : `${chosen.system.id} fits ${input.visualLanguage} and is the least recently used of ${compatible.length} that fit.`,
    alternatives: scored.slice(1).map((s) => s.system.id),
  };
}

/**
 * The shape the render package wants.
 *
 * `@halyard/render` deliberately does not import `@halyard/core` — gotcha 10:
 * the barrel reaches `node:crypto`, and anything Remotion webpacks that can
 * see it fails at render time with `UnhandledSchemeError`. So the system
 * crosses the boundary as plain data, assembled here.
 */
export function renderTypography(system: TypographySystem): {
  id: string;
  display: TypeRole;
  heading: TypeRole;
  body: TypeRole;
  label: TypeRole;
} {
  return {
    id: system.id,
    display: system.display,
    heading: system.heading,
    body: system.body,
    label: system.label,
  };
}
