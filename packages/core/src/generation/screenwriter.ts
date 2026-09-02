/**
 * §336. The screenwriter — the agent that holds the whole piece.
 *
 * Every other content agent answers one question. This one answers the question
 * they are all answering *parts of*: what is this piece, beat by beat, said and
 * seen and heard together.
 *
 * It is the only agent given the whole context at once — the product's brain,
 * the format's shape, the channel's brief, the footage that exists, the marks
 * the product uses — because composition is precisely the thing that cannot be
 * decided one dimension at a time. A motion director asked "what movement suits
 * this beat" in isolation gives a defensible answer to a question that should
 * never have been asked alone.
 *
 * ## What it is not allowed to do
 *
 * It writes **directions**, never assets. It may say a scene sits on a
 * photograph of a loaf; it may not say which file. It may say a mark lands on
 * the swapped ingredient; it may not say at which pixel. Everything it produces
 * is checked by `checkScreenplay` against what the machinery can actually
 * execute, and a direction nothing can carry out is rejected before it reaches
 * a renderer — where it would surface as silence in a place the piece expected
 * emphasis.
 *
 * It also may not invent evidence. A scene calling for product footage where no
 * capture exists is refused by the check, not filled with a synthetic
 * screenshot: §163's rule, arriving one layer earlier where it is cheaper.
 */
import { DRAFT_MODEL, type LlmClient } from './llm.js';
import type { Screenplay } from '../creative/screenplay.js';

export const SCREENWRITER_PROMPT_VERSION = 'screenwriter.v1';

export interface ScreenwriterInput {
  /** What the piece is about, in the words the piece will use. */
  subject: string;
  format: string;
  channel: string;
  /** Seconds the channel allows. */
  seconds: { min: number; max: number };
  /**
   * What the product is, from the Brain.
   *
   * Facts rather than a summary, so the screenplay is grounded in the same
   * evidence chain as everything else — and so a product it has never seen
   * reads as itself rather than as a generic app.
   */
  productFacts: Array<{ category: string; key: string; value: string }>;
  /** The product's own words, so a piece sounds like it. */
  vocabulary?: string[];
  /** Marks the product's motif pack contains (§330). */
  marks: readonly string[];
  /** Regions the frame can locate, in the piece's own words (§331). */
  locatable: readonly string[];
  /**
   * §451. What the piece should actually run, from the platform's band.
   *
   * Distinct from `seconds`, which is the legal range. A screenplay told only
   * "between 12 and 55 seconds" writes to the middle of it; told the target it
   * writes to the target.
   */
  targetSeconds?: number;
  /** §451. What this platform counts, and what follows from it for a writer. */
  primarySignal?: string;
  signalBrief?: readonly string[];
  /** Whether real captured footage exists. */
  hasFootage: boolean;
  /** The written content this piece has to carry, when a format supplied it. */
  slots?: Array<{ key: string; index: number; text: string }>;
}

