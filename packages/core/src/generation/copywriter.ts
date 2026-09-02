/**
 * Copy production. v1 §4.3.
 *
 * One model call **per platform**. Never one call producing every platform —
 * cross-posting is the failure mode this design exists to prevent. Each call
 * receives the brand voice, the do/don't rules, the forbidden claims, the
 * platform constraints, the artifact, and three to five approved past posts as
 * few-shot examples.
 *
 * The copywriter returns claims alongside the copy so Gate 2 can verify them.
 * A draft that fails a gate is regenerated with the violations fed back, up to a
 * ceiling — blind retry is a wasted call.
 */
import { PLATFORM_STRATEGIES } from '../platform/strategy.js';
import { repairCopy, type CopyRepair } from './repairCopy.js';
import { runAllGates, type QCResults } from '../qc/index.js';
import { slopFilter, type SlopPlatform } from '../qc/slopFilter.js';
import type { Claim } from '../qc/claimVerifier.js';
import type { ProductArtifact } from '../connectors/types.js';
import { DRAFT_MODEL, extractJson, type LlmClient } from './llm.js';
import { repairSpoken } from './spokenRepair.js';
import { HARD_RULES_BLOCK, buildCopywriterPrompt, type CopywriterContext } from './prompts.js';

export interface DraftRequest {
  platform: SlopPlatform;
  format: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  category: string;
  persona: 'founder' | 'brand';
  idea: { title: string; angle: string };
  artifact?: ProductArtifact | null;
  /**
   * §291. Whether this piece's claims are about the artifact.
   *
   * True for a product demonstration, false for a format grounded elsewhere —
   * a quiz, a history, a myth correction. Defaults to true so an existing
   * caller keeps the behaviour it had.
   */
  verifyClaimsAgainstArtifact?: boolean;
  /** §419. The shape this caption should take. Passed through to the prompt. */
  captionShape?: { shape: string; brief: string } | null;
  voice: {
    displayName: string;
    description: string;
    doRules: string[];
    dontRules: string[];
    examples: Array<{ platform?: string; text: string; why_good?: string }>;
    antiExamples?: Array<{ text: string; why_bad?: string }>;
  };
  productBrief: string;
  contentRules: { forbiddenClaims?: string[]; bannedPhrases?: string[] };
  /** v2 I.4 — sample from proven hooks rather than inventing openings. */
  hooks?: string[];
  /** v2 I.3 — fill a slot in a series rather than inventing a new shape. */
  series?: { name: string; nextSequence: number } | null;
  /**
   * §370. The piece this caption sits under, once it exists.
   *
   * The caption used to be written two hundred and fifty lines before the piece
   * itself, from an idea title and an angle, so a quiz caption was written by a
   * copywriter who had never seen the questions. It read as a plausible
   * description of *a* quiz rather than an introduction to this one.
   *
   * Passed as the filled slots in the format's own order. Absent for a
   * transformation, which genuinely is about the artifact and has no slots.
   */
  piece?: Array<{ key: string; text: string }> | null;
  /** Operator note from the Regenerate dialog. Blind retry is a wasted call. */
  regenNote?: string;
  maxAttempts?: number;
}

export interface Draft {
  body: string;
  /**
   * What the writer had left to say after the caption budget. §215.
   *
   * Posted as a first comment or a reply, never discarded. The copy this system
   * writes is genuinely good and the budget is about *where* it goes, not about
   * having less of it — dropping the remainder would make the constraint a loss
   * rather than a placement.
   */
  overflow?: string;
  title?: string;
  altText?: string;
  hashtags: string[];
  claims: Claim[];
  /** Which hook pattern the model reports using, for the hooks table. */
  hookPattern?: string;
  qc: QCResults;
  attempts: number;
  generationMeta: {
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    attempts: number;
  };
  /**
   * §449. What was fixed mechanically before the gate saw it.
   *
   * Reported rather than applied silently. An operator reading a caption that
   * differs from what the model wrote should be able to find out why in one
   * place, and "we quietly rewrite your copywriter's punctuation" is exactly
   * the kind of thing that should be said out loud.
   */
  repairs: CopyRepair[];
}

