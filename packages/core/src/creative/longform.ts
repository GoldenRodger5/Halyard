/**
 * Long-form narrative architecture. §249.
 *
 * ## Why a short cannot simply be made longer
 *
 * Every planner in `treatments.ts` produces four to six beats over twenty to
 * forty seconds. Ask one for eight minutes and the timing engine stretches
 * each beat to a minute, which is not a long-form video — it is a slideshow
 * with very patient slides.
 *
 * A long-form piece is a different *shape*. It has sections rather than
 * beats; each section has its own internal arc; a viewer needs signposting
 * because they cannot see a progress bar filling in three seconds; and
 * retention is won by repeatedly re-earning attention rather than by one hook
 * that carries the whole runtime.
 *
 * So this is a separate architecture that produces sections, and each section
 * expands into beats the existing renderer already knows how to draw. Nothing
 * downstream changes.
 *
 * ## The chapter constraint shapes the structure
 *
 * §223 established what YouTube needs before it shows chapters: at least
 * three, the first at 0:00, each at least ten seconds. A structure that
 * cannot satisfy that is a structure whose chapters silently never appear —
 * so the minimum section count here is not a style preference, it is what
 * makes the chapter list real.
 */
import type { ProductArtifact } from '../connectors/types.js';
import type { CreativeBeat } from './plan.js';

export type LongFormShape =
  /** Teach one thing properly. The workhorse. */
  | 'tutorial'
  /** Walk through the product feature by feature, in use. */
  | 'walkthrough'
  /** Two approaches, tested, with a conclusion. */
  | 'comparison'
  /** A question nobody has answered well, answered. */
  | 'explainer'
  /** One real adaptation, start to finish, with the failures left in. */
  | 'case_study';

export interface LongFormSection {
  id: string;
  /** The chapter title. Real words, never "Section 2". */
  title: string;
  /** What this section is for, in the structure. */
  role:
    | 'cold_open'
    | 'intro'
    | 'setup'
    | 'explanation'
    | 'demonstration'
    | 'example'
    | 'payoff'
    | 'cta'
    | 'outro';
  /** Seconds. Sections are minutes, not beats. */
  targetSeconds: number;
  /** What the narration should cover here. */
  brief: string;
  /** True when this section should carry captured product footage. */
  wantsFootage: boolean;
}

export interface LongFormPlan {
  shape: LongFormShape;
  sections: LongFormSection[];
  totalSeconds: number;
  /** Why this shape, against the alternatives. */
  rationale: string;
}

/** YouTube treats anything over three minutes as long-form. §199. */
export const LONG_FORM_MIN_SECONDS = 240;
/** Beyond this a single-topic piece stops being watched to the end. */
export const LONG_FORM_MAX_SECONDS = 900;

/**
 * The section skeletons.
 *
 * Proportions rather than absolute times, so one structure serves a five and a
 * twelve minute piece. The proportions are the argument: a tutorial spends
 * most of itself demonstrating, an explainer most of itself explaining, and a
 * case study earns its length by showing the thing not working first.
 */
