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
import { runAllGates, type QCResults } from '../qc/index.js';
import { slopFilter, type SlopPlatform } from '../qc/slopFilter.js';
import type { Claim } from '../qc/claimVerifier.js';
import type { ProductArtifact } from '../connectors/types.js';
import { DRAFT_MODEL, extractJson, type LlmClient } from './llm.js';
import { HARD_RULES_BLOCK, buildCopywriterPrompt, type CopywriterContext } from './prompts.js';

export interface DraftRequest {
  platform: SlopPlatform;
  format: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  category: string;
  persona: 'founder' | 'brand';
  idea: { title: string; angle: string };
  artifact?: ProductArtifact | null;
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
  /** Operator note from the Regenerate dialog. Blind retry is a wasted call. */
  regenNote?: string;
  maxAttempts?: number;
}

export interface Draft {
  body: string;
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
  body?: string;
  title?: string;
  alt_text?: string;
  hashtags?: string[];
  claims?: Array<{ text?: string; source?: string }>;
  hook_pattern?: string;
}

export async function writeDraft(request: DraftRequest, llm: LlmClient): Promise<Draft> {
  const maxAttempts = request.maxAttempts ?? 3;
  const context: CopywriterContext = {
    ...request,
    hooks: request.hooks ?? [],
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

    const body = (raw.body ?? '').trim();
    const hashtags = (raw.hashtags ?? []).map((h) => h.replace(/^#/, ''));
    const claims: Claim[] = (raw.claims ?? [])
      .filter((c) => c.text)
      .map((c) => ({ text: c.text!, source: c.source ?? '' }));

    const qc = runAllGates({
      copy: {
        body,
        platform: request.platform,
        hashtags,
        extraBannedPhrases: request.contentRules.bannedPhrases,
        forbiddenClaims: request.contentRules.forbiddenClaims,
        longForm: request.platform === 'youtube',
      },
      ...(request.artifact ? { claims: { claims, artifact: request.artifact.raw } } : {}),
    });

    lastQc = qc;

    if (qc.passed) {
      return {
        body,
        title: raw.title,
        altText: raw.alt_text,
        hashtags,
        claims,
        hookPattern: raw.hook_pattern,
        qc,
        attempts: attempt,
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
export async function writeVoScript(
  input: { body: string; artifact?: ProductArtifact | null; targetSeconds: number },
  llm: LlmClient,
): Promise<{ script: string; costUsd: number }> {
  const targetWords = Math.round((input.targetSeconds / 60) * 158); // mid-band pacing

  const response = await llm.complete({
    system: `You write voiceover scripts for short cooking videos. Write for the ear.

RULES
- Short sentences. Under twelve words each.
- No parentheticals, no lists, no headings, no stage directions.
- Spell every number as words: "four hundred fifty degrees", not "450F".
- No hashtags, no emoji, no call to action.
- Around ${targetWords} words, which reads as ${input.targetSeconds} seconds.

${HARD_RULES_BLOCK}

Reply with the script text only.`,
    messages: [
      {
        role: 'user',
        content: `Post copy this narrates:\n${input.body}\n\n${
          input.artifact
            ? `Source artifact highlights:\n${input.artifact.highlights
                .slice(0, 6)
                .map((h) => `- ${h.reason ?? h.note ?? h.text}`)
                .join('\n')}`
            : ''
        }`,
      },
    ],
    model: DRAFT_MODEL,
    maxTokens: 600,
    promptVersion: 'vo_script.v1',
  });

  return { script: response.text.trim(), costUsd: response.costUsd };
}