/**
 * §263. A spoken script that is really a JSON envelope.
 *
 * `writeVoScript` asks for prose and took `response.text` verbatim, while
 * `writeDraft` next to it runs `extractJson`. When the model wrapped its answer
 * anyway — `{"script":"Phone locked mid-recipe? ..."}` — the whole envelope
 * became the script. It was then synthesised, burned into the captions, and
 * passed every gate, because the gates read a script for slop and claims and
 * none of them asks whether it is a script at all. A production render carries
 * `{"script":"` across the opening frame, which is the first thing a viewer
 * sees.
 *
 * Same family as §252: a structure travelling through layers that all type it
 * as `string`.
 *
 * Returns the prose, or null when the text is JSON-shaped and no spoken field
 * can be recovered from it — null makes the caller retry with feedback and
 * ultimately refuse, which is right, because a script nobody can read aloud is
 * not a script.
 */
export function unwrapSpokenScript(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const looksStructured = text.startsWith('{') || text.startsWith('[');
  if (!looksStructured) {
    /* Prose, as asked for. Reject an envelope that starts mid-line, though. */
    return text.includes('{"script"') || text.includes('{"text"') ? null : text;
  }

  /* The fields a scriptwriter's envelope actually uses, in order of intent. */
  const FIELDS = ['script', 'voiceover', 'vo_script', 'text', 'body'];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'string') return parsed.trim() || null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const field of FIELDS) {
        const value = (parsed as Record<string, unknown>)[field];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
  } catch {
    /*
     * Truncated JSON is the common case: `maxTokens` cuts the envelope before
     * its closing quote, so the text is unparseable *and* structured. The
     * opening field is still recoverable, and recovering it is better than
     * discarding a script that is otherwise complete.
     */
    const m = text.match(/"(?:script|voiceover|vo_script|text|body)"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (m?.[1]) {
      const unescaped = m[1]
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
      if (unescaped) return unescaped;
    }
  }
  return null;
}

export class DraftRejectedError extends Error {
  constructor(
    message: string,
    public readonly lastQc: QCResults,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'DraftRejectedError';
  }
}

interface RawDraft {
  /** §215. Whatever did not fit the caption budget. */
  overflow?: string;
  body?: string;
  title?: string;
  alt_text?: string;
  hashtags?: string[];
  claims?: Array<{ text?: string; source?: string }>;
  hook_pattern?: string;
}

/**
 * What is wrong with the shape of a parsed draft, or null when nothing is.
 *
 * Deliberately narrow: it checks only the fields this function goes on to call
 * methods on, because those are the ones that turn a bad answer into a crash.
 * Everything else is already read defensively with a default, and a stricter
 * schema here would reject drafts that are merely sparse.
 */
export function describeShapeProblem(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return 'the top level must be a JSON object';
  }
  const draft = raw as Record<string, unknown>;
  if (draft.body !== undefined && typeof draft.body !== 'string') return '`body` must be a string';
  if (draft.hashtags !== undefined && !Array.isArray(draft.hashtags)) {
    return '`hashtags` must be an array of strings';
  }
  if (draft.claims !== undefined && !Array.isArray(draft.claims)) {
    return '`claims` must be an array of objects';
  }
  return null;
}

