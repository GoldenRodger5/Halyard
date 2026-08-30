/**
 * §369. Why this piece is the way it is, assembled from what actually happened.
 *
 * The operator asked for "a last final agent to review it and tell me about it
 * and the framing and stuff and why it made it". The obvious build is a model
 * that reads the finished piece and writes a paragraph about it.
 *
 * That would be the wrong thing, and it would be wrong in this system's most
 * specific way. A model narrating a finished video **infers** the reasons: it
 * sees a photograph of bread and a stacked-bar quiz layout and writes a
 * confident sentence about why those were chosen, and the sentence is a guess.
 * The real reasons already exist. Every director in this codebase returns a
 * `reason` or a `because` — that is the standing rule — and the run records
 * every one of them in `job_events`. The explanation does not need writing. It
 * needs **collecting**.
 *
 * So this is deterministic, and it is strictly a reading of the record. It
 * cannot invent a reason, because it has no way to produce a sentence that was
 * not logged by the thing that made the decision. Where the record is silent it
 * says the record is silent, which is information about the pipeline rather
 * than a gap to paper over — the same rule gotcha 9 applies to metrics.
 *
 * ## Operator choices are separated from Halyard's
 *
 * A wizard override and an automatic decision look identical in the finished
 * video and are completely different facts about it. "It is the rail layout
 * because you asked for the rail layout" is not an explanation of anything
 * Halyard did, and reporting it as one would let a preference launder itself
 * into a rationale.
 *
 * ## What was refused matters as much as what was chosen
 *
 * A piece that took three attempts to pass its citation gate is a different
 * piece from one that passed first time, and the difference is invisible in the
 * output. The refusals are the part of the record an operator cannot get any
 * other way.
 */

/** One event from the run, as it was recorded. */
export interface RecordedEvent {
  message: string;
  detail: Record<string, unknown> | null;
  /** The production stage it came from, or null for the run itself. */
  stage: string | null;
  at: string;
}

export interface ExplainInput {
  events: RecordedEvent[];
  /** What the operator chose in the wizard. Absent keys were left on auto. */
  overrides?: Record<string, string> | null;
  /** Stages the plan decided to skip, with the plan's own reason. */
  skipped?: Array<{ stage: string; because: string }>;
}

/** One line of the account, and where it came from. */
export interface Explanation {
  /** What the decision was about, in the operator's words. */
  about: string;
  /** The decision itself. */
  said: string;
  /** Which stage made it, so it can be traced back to a lane. */
  stage: string | null;
  /**
   * Who decided. `halyard` is a pipeline decision with a recorded reason;
   * `operator` is a wizard override, which is a preference rather than a
   * rationale.
   */
  by: 'halyard' | 'operator';
}

export interface PieceAccount {
  /** The decisions, in the order they were made. */
  decisions: Explanation[];
  /** Everything that was refused along the way, and why. */
  refusals: Explanation[];
  /** Stages that did not run, and the plan's reason. */
  notDone: Array<{ stage: string; because: string }>;
  /**
   * What the record does not say.
   *
   * Named rather than omitted. A decision with no recorded reason is a hole in
   * the pipeline's own accounting, and it is worth an operator seeing that the
   * gap is in the record rather than in the explanation.
   */
  silent: string[];
}

/**
 * Messages whose whole content is a decision, and what to call each one.
 *
 * A map rather than a heuristic. Matching on substrings would attribute
 * correctly today and quietly mislabel the moment somebody reuses a phrase,
 * and a mislabelled decision is a claim about why something was made.
 */
const DECISIONS: Record<string, string> = {
  'post format chosen': 'The shape it took',
  'production planned': 'The stages it ran',
  research: 'Where the facts came from',
  'photographic subject': 'What the picture is of',
  'hero image generated': 'The picture itself',
  'format filled': 'Writing it',
  'music bed selected': 'The music',
  'no music bed selected': 'The music',
  'creative direction': 'The direction it took',
  'creative treatment chosen': 'The treatment',
  'typography chosen': 'The type',
  'opening composition': 'The opening frame',
  'video built from format': 'How it is drawn',
  'deck built from format': 'How it is laid out',
  'carousel layout': 'How it is laid out',
  'platform variants planned': 'How it differs per platform',
  'long-form structure': 'How it is structured',
  drafted: 'The words',
};

