/**
 * §474. Reading the piece before it is made.
 *
 * ## Why this exists at all
 *
 * `critic.ts` is the craft critic and it looks at **frames** — which means it
 * runs in `review_media`, after a render that costs minutes of compute, several
 * image generations and a voiceover. That is the right place for the questions
 * that need pixels: is the type monotonous, is something under the platform's
 * buttons, does the photograph match the words.
 *
 * It is the wrong place for everything else, and everything else is most of it.
 * Of the defects found by reading real output this session —
 *
 *   a myth that was true · a concession that conceded nothing · a hook that
 *   answered its own question · "eggplant" and "aubergines" four seconds apart ·
 *   a caption that ended on "Wikipedia, Sourdough" · not one caption that asked
 *   for anything
 *
 * — **every single one was visible in the text.** None needed a frame. All of
 * them were found after a render because that is where the only critic lived.
 *
 * Text is free to judge. So this runs on the written piece, before anything is
 * drawn, and the frame critic keeps the questions that genuinely need frames.
 *
 * ## What it is not
 *
 * Not a second copy gate. `slopFilter` owns the rules that can be *stated* —
 * banned phrases, punctuation, density, the invitation. This owns the judgements
 * that cannot: whether a hook opens a gap or closes it, whether a concession
 * concedes, whether the piece is worth a stranger's thirty seconds.
 *
 * And like the frame critic, it may never pass anything. Silence means it found
 * nothing to say, which is not the same as approval — *agents perceive, code
 * decides*, and a model marking its own work is the fabrication case wearing a
 * nicer hat.
 */
import { CRITIC_PERSONAS, type CriticPersona } from './critic.js';

/** One written piece, as the critic reads it. */
export interface TextPiece {
  format: string;
  platform: string;
  /** The slots in order, as `key` and text — the piece itself. */
  lines: Array<{ key: string; text: string }>;
  /** The caption that will sit under it. */
  caption: string;
}

export interface TextCriticFinding {
  rule: string;
  severity: 'warning';
  persona: CriticPersona;
  /** One sentence, naming the line. */
  message: string;
  /** Which slot it is about, so a rewrite knows what to replace. */
  slot: string | null;
}

export interface TextCriticVerdict {
  findings: TextCriticFinding[];
  /** How many lines it actually read. Zero examined is never a pass. */
  examined: number;
  summary: string;
}

/**
 * The questions, by who asks them.
 *
 * Every one is a judgement no rule can state. Anything that *can* be stated as
 * a rule belongs in `slopFilter`, where it runs every time and costs nothing.
 */
export const TEXT_CRITIC_QUESTIONS: Array<{
  rule: string;
  persona: CriticPersona;
  question: string;
}> = [
  {
    rule: 'text.hook_closes_the_gap',
    persona: 'scroller',
    question:
      'Does the opening line make you want the next one, or does it already contain the answer? A mechanism stated up front leaves nothing to stay for. Quote the line.',
  },
  {
    rule: 'text.nothing_at_stake',
    persona: 'scroller',
    question:
      'Is there any point in this piece where a viewer learns something they could not have guessed? If the whole thing is one obvious idea restated, say so.',
  },
  {
    rule: 'text.reads_as_written_by_a_machine',
    persona: 'scroller',
    question:
      'Does any line read as assembled rather than said — a sentence no person would speak aloud? Quote it.',
  },
  {
    rule: 'text.overstated',
    persona: 'cook',
    question:
      'Is anything stated more strongly than it deserves — an always, a never, a mechanism flattened into something false? Quote the line.',
  },
  {
    rule: 'text.concession_concedes_nothing',
    persona: 'cook',
    question:
      'Where the piece concedes a point, does it concede to the actual belief, or to a true fact standing near it? Only for formats that concede.',
  },
  {
    rule: 'text.not_a_misconception',
    persona: 'cook',
    question:
      'Where the piece calls something a myth, is that thing actually wrong? Calling correct advice a myth and then agreeing with it is a technicality dressed as a correction. Only for myth formats.',
  },
  {
    rule: 'text.payoff_is_not_a_payoff',
    persona: 'art_director',
    question:
      'Does the piece land somewhere, or does it stop? Name the line that was supposed to be the payoff if it does not carry one.',
  },
];