function systemPrompt(staging: boolean): string {
  /**
   * §340. Two different jobs, and conflating them produced a bad quiz.
   *
   * Given written content, this agent **stages** it: decides what is spoken,
   * what is read, where the emphasis falls, what the score does. Given none, it
   * drafts. The first standalone run had no content and invented three quiz
   * questions with no answers and no sources — a second copywriter with none of
   * the first one's gates.
   */
  const staged = staging
    ? [
        'THE CONTENT IS ALREADY WRITTEN. It was researched, sourced and checked before it',
        'reached you. You are staging it, not rewriting it.',
        '',
        '- Every written line must reach the screen — as something spoken, something read, or both.',
        '- Never invent a question, an answer, a statistic, a price or a claim. If the content does',
        '  not say it, it is not true for this piece.',
        '- You decide the *staging*: which line is spoken and which is read, how long each holds,',
        '  what the ground is, what moves, what is marked, and what the score does.',
        '- You may shorten a line for the screen. You may not change what it says.',
        '- A quiz reveals its answers. If the content has answers, they are scenes.',
        '',
        '- SLOTKEY is how your direction reaches the screen, and it is the most important field',
        '  you write. Each written line below is labelled `key[index]`. Every scene that stages',
        '  one must carry that label back as `slotKey`, written `key:index` — `question[2]`',
        '  becomes `"slotKey":"question:2"`. A scene with the wrong key directs the wrong beat;',
        '  a scene with none is read as a note and directs nothing.',
        '- One scene per written line, in the order they are given. Do not merge two lines into',
        '  one scene and do not split one line across two.',
        '',
      ]
    : [
        'No content has been written for this piece, so you are drafting it. Everything you write',
        'must follow from the product facts you were given. Never invent a statistic, a price or a',
        'claim that is not in them.',
        '',
      ];

  return [
    ...staged,
    'You are the director of a short social video. You write a screenplay: not just what is said,',
    'but what is on screen, what moves, what is marked, and what the music does — together.',
    '',
    'A screenplay is dialogue plus stage directions. The stage directions are the half that is',
    'usually missing and they are why a piece feels composed rather than assembled.',
    '',
    'Rules that are not negotiable:',
    '',
    '- SPOKEN and ON SCREEN are different. A viewer reads four words and hears fourteen. Never',
    '  put the same sentence in both — that is a caption being read aloud, and it is the single',
    '  clearest sign a machine made the video.',
    '',
    '- WEIGHT is a hierarchy. Exactly one or two scenes are `lead`; they are what the piece is',
    '  for. Everything else supports them or is an aside. If every scene is a lead, nothing is.',
    '',
    '- A GESTURE is earned, not decorative. Mark something only when the voice is referring to it',
    '  and a viewer would otherwise have to hunt for it. Two marks at once point at neither.',
    '  Most scenes have none — and **one scene usually should**. It is nearly always the turn or',
    '  the payoff: the single word the whole piece is about. A piece with no mark anywhere is',
    '  type on a card; one drawn mark is the thing that makes it look made by a person.',
    '',
    '- The SCORE is punctuation. It enters once, ducks under the voice, and lifts at the moment',
    '  the piece turns. A bed that does the same thing throughout is a bed nobody notices, which',
    '  is a waste of the one channel that sets mood without spending a word.',
    '',
    '- THE LAST SCENE is where a replay is won or lost. On a platform that ranks on completion,',
    '  bring the ground back to what the first scene showed: an ending that reads as a',
    '  continuation of the opening earns a second watch, and replays are the strongest watch',
    '  signal there is. Say so in `groundSubject` — the same subject, not a new one.',
    '',
    '- MOVEMENT follows meaning. `hold` on a moment that needs reading; `push_in` on a reveal;',
    '  `cut` when the subject changes. Movement applied evenly is motion sickness.',
    '',
    '- GROUND: a photograph is made for each scene that asks for one, so `photograph` is the',
    '  normal answer and `colour` is a deliberate blank — a flat card, used as punctuation',
    '  between pictures. One or two per piece at most. A piece where every scene is `colour`',
    '  is a slide deck, and it will be refused for having nothing on screen that changes.',
    '  Say what the photograph is *of* in `groundSubject`, in the piece\'s own words.',
    '',
    '- The DIRECTION field is prose for a person to read. Write what is happening as you would',
    '  in a shooting script: "The loaf fills the frame. The word BEFORE sits low and small."',
    '',
    '- Use the product\'s own vocabulary. If it calls them "asks" rather than "queries", say asks.',
    '',
    '- Never describe footage that does not exist, and never invent a statistic, a price or a',
    '  claim. You are directing what is real.',
    '',
    '- TIMING is arithmetic and you are expected to do it. A voice covers about 2.6 words per',
    '  second. A fourteen-word line needs about six seconds, so a scene holding four is a scene',
    '  that cuts off mid-sentence. Count the words in each line and give the scene enough time,',
    '  plus a moment after it so the cut does not land on the last syllable.',
    '',
    'Reply with JSON only:',
    '{"title": "...", "bedMood": "calm|warm|bright|playful|tense|driving|confident",',
    ' "scenes": [{"id":"s1","slotKey":"question:0","role":"hook|setup|turn|detail|payoff|close",',
    '   "weight":"lead|support|aside","seconds":3.5,',
    '   "spoken":"what the voice says, or null","onScreen":["what is read"],',
    '   "direction":"what is happening, in prose",',
    '   "ground":"footage|photograph|colour|product_capture","groundSubject":"what it is of, or null",',
    '   "move":"hold|push_in|drift|cut|settle","score":"enter|duck|lift|drop_out|hold",',
    '   "gestures":[{"target":"the thing, in the piece\'s words","atSeconds":1.2,"because":"why now"}]}]}',
  ].join('\n');
}

export interface ScreenwriterResult {
  screenplay: Screenplay;
  costUsd: number;
}