const SHAPES: Record<LongFormShape, Array<Omit<LongFormSection, 'targetSeconds' | 'id'> & { share: number }>> = {
  tutorial: [
    { role: 'cold_open', title: 'The result', share: 0.05, wantsFootage: true,
      brief: 'Show the finished thing first. A tutorial nobody can see the end of is a gamble a viewer will not take.' },
    { role: 'intro', title: 'What you will be able to do', share: 0.07, wantsFootage: false,
      brief: 'The promise, concretely. Not "today we will look at" — the specific capability they leave with.' },
    { role: 'setup', title: 'What you need', share: 0.1, wantsFootage: false,
      brief: 'Ingredients, tools, starting state. Short; nobody came for this, but leaving it out strands them.' },
    { role: 'demonstration', title: 'Doing it', share: 0.45, wantsFootage: true,
      brief: 'The main body, in order, at real pace. This is what they came for and it gets the most time.' },
    { role: 'explanation', title: 'Why it works', share: 0.18, wantsFootage: false,
      brief: 'The mechanism. This is what turns a recipe follower into someone who can improvise.' },
    { role: 'payoff', title: 'The result, properly', share: 0.1, wantsFootage: true,
      brief: 'Back to the finished thing, now that they know what went into it.' },
    { role: 'cta', title: 'What to try next', share: 0.05, wantsFootage: false,
      brief: 'One specific next thing. Not "like and subscribe".' },
  ],
  walkthrough: [
    { role: 'cold_open', title: 'The problem this solves', share: 0.07, wantsFootage: false,
      brief: 'The situation the product exists for, stated as a problem the viewer recognises.' },
    { role: 'intro', title: 'What this is', share: 0.08, wantsFootage: true,
      brief: 'The product, briefly, in use. Not a feature list.' },
    { role: 'demonstration', title: 'Using it on a real recipe', share: 0.4, wantsFootage: true,
      brief: 'One real task, start to finish, including the parts that take a moment.' },
    { role: 'example', title: 'A harder case', share: 0.2, wantsFootage: true,
      brief: 'Where the easy demonstration would not have been convincing.' },
    { role: 'explanation', title: 'What it is actually doing', share: 0.15, wantsFootage: false,
      brief: 'The reasoning behind the output, so the result is trustable rather than magic.' },
    { role: 'cta', title: 'Where to start', share: 0.1, wantsFootage: false,
      brief: 'The single first thing to try.' },
  ],
  comparison: [
    { role: 'cold_open', title: 'The question', share: 0.06, wantsFootage: false,
      brief: 'The disagreement, stated fairly. A comparison that has already decided is not worth watching.' },
    { role: 'setup', title: 'How this was tested', share: 0.12, wantsFootage: false,
      brief: 'Method. Without it the conclusion is an opinion.' },
    { role: 'demonstration', title: 'The first approach', share: 0.25, wantsFootage: true,
      brief: 'Done properly, in good faith.' },
    { role: 'example', title: 'The second approach', share: 0.25, wantsFootage: true,
      brief: 'The same, with the same care.' },
    { role: 'explanation', title: 'What actually separated them', share: 0.2, wantsFootage: false,
      brief: 'The mechanism behind the difference, not just which won.' },
    { role: 'payoff', title: 'Which to use, and when', share: 0.12, wantsFootage: false,
      brief: 'A conclusion with conditions. "It depends" is only useful when the conditions are named.' },
  ],
  explainer: [
    { role: 'cold_open', title: 'The thing everyone gets wrong', share: 0.07, wantsFootage: false,
      brief: 'The misconception, in the words people actually use.' },
    { role: 'setup', title: 'Why it seems right', share: 0.15, wantsFootage: false,
      brief: 'Steelman it. An explainer that mocks the wrong answer teaches nobody who held it.' },
    { role: 'explanation', title: 'What is really happening', share: 0.35, wantsFootage: false,
      brief: 'The actual mechanism, built up rather than asserted.' },
    { role: 'demonstration', title: 'Seeing it', share: 0.25, wantsFootage: true,
      brief: 'The explanation made visible. This is what makes it stick.' },
    { role: 'payoff', title: 'What this changes', share: 0.13, wantsFootage: false,
      brief: 'The practical consequence for what they cook tomorrow.' },
    { role: 'cta', title: 'Try it on your own recipe', share: 0.05, wantsFootage: false,
      brief: 'One concrete invitation.' },
  ],
  case_study: [
    { role: 'cold_open', title: 'What I was trying to make', share: 0.08, wantsFootage: false,
      brief: 'The goal, and why it is hard.' },
    { role: 'setup', title: 'The first attempt', share: 0.2, wantsFootage: true,
      brief: 'Including what went wrong. A case study with no failure is an advert.' },
    { role: 'explanation', title: 'Why it failed', share: 0.2, wantsFootage: false,
      brief: 'The diagnosis. This is the most valuable part and it is usually cut.' },
    { role: 'demonstration', title: 'The fix', share: 0.3, wantsFootage: true,
      brief: 'The change, and it working.' },
    { role: 'payoff', title: 'The difference, side by side', share: 0.15, wantsFootage: true,
      brief: 'Both results together, so the improvement is seen rather than claimed.' },
    { role: 'cta', title: 'The general rule', share: 0.07, wantsFootage: false,
      brief: 'What transfers to other recipes.' },
  ],
};