export function textCriticSystemPrompt(): string {
  const byPersona = (Object.keys(CRITIC_PERSONAS) as CriticPersona[])
    .map((key) => {
      const questions = TEXT_CRITIC_QUESTIONS.filter((q) => q.persona === key);
      if (questions.length === 0) return '';
      const persona = CRITIC_PERSONAS[key];
      return `## As ${persona.name}\n${persona.stance}\n\n${questions
        .map((q) => `- [${q.rule}] ${q.question}`)
        .join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `You are reading one short social video before it is made — the words only, in order,
with the caption that will sit under it. Read it three times, as three different people.
They disagree, and that is the point: do not average them.

You are NOT checking spelling, punctuation, banned phrases or hashtag counts. Rules that
can be stated are enforced elsewhere and run every time; you are here for the judgements
that cannot be.

${byPersona}

Rules:
- Quote the line you mean. A finding without one is discarded.
- Say nothing you are unsure about. A critic that objects to every piece is one nobody
  reads, which is worse than a critic that misses something.
- Never praise. Silence means you found nothing worth saying.
- One finding per rule at most.

Reply with JSON only:
{"findings":[{"rule":"text.overstated","slot":"turn","message":"one sentence quoting the line"}]}`;
}

/**
 * Read a model reply, discarding anything unusable.
 *
 * Fails closed the way the frame critic does: a malformed reply yields no
 * findings, never an invented one. A quiet critic is a much smaller problem
 * than one that makes something up.
 */
export function parseTextCriticReply(raw: unknown, piece: TextPiece): TextCriticVerdict {
  const known = new Map(TEXT_CRITIC_QUESTIONS.map((q) => [q.rule, q.persona]));
  const slots = new Set(piece.lines.map((l) => l.key));
  const parsed = raw as { findings?: unknown } | null;
  const list = Array.isArray(parsed?.findings) ? parsed!.findings : [];

  const findings: TextCriticFinding[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    const item = entry as { rule?: unknown; message?: unknown; slot?: unknown };
    if (typeof item.rule !== 'string') continue;
    const persona = known.get(item.rule);
    if (!persona) continue;
    if (typeof item.message !== 'string' || item.message.trim().length < 12) continue;
    /* One finding per rule: a critic repeating itself reads as noise. */
    if (seen.has(item.rule)) continue;
    seen.add(item.rule);

    /*
     * A slot it does not have is dropped rather than kept as null: the point of
     * naming a slot is that a rewrite knows what to replace, and a wrong name
     * sends the rewrite at the wrong line.
     */
    const slot =
      typeof item.slot === 'string' && slots.has(item.slot) ? item.slot : null;

    findings.push({
      rule: item.rule,
      severity: 'warning',
      persona,
      message: item.message.trim(),
      slot,
    });
  }

  return {
    findings,
    examined: piece.lines.length,
    summary:
      piece.lines.length === 0
        ? 'The critic was given no lines to read.'
        : findings.length === 0
          ? `Read ${piece.lines.length} lines and found nothing worth saying.`
          : findings.map((f) => `${f.persona}: ${f.message}`).join(' '),
  };
}

/** The piece as the critic sees it: the words, in order, and the caption. */
export function renderTextPiece(piece: TextPiece): string {
  return [
    `Format: ${piece.format}. Going to: ${piece.platform}.`,
    '',
    'On screen, in order:',
    ...piece.lines.map((l) => `- [${l.key}] ${l.text}`),
    '',
    `Caption underneath:\n${piece.caption}`,
  ].join('\n');
}