export async function writeScreenplay(
  input: ScreenwriterInput,
  llm: LlmClient,
): Promise<ScreenwriterResult> {
  const facts = input.productFacts
    .slice(0, 30)
    .map((f) => `- [${f.category}] ${f.value}`)
    .join('\n');

  const user = [
    `Product facts:\n${facts}`,
    input.vocabulary?.length ? `\nThe product's own words: ${input.vocabulary.join(', ')}` : '',
    `\nSubject: ${input.subject}`,
    `Format: ${input.format}. Channel: ${input.channel}.`,
    input.targetSeconds
      ? `Length: about ${input.targetSeconds} seconds. The scene seconds must sum to roughly that, and never past ${input.seconds.max}.`
      : `Length: between ${input.seconds.min} and ${input.seconds.max} seconds.`,
    input.signalBrief?.length
      ? `\n${input.channel === 'short_video' ? 'This is going to ' + (input.primarySignal === 'completion' ? 'a platform that ranks on people finishing it' : input.primarySignal === 'saves' ? 'a platform that ranks on people keeping it' : input.primarySignal === 'post_view_engagement' ? 'a platform that ranks on what happens after the watch' : 'this platform') + '.' : ''}\nWhat it rewards, which decides how you compose this:\n${input.signalBrief.map((l) => `- ${l}`).join('\n')}`
      : '',
    `Marks available for gestures: ${input.marks.join(', ')}.`,
    input.locatable.length > 0
      ? `Things the frame can locate, and the only valid gesture targets: ${input.locatable.join(', ')}.`
      : 'Nothing in the frame can be located, so this piece has no gestures.',
    input.hasFootage
      ? 'Real product footage exists and may be used as a ground.'
      : 'No product footage exists. Never call for `product_capture`.',
    input.slots?.length
      ? `\nThe written content this piece must carry, in order:\n${input.slots
          .map((s) => `- ${s.key}[${s.index}]: ${s.text}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const reply = await llm.complete({
    system: systemPrompt((input.slots?.length ?? 0) > 0),
    messages: [{ role: 'user', content: user }],
    maxTokens: 3000,
    /*
     * Warm, not hot. A screenplay is a creative document and the reason this
     * agent exists is that the deterministic version was competent and dull —
     * but every direction it gives is checked, so a wild one costs a retry
     * rather than a bad render.
     */
    temperature: 0.8,
    model: DRAFT_MODEL,
    promptVersion: SCREENWRITER_PROMPT_VERSION,
  });

  /*
   * The format and channel come from the *request*, never from the reply. They
   * are constraints the caller imposed, and a model echoing them back is a
   * model that could echo them back wrong — which would then be printed on the
   * script an operator reviews.
   */
  const screenplay = parseScreenplay(reply.text);
  return {
    screenplay: { ...screenplay, format: input.format, channel: input.channel },
    costUsd: reply.costUsd,
  };
}

/**
 * Read the reply, keeping only what the type allows.
 *
 * Unknown fields are dropped rather than passed through: a screenplay carrying
 * a direction nothing downstream reads is a direction that looks honoured and
 * is not, which is the failure this whole section keeps finding.
 */
export function parseScreenplay(text: string): Screenplay {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The screenwriter returned no JSON.');

  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];

  return {
    title: String(raw.title ?? 'Untitled'),
    format: String(raw.format ?? ''),
    channel: String(raw.channel ?? ''),
    bedMood: String(raw.bedMood ?? 'warm'),
    scenes: scenes.map((entry, i) => {
      const scene = entry as Record<string, unknown>;
      const gestures = Array.isArray(scene.gestures) ? scene.gestures : [];
      return {
        id: String(scene.id ?? `s${i + 1}`),
        /*
         * §441. Normalised to `key:index` and validated only for *shape* here.
         * Whether the key names a line this piece actually has is
         * `checkScreenplay`'s question, because that is where every other
         * "can this direction be executed" check already lives.
         */
        slotKey:
          typeof scene.slotKey === 'string' && /^[a-z_]+:\d+$/.test(scene.slotKey.trim())
            ? scene.slotKey.trim()
            : null,
        role: String(scene.role ?? 'detail') as Screenplay['scenes'][number]['role'],
        weight: (['lead', 'support', 'aside'].includes(String(scene.weight))
          ? String(scene.weight)
          : 'support') as Screenplay['scenes'][number]['weight'],
        seconds: Number(scene.seconds ?? 3),
        spoken: scene.spoken == null ? null : String(scene.spoken),
        onScreen: Array.isArray(scene.onScreen) ? scene.onScreen.map(String) : [],
        direction: String(scene.direction ?? ''),
        ground: (['footage', 'photograph', 'colour', 'product_capture'].includes(
          String(scene.ground),
        )
          ? String(scene.ground)
          : 'colour') as Screenplay['scenes'][number]['ground'],
        groundSubject: scene.groundSubject == null ? null : String(scene.groundSubject),
        move: (['hold', 'push_in', 'drift', 'cut', 'settle'].includes(String(scene.move))
          ? String(scene.move)
          : 'hold') as Screenplay['scenes'][number]['move'],
        score: (['enter', 'duck', 'lift', 'drop_out', 'hold'].includes(String(scene.score))
          ? String(scene.score)
          : 'hold') as Screenplay['scenes'][number]['score'],
        gestures: gestures.map((g) => {
          const gesture = g as Record<string, unknown>;
          return {
            target: String(gesture.target ?? ''),
            atSeconds: Number(gesture.atSeconds ?? 0),
            because: String(gesture.because ?? ''),
          };
        }),
      };
    }),
  };
}
