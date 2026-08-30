/**
 * §314. Turning what a piece *says* into what to photograph.
 *
 * §313 made the hero come from the piece's own opening line instead of an
 * unrelated recipe headline, which was the right source and the wrong shape.
 * `heroPrompt` writes `A photograph of ${subject}`, and the opening line of a
 * history is a sentence — so the prompt read:
 *
 *   "A photograph of Bread was an accident of wild yeast."
 *
 * which is not English and is not a brief. The model is being asked to
 * photograph a proposition.
 *
 * ## Why a model rather than a regex
 *
 * "Bread was an accident of wild yeast" → *bread*. "Oats always contain gluten"
 * → *oats*. "How well do you know gluten?" → **not gluten** — gluten is not a
 * thing you can photograph, and the honest answer is bread, or flour, or dough.
 * That is a judgement about the physical world, which is exactly the kind of
 * perception a model is for and code is not.
 *
 * The governing rule still holds: the model *perceives* a subject, and the code
 * *decides* whether the result is usable — a subject that comes back as a
 * sentence, or empty, or as an abstraction is rejected here rather than sent to
 * an image generator that will happily render a caption.
 */
import { CLASSIFY_MODEL, type LlmClient } from '../generation/llm.js';

export interface SubjectRequest {
  /** What the piece says — its opening line, in its own words. */
  line: string;
  /** What the product is, so a subject suits the account rather than the topic alone. */
  productContext?: string;
}

const SYSTEM = [
  'You choose what to photograph for a short social video.',
  'You are given one line of the video and you reply with the physical subject a photographer would shoot.',
  '',
  'Rules:',
  '- Reply with a noun phrase of two to six words. Never a sentence, never a verb phrase.',
  '- It must be a physical, photographable thing. Not a concept, not a feeling, not a process.',
  '- If the line is about something abstract, choose the concrete thing it is about.',
  '  "How well do you know gluten?" is about bread and dough, not about knowledge.',
  '- No people, no hands, no text, no screens, no logos.',
  '- Do not restate the line. Do not explain. Reply with the phrase alone.',
].join('\n');

/** Words that mean the model answered with an abstraction rather than a thing. */
const ABSTRACT = [
  'knowledge',
  'history',
  'science',
  'idea',
  'concept',
  'process',
  'feeling',
  'question',
  'answer',
  'fact',
  'myth',
  'truth',
  'information',
];

export interface SubjectVerdict {
  subject: string | null;
  reason: string;
}

/**
 * Check a proposed subject before it reaches an image generator.
 *
 * Deterministic, and it runs on the model's answer rather than instead of it —
 * §275's line. A rejected subject falls back to whatever the caller had, which
 * is worse but at least is not a photograph of a sentence.
 */
export function checkSubject(subject: string): SubjectVerdict {
  const trimmed = subject.trim().replace(/^["']|["'.]+$/g, '');
  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 0) return { subject: null, reason: 'The model returned nothing.' };
  if (words.length > 8) {
    return {
      subject: null,
      reason: `"${trimmed}" is ${words.length} words — that is a sentence, and the prompt reads "A photograph of ${trimmed}".`,
    };
  }
  /* A trailing full stop or a question mark means it answered in prose. */
  if (/[.?!]$/.test(subject.trim())) {
    return { subject: null, reason: 'The answer is punctuated as a sentence rather than a phrase.' };
  }
  const lower = trimmed.toLowerCase();
  if (ABSTRACT.some((word) => lower.includes(word))) {
    return {
      subject: null,
      reason: `"${trimmed}" names an abstraction, and an abstraction has no photograph.`,
    };
  }

  return { subject: trimmed, reason: `"${trimmed}" is a thing a photographer could point a camera at.` };
}

/**
 * Ask what to photograph, and refuse an answer that cannot be photographed.
 *
 * Returns null rather than throwing: a piece without a hero is the status quo
 * and still publishable, and a bad subject is worse than none — it produces a
 * confident photograph of the wrong thing, which is the failure that reads as
 * stock imagery.
 */
export async function photographicSubject(
  request: SubjectRequest,
  llm: LlmClient,
): Promise<SubjectVerdict> {
  const user = request.productContext
    ? `Product: ${request.productContext}\nLine: ${request.line}`
    : `Line: ${request.line}`;

  const reply = await llm.complete({
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    /*
     * Short, because anything long is prose and `checkSubject` will reject it.
     * On the classify model: naming the physical thing a line is about is a
     * one-word judgement, not writing, and it runs once per piece.
     */
    maxTokens: 24,
    temperature: 0.4,
    model: CLASSIFY_MODEL,
    promptVersion: 'photographic-subject@1',
  });

  return checkSubject(reply.text);
}