export interface LongFormInput {
  artifact: ProductArtifact;
  targetSeconds: number;
  /** True when captured product footage exists to fill the demonstration sections. */
  hasFootage: boolean;
  /** Shapes used recently on this channel, most recent first. */
  recentShapes?: string[];
  /** Operator override. */
  pinned?: string | null;
}

/**
 * Which long-form shape this artifact can actually carry.
 *
 * Availability first, then recency — the same rule the short-form directors
 * use. A shape whose sections the artifact cannot fill produces a video with
 * two minutes of nothing in the middle, which is worse than a shorter piece.
 */
export function chooseLongFormShape(input: LongFormInput): {
  shape: LongFormShape;
  reason: string;
  unavailable: Array<{ shape: LongFormShape; because: string }>;
} {
  const highlights = input.artifact.highlights ?? [];
  const swaps = highlights.filter((h: { type?: string }) => h.type === 'swap').length;
  const techniques = highlights.filter((h: { type?: string }) => h.type === 'technique').length;

  const unavailable: Array<{ shape: LongFormShape; because: string }> = [];
  const available: LongFormShape[] = [];

  for (const shape of Object.keys(SHAPES) as LongFormShape[]) {
    if (shape === 'tutorial' && techniques < 3) {
      unavailable.push({ shape, because: `Only ${techniques} techniques; a tutorial needs at least three steps to teach.` });
      continue;
    }
    if (shape === 'comparison' && swaps < 2) {
      unavailable.push({ shape, because: 'A comparison needs two approaches, and the artifact describes one.' });
      continue;
    }
    if (shape === 'case_study' && swaps < 1) {
      unavailable.push({ shape, because: 'A case study needs a change to study.' });
      continue;
    }
    if ((shape === 'walkthrough' || shape === 'case_study') && !input.hasFootage) {
      unavailable.push({ shape, because: 'Needs captured product footage, and none exists.' });
      continue;
    }
    available.push(shape);
  }

  if (input.pinned && available.includes(input.pinned as LongFormShape)) {
    return { shape: input.pinned as LongFormShape, reason: 'Pinned by the operator.', unavailable };
  }

  /*
   * `explainer` has no availability check and never will: it needs a
   * misconception and a mechanism, both of which are words the copywriter
   * supplies rather than assets the artifact must carry. So `available` is
   * never empty, and this is a guard against a future check making it so —
   * not a branch that runs today.
   */
  if (available.length === 0) {
    return {
      shape: 'explainer',
      reason: 'Every other shape was refused; an explainer needs only the argument.',
      unavailable,
    };
  }

  const recent = input.recentShapes ?? [];
  const chosen =
    [...available].sort((a, b) => {
      const ai = recent.indexOf(a);
      const bi = recent.indexOf(b);
      return (bi === -1 ? 99 : bi) - (ai === -1 ? 99 : ai);
    })[0] ?? available[0]!;

  return {
    shape: chosen,
    reason: recent.includes(chosen)
      ? `${chosen} is the least recently used of ${available.length} the artifact supports.`
      : `${chosen} fits the artifact and has not been used recently.`,
    unavailable,
  };
}

/**
 * Expand a shape into timed sections.
 *
 * Every section is at least the chapter minimum, because a section shorter
 * than that produces a chapter YouTube will not show — and a structure whose
 * chapters silently vanish is the §223 failure with extra steps.
 */