export async function writeDraft(request: DraftRequest, llm: LlmClient): Promise<Draft> {
  const maxAttempts = request.maxAttempts ?? 3;
  const context: CopywriterContext = {
    ...request,
    hooks: request.hooks ?? [],
    /*
     * §466. What this platform counts, so the caption ends on something that
     * earns it. Resolved here rather than passed in by every caller, because
     * the platform is already on the request and the mapping is a constant.
     */
    ...(PLATFORM_STRATEGIES[request.platform as keyof typeof PLATFORM_STRATEGIES]
      ? {
          signalBrief:
            PLATFORM_STRATEGIES[request.platform as keyof typeof PLATFORM_STRATEGIES]!.signalBrief,
        }
      : {}),
  };

  let lastQc: QCResults | null = null;
  let feedback = request.regenNote ?? '';
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let model: string | undefined;
  const { system, user, version } = buildCopywriterPrompt(context);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await llm.complete({
      system,
      messages: [
        { role: 'user', content: feedback ? `${user}\n\n## Revision notes\n${feedback}` : user },
      ],
      model: DRAFT_MODEL,
      maxTokens: 1500,
      promptVersion: version,
    });

    totalInput += response.inputTokens;
    totalOutput += response.outputTokens;
    totalCost += response.costUsd;
    model = response.model;

    let raw: RawDraft;
    try {
      raw = extractJson<RawDraft>(response.text);
    } catch (err) {
      feedback = `Your last reply was not valid JSON (${(err as Error).message}). Reply with the JSON object only.`;
      continue;
    }

    /**
     * The shape, checked rather than assumed.
     *
     * `extractJson<RawDraft>` is an unchecked cast — it proves the response is
     * *JSON*, not that it is this JSON. A model that answers
     * `{"hashtags": "glutenfree"}` parses cleanly and then throws
     * `raw.hashtags.map is not a function`, outside the `try` above, taking the
     * whole generate job with it.
     *
     * The retry loop already knows how to handle a badly-formed reply: tell the
     * model what was wrong and ask again. A wrong *shape* is the same class of
     * problem as invalid JSON and now takes the same path, rather than being
     * the one malformed answer that crashes instead of converging.
     */
    const shapeError = describeShapeProblem(raw);
    if (shapeError) {
      feedback = `Your last reply was JSON but the wrong shape: ${shapeError}. Reply with the JSON object only, using exactly the fields described.`;
      continue;
    }

    /**
     * §449. Fix what a regex can fix, before spending an attempt arguing.
     *
     * Measured live: a `history` piece filled all five slots with zero
     * warnings — researched, sourced, every citation fetched — and was thrown
     * away because its caption failed the copy gate three times on one
     * violation. The content was fine and the wrapper was not.
     *
     * `repairDraft` has done exactly this for format slots since §290. The
     * caption path — the one that actually loses whole pieces — never got it.
     * Only substitutions that cannot change what a sentence says; a banned
     * phrase or a hype comparative is a judgement about writing and stays with
     * the model, which is what the retry loop is for.
     */
    const repaired = repairCopy(
      (raw.body ?? '').trim(),
      (raw.hashtags ?? []).map((h) => String(h).replace(/^#/, '')),
    );
    const body = repaired.body;
    const hashtags = repaired.hashtags;
    const claims: Claim[] = (raw.claims ?? [])
      .filter((c) => c && typeof c === 'object' && c.text)
      .map((c) => ({ text: c.text!, source: c.source ?? '' }));

    const qc = runAllGates({
      copy: {
        body,
        platform: request.platform,
        hashtags,
        extraBannedPhrases: request.contentRules.bannedPhrases,
        forbiddenClaims: request.contentRules.forbiddenClaims,
        longForm: request.platform === 'youtube',
        /*
         * §450. What the viewer will already be reading, so the gate can tell a
         * caption from a transcript. Absent for a text post, where the caption
         * *is* the piece and there is no second channel to waste.
         */
        ...(request.piece?.length ? { onScreen: request.piece.map((s) => s.text) } : {}),
      },
      /*
       * §291. Claims are checked against the artifact only when the piece is
       * *about* the artifact.
       *
       * A quiz about the history of gluten is grounded in sources, not in a
       * recipe, and verifying its caption against a recipe artifact is a
       * category error — it fails claims the artifact was never going to
       * contain. That is exactly how the first production quiz died:
       * "claims: 4/5 verified against artifact", three times, on a post that
       * was not making a claim about the recipe at all.
       *
       * The artifact still grounds the *writing* either way; this governs only
       * whether its claims are checked against it.
       */
      ...(request.artifact && request.verifyClaimsAgainstArtifact !== false
        ? { claims: { claims, artifact: request.artifact.raw } }
        : {}),
    });

    lastQc = qc;

    if (qc.passed) {
      return {
        body,
        ...(typeof raw.overflow === 'string' && raw.overflow.trim()
          ? { overflow: raw.overflow.trim() }
          : {}),
        title: raw.title,
        altText: raw.alt_text,
        hashtags,
        claims,
        hookPattern: raw.hook_pattern,
        qc,
        attempts: attempt,
        repairs: repaired.repairs,
        generationMeta: {
          // What actually served it, not what was asked for. With a fallback
          // provider those differ — a request for DRAFT_MODEL is served by
          // gpt-5.4-mini — and "which model wrote this" is the first question
          // asked when output quality moves.
          model: model ?? DRAFT_MODEL,
          promptVersion: version,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          costUsd: Number(totalCost.toFixed(6)),
          attempts: attempt,
        },
      };
    }

    feedback = buildFeedback(qc);
  }

  throw new DraftRejectedError(
    `Copy failed QC after ${maxAttempts} attempts. Nothing was queued.`,
    lastQc!,
    maxAttempts,
  );
}

/**
 * Turn gate failures into instructions the model can act on. Naming the rule
 * and the fix converges far faster than "try again".
 */
export function buildFeedback(qc: QCResults): string {
  const lines: string[] = ['Your last draft failed automated checks. Fix every item below.'];

  for (const gate of qc.gates) {
    if (gate.status !== 'failed') continue;
    if (gate.gate === 'copy') {
      const detail = gate.detail as ReturnType<typeof slopFilter>;
      for (const violation of detail.errors) {
        lines.push(
          `- [${violation.rule}] ${violation.message}${violation.fix ? ` ${violation.fix}` : ''}${
            violation.excerpt ? ` (you wrote: "${violation.excerpt}")` : ''
          }`,
        );
      }
    }
    if (gate.gate === 'claims') {
      const detail = gate.detail as { results: Array<{ claim: Claim; verdict: string; message: string }> };
      for (const result of detail.results) {
        if (result.verdict === 'verified' || result.verdict === 'needs_review') continue;
        lines.push(`- [claim] "${result.claim.text}" → ${result.message}`);
      }
    }
  }

  lines.push('Reply with the corrected JSON object only.');
  return lines.join('\n');
}

/**
 * v1 §4.3 step 6 — the VO script is a separate prompt, written for the ear:
 * short sentences, no parentheticals, numbers spoken.
 */
/**
 * The voiceover script, gated the same way the post copy is.
 *
 * ## The half nobody checked
 *
 * `writeDraft` runs the slop filter and the claim verifier over the post body,
 * on a retry loop, and refuses to return copy that fails. `writeVoScript` ran
 * neither. It called the model once and returned whatever came back.
 *
 * So the caption beside a video was held to the standard, and **the words the
 * viewer actually hears were not** — not for banned phrasing, not for
 * unverifiable claims, not against the product's own forbidden-claims list. A
 * script could state a health benefit nobody can support, and the only gate
 * downstream measured whether it was *pronounced* correctly.
 *
 * The spoken rules are their own thing: a hashtag, a URL, a fraction or a
 * parenthetical is fine to read and unspeakable out loud, and a sentence a
 * reader can re-scan is one a listener has already lost.
 */
export async function writeVoScript(
  input: {
    body: string;
    artifact?: ProductArtifact | null;
    targetSeconds: number;
    platform: SlopPlatform;
    contentRules?: { bannedPhrases?: string[]; forbiddenClaims?: string[] };
    maxAttempts?: number;
    /**
     * How this will be read, from the Voice Director. §232.
     *
     * ElevenLabs exposes no per-word emphasis and no speed control on the
     * synthesis endpoint, so pace and stress are achieved in the *writing* —
     * a comma is a pause, a short sentence is emphasis, an em dash is a beat.
     * Passing these to the synthesiser instead would be asking the API to do
     * something it cannot, and silently getting a flat read.
     */
    deliveryNotes?: string[];
    /**
     * Write this section only, not the whole piece. §251.
     *
     * A seven-minute script is about eleven hundred words, and asking for
     * that in one call produced sixty — the model wrote a short-form script
     * and stopped, because that is what a single "write a voiceover" request
     * looks like however large the word target says it is.
     *
     * Sections are the fix and they already exist: a long-form plan is a set
     * of sections with their own briefs, and each is a normal-sized writing
     * task. The caller stitches them.
     */
    section?: { title: string; brief: string; index: number; total: number };
  },
  llm: LlmClient,
): Promise<{ script: string; costUsd: number; qc: QCResults; attempts: number }> {
  const targetWords = Math.round((input.targetSeconds / 60) * 158); // mid-band pacing
  const maxAttempts = input.maxAttempts ?? 3;
  let feedback = '';
  let totalCost = 0;
  let lastQc: QCResults | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await llm.complete({
      system: `You write voiceover scripts for short cooking videos. Write for the ear.

RULES
- Short sentences. Under twelve words each.
- No parentheticals, no lists, no headings, no stage directions.
- Spell every number as words: "four hundred fifty degrees", not "450F".
- No hashtags, no emoji, no call to action.
- Around ${targetWords} words, which reads as ${input.targetSeconds} seconds.
${
  input.section
    ? `
SECTION ${input.section.index + 1} OF ${input.section.total}: "${input.section.title}"
Write ONLY this section. It is part of a longer piece; do not introduce the
whole video, do not sign off, and do not repeat what other sections cover.
What this section is for: ${input.section.brief}`
    : ''
}
${
  input.deliveryNotes?.length
    ? `
DELIVERY — this script is being read at a specific energy. Write for it.
${input.deliveryNotes.map((n) => `- ${n}`).join('\n')}`
    : ''
}
${HARD_RULES_BLOCK}

Reply with the script text only.`,
      messages: [
        {
          role: 'user',
          content: `Post copy this narrates:\n${repairSpoken(input.body).text}\n\n${
            /*
             * `highlights` is checked, not assumed. §165: a caller handed this
             * the *stored* artifact — the provider's raw JSON, which has no
             * `highlights` — and the job died on `.slice` of undefined rather
             * than writing a script without the extra grounding. An artifact
             * that cannot supply highlights is a weaker prompt, not a crash.
             */
            input.artifact?.highlights?.length
              ? `Source artifact highlights:\n${input.artifact.highlights
                  .slice(0, 6)
                  .map((h) => `- ${h.reason ?? h.note ?? h.text}`)
                  .join('\n')}`
              : ''
          }${feedback ? `\n\n## Revision notes\n${feedback}` : ''}`,
        },
      ],
      model: DRAFT_MODEL,
      maxTokens: 600,
      promptVersion: 'vo_script.v3',
    });

    totalCost += response.costUsd;

    /*
     * §263. Unwrapped before anything reads it. A JSON envelope reaching this
     * point is spoken aloud and burned into the captions.
     */
    const unwrapped = unwrapSpokenScript(response.text);

    /**
     * §287. Repair what has one correct answer, before spending an attempt on it.
     *
     * A piece was abandoned after three identical failures on `1/4`. The loop
     * named the rule and quoted the fix each time and changed nothing, because
     * the prompt opens with the body it is narrating and that body says "1/4
     * cup" — the model was anchored on the text it had been asked to read.
     *
     * "1/4" becomes "a quarter". There is no judgement in that, so it never
     * goes to a model: it is fixed here, and the attempt is left for something
     * a writer could actually improve.
     */
    const repaired = unwrapped === null ? null : repairSpoken(unwrapped);
    const script = repaired?.text ?? null;
    if (script === null) {
      feedback =
        'Your last reply was JSON, or contained a JSON envelope. Return the spoken words only, as plain prose, with no braces, no field names and no quotes around the whole thing.';
      continue;
    }

    /**
     * The same two gates the body gets, with the spoken rules switched on.
     *
     * The claim gate is the one that matters most here. A script is prose with
     * no `claims` array to check against the artifact, so every factual
     * sentence in it is unsourced by construction — which is precisely why the
     * forbidden-claims list has to reach it.
     */
    const qc = runAllGates({
      copy: {
        body: script,
        platform: input.platform,
        hashtags: [],
        spoken: true,
        extraBannedPhrases: input.contentRules?.bannedPhrases,
        forbiddenClaims: input.contentRules?.forbiddenClaims,
      },
    });

    lastQc = qc;
    if (qc.passed) {
      return { script, costUsd: totalCost, qc, attempts: attempt };
    }

    feedback = buildFeedback(qc);
  }

  /**
   * Refused rather than returned.
   *
   * A voiceover that cannot pass is not a video worth rendering, and returning
   * the last failing attempt would put it in front of a viewer with the failure
   * recorded somewhere nobody reads.
   */
  throw new DraftRejectedError(
    `The voiceover script failed QC after ${maxAttempts} attempts. Nothing was queued.`,
    lastQc!,
    maxAttempts,
  );
}