/** Messages that record a refusal, and what to call each one. */
const REFUSALS: Record<string, string> = {
  'citations did not verify, asking again': 'A source did not hold up',
  'format not filled, asking again': 'The draft did not fill the format',
  'format could not be filled, piece abandoned': 'The format was never filled',
  'idea not selected': 'An idea was refused',
  'idea proposal rejected': 'An idea was refused',
  'draft rejected by QC': 'A draft did not pass the gates',
  'hook rejected by QC, keeping the copywriter opening': 'The hook did not pass the gates',
  'no creative treatment supported by this artifact': 'No treatment fitted',
  'no post type this platform can carry': 'The platform could not carry it',
  'pin has nowhere to go': 'There was nowhere to put it',
  'no thumbnail text': 'There is no thumbnail',
  'assets stage refused': 'A stage was refused',
  'format composition not enabled for this account': 'The composition was unavailable',
  'no video template available': 'Nothing could carry it',
  'format video is portrait-only': 'The shape did not fit the slot',
  'hero image not generated': 'There is no picture',
  'format write out of time': 'Writing ran out of time',
  'nothing to make: no ideas proposed': 'There was nothing to make',
  'nothing to make: every idea was refused': 'There was nothing to make',
};

/** How an override reads as a sentence. */
const OVERRIDE_LABELS: Record<string, string> = {
  template: 'How it is drawn',
  questionCount: 'How many questions',
  questionKind: 'How the questions are asked',
  difficulty: 'How hard it is',
  voice: 'The voice',
  music: 'The music',
  captions: 'The captions',
  angle: 'The angle',
  shape: 'The shape of the post',
};

/**
 * The reason a decision recorded for itself.
 *
 * Every director returns one of these keys — the standing rule in this
 * codebase — so this reads the record rather than interpreting it.
 */
function reasonOf(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  for (const key of ['because', 'reason', 'why', 'finding', 'summary']) {
    const value = detail[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** A short factual restatement, for a decision that logged data but no prose. */
function factsOf(detail: Record<string, unknown> | null, skip: string[]): string | null {
  if (!detail) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (skip.includes(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${value}`);
    } else if (Array.isArray(value) && value.length > 0) {
      parts.push(`${key}: ${value.length}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

const NOISE = ['contentItemId', 'jobId', 'productId', 'stage', 'id'];

export function explainPiece(input: ExplainInput): PieceAccount {
  const decisions: Explanation[] = [];
  const refusals: Explanation[] = [];
  const silent: string[] = [];

  for (const event of input.events) {
    const decisionAbout = DECISIONS[event.message];
    const refusalAbout = REFUSALS[event.message];
    if (!decisionAbout && !refusalAbout) continue;

    const reason = reasonOf(event.detail);
    const facts = factsOf(event.detail, NOISE);
    const said = reason ?? facts;

    if (!said) {
      /*
       * The decision happened and recorded nothing about itself. Worth naming:
       * it is a hole in the pipeline's accounting rather than in this reading
       * of it, and it is fixed by the director logging a reason.
       */
      silent.push(`"${event.message}" was recorded with no reason.`);
      continue;
    }

    const entry: Explanation = {
      about: decisionAbout ?? refusalAbout!,
      said,
      stage: event.stage,
      by: 'halyard',
    };
    if (decisionAbout) decisions.push(entry);
    else refusals.push(entry);
  }

  /*
   * The operator's own choices, appended and marked. A wizard override and a
   * pipeline decision are indistinguishable in the finished piece and are
   * completely different facts about it — "it is the rail layout because you
   * asked for the rail layout" explains nothing Halyard did.
   */
  for (const [key, value] of Object.entries(input.overrides ?? {})) {
    if (!value || value === 'auto') continue;
    decisions.push({
      about: OVERRIDE_LABELS[key] ?? key,
      said: `You chose ${value}, so nothing was decided here.`,
      stage: null,
      by: 'operator',
    });
  }

  return {
    decisions,
    refusals,
    notDone: input.skipped ?? [],
    silent,
  };
}

/**
 * Whether there is enough recorded to be worth showing.
 *
 * A run that logged nothing produces an empty account, and an empty panel
 * headed "why it was made this way" is worse than no panel — it implies the
 * question was asked and had no answer.
 */
export function hasAccount(account: PieceAccount): boolean {
  return (
    account.decisions.length > 0 ||
    account.refusals.length > 0 ||
    account.notDone.length > 0 ||
    account.silent.length > 0
  );
}