export function planLongForm(input: LongFormInput): LongFormPlan {
  const total = Math.max(
    LONG_FORM_MIN_SECONDS,
    Math.min(LONG_FORM_MAX_SECONDS, Math.round(input.targetSeconds)),
  );
  const { shape, reason } = chooseLongFormShape(input);
  const skeleton = SHAPES[shape];

  const sections = skeleton.map((s, i): LongFormSection => ({
    id: `${shape}-${i}`,
    title: s.title,
    role: s.role,
    brief: s.brief,
    /* Floored at 15s: comfortably past the 10s chapter minimum, with room for
       the timing engine to move a boundary without breaking the list. */
    targetSeconds: Math.max(15, Math.round(total * s.share)),
    wantsFootage: s.wantsFootage && input.hasFootage,
  }));

  return {
    shape,
    sections,
    totalSeconds: sections.reduce((sum, s) => sum + s.targetSeconds, 0),
    rationale: reason,
  };
}

/**
 * Sections become beats the existing renderer can draw.
 *
 * One beat per section rather than several: a section is a minute of
 * narration over footage or a held card, and chopping it into short-form
 * beats would reintroduce exactly the stretched-Short rhythm this module
 * exists to avoid.
 */
export function longFormBeats(plan: LongFormPlan, artifact: ProductArtifact): CreativeBeat[] {
  const highlights = (artifact.highlights ?? []) as Array<{
    reason?: string;
    text?: string;
    note?: string;
    sourcePath?: string;
  }>;
  return plan.sections.map((section, i): CreativeBeat => ({
    id: section.id,
    /*
     * Only the opening is a hook; everything else is a step. The renderer
     * draws a `step` with its own title above the body, which is exactly what
     * a chapter wants — and the title is the section's, so the chapter list
     * and the frame say the same words.
     */
    role: section.role === 'cold_open' || section.role === 'intro' ? 'hook' : 'step',
    emphasis: section.role === 'payoff' ? 'hold' : 'normal',
    content: {
      label: section.title,
      text: highlights[i]?.reason ?? highlights[i]?.text ?? highlights[i]?.note ?? section.brief,
    },
    ...(highlights[i]?.sourcePath ? { sourcePath: highlights[i]!.sourcePath! } : {}),
  }));
}

/**
 * The timeline, with the section durations preserved.
 *
 * `beatsToScenes` derives a weight from emphasis, which is right for
 * short-form where the planner expresses intent and the engine allocates. A
 * long-form section has an *intended length* — the demonstration is 45% of
 * the video because that is the argument — so the scene carries it directly.
 */
export function longFormScenes(
  plan: LongFormPlan,
): Array<{ id: string; weight: number; minSeconds: number }> {
  return plan.sections.map((section) => ({
    id: section.id,
    /* Weight in proportion to the intended length, so any slack the engine has
       to distribute lands where the structure already said it should. */
    weight: Math.max(1, Math.round(section.targetSeconds / 15)),
    minSeconds: section.targetSeconds,
  }));
}

/**
 * The short-form creative type a long-form shape corresponds to. §249.
 *
 * `CreativeType` is a closed union that the director's platform affinities,
 * the treatment-repetition rule and the learning features all key on. Adding
 * five long-form members would mean touching every one of those and giving
 * each a motion language, a typography mapping and an opening list — for
 * shapes that are genuinely the *same kind of story told at length*.
 *
 * So a shape maps to the type it already is, and `LongFormPlan.shape` stays on
 * the brief for anything that needs the finer distinction. A walkthrough is a
 * feature demo with room; a case study is a before/after with the failure left
 * in.
 */
export function creativeTypeForShape(shape: LongFormShape): string {
  switch (shape) {
    case 'tutorial': return 'how_to';
    case 'walkthrough': return 'feature_demo';
    case 'comparison': return 'comparison';
    case 'case_study': return 'before_after';
    case 'explainer': return 'myth_fact';
  }
}
