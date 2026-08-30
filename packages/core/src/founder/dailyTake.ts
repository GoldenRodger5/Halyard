/**
 * The Daily Take. Milestone 28, Part B.
 *
 * This is the canonical **input-gated** workflow from the operating model: the
 * system cannot proceed without an opinion, because it does not have one, and
 * generating a take unprompted would be fabrication.
 *
 *   The system must never synthesise an opinion I did not express. If I skip a
 *   day, no opinion content goes out. That is correct behaviour, not a gap.
 *
 * The order of operations matters more than any single step:
 *
 *   1. Fact-check the founder's claim — BEFORE drafting, so it can be revised
 *   2. Verify the story itself
 *   3. Strengthen the argument, and find the strongest honest counter
 *   4. Flag risk
 *   5. Draft, preserving the opinion. Sand nothing
 *   6. Clean up only
 *   7. Predict the pushback
 *
 * Step 1 is the single most valuable step in the loop: it stops something false
 * going out at speed, which is the characteristic failure of fast commentary.
 */
import {
  STRATEGY_MODEL,
  asArray,
  asString,
  extractJson,
  type LlmClient,
} from '../generation/llm.js';

export class TakeRequiresInput extends Error {
  constructor() {
    super(
      'No draft without input. The system does not have an opinion about this story, and inventing one would be fabrication.',
    );
    this.name = 'TakeRequiresInput';
  }
}

// ── Step 1 and 2: verification ─────────────────────────────────────────────

export interface FactCheckClaim {
  claim: string;
  verdict: 'supported' | 'contradicted' | 'unverifiable' | 'imprecise';
  note: string;
  sources: string[];
  /** Set when the claim is fixable rather than wrong. */
  correction?: string;
}

export interface VerificationResult {
  claims: FactCheckClaim[];
  storyVerified: boolean;
  storyNote: string;
  /** True when nothing contradicts the central claim. */
  ok: boolean;
  /** Set when the central claim is contradicted — drafting stops here. */
  blockingReason: string | null;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearch = (query: string) => Promise<WebSearchResult[]>;

export const FACT_CHECK_PROMPT_VERSION = 'take_fact_check.v1';

/**
 * Fact-check the founder's own claim before anything is drafted.
 *
 * Deliberately shown before the draft, not after: the point is that the founder
 * can revise their own take, not that a wrong take gets published with a
 * footnote.
 */
export async function factCheckTake(
  input: { rawInput: string; storyTitle: string; storyUrl: string; storySummary?: string },
  llm: LlmClient,
  search?: WebSearch,
): Promise<VerificationResult> {
  const evidence = search
    ? await gatherEvidence(input.rawInput, input.storyTitle, search)
    : [];

  const response = await llm.complete({
    system: `You fact-check a founder's off-the-cuff reaction to a news story BEFORE it is
drafted into a post, so they can revise it themselves.

Separate three things:
- what the founder asserted as fact
- what is opinion (never fact-check an opinion; "the moat is the workflow" is a
  position, not a claim)
- whether the underlying story is accurate, and whether it has been updated,
  corrected or denied since it was published

Be specific about timing. "You implied X shipped this week; it was announced in
June" is the kind of correction that matters most, because it is the kind that
gets noticed.

If you cannot verify something, say unverifiable. Do not guess.

Reply with JSON only:
{"claims":[{"claim":"","verdict":"supported|contradicted|unverifiable|imprecise","note":"","sources":[],"correction":""}],
 "story_verified":true,"story_note":""}`,
    messages: [
      {
        role: 'user',
        content: `STORY\n${input.storyTitle}\n${input.storyUrl}\n${input.storySummary ?? ''}

THE FOUNDER'S REACTION, VERBATIM
${input.rawInput}

${evidence.length > 0 ? `SEARCH RESULTS\n${evidence.map((e) => `- ${e.title} (${e.url})\n  ${e.snippet}`).join('\n')}` : 'No search results available; rely on what you know and mark anything uncertain as unverifiable.'}`,
      },
    ],
    model: STRATEGY_MODEL,
    maxTokens: 1200,
    promptVersion: FACT_CHECK_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    claims?: unknown;
    story_verified?: boolean;
    story_note?: string;
  }>(response.text);

  const claims: FactCheckClaim[] = asArray<{
    claim?: string;
    verdict?: string;
    note?: string;
    sources?: string[];
    correction?: string;
  }>(parsed.claims)
    .filter((c) => c.claim)
    .map((c) => ({
      claim: c.claim!,
      verdict: (['supported', 'contradicted', 'unverifiable', 'imprecise'] as const).includes(
        c.verdict as never,
      )
        ? (c.verdict as FactCheckClaim['verdict'])
        : 'unverifiable',
      note: c.note ?? '',
      sources: asArray<string>(c.sources),
      ...(c.correction ? { correction: c.correction } : {}),
    }));

  const contradicted = claims.filter((c) => c.verdict === 'contradicted');
  const storyVerified = parsed.story_verified !== false;

  return {
    claims,
    storyVerified,
    storyNote: parsed.story_note ?? '',
    ok: contradicted.length === 0 && storyVerified,
    blockingReason:
      contradicted.length > 0
        ? `Fact-checking contradicts your central claim: ${contradicted[0]!.note || contradicted[0]!.claim}`
        : !storyVerified
          ? `The story itself does not hold up: ${parsed.story_note ?? 'unverified'}`
          : null,
  };
}

async function gatherEvidence(
  rawInput: string,
  storyTitle: string,
  search: WebSearch,
): Promise<WebSearchResult[]> {
  const queries = [storyTitle, rawInput.split(/[.!?]/)[0]?.slice(0, 120) ?? rawInput.slice(0, 120)];
  const results: WebSearchResult[] = [];

  for (const query of queries) {
    try {
      results.push(...(await search(query)).slice(0, 4));
    } catch {
      // A failed search is missing evidence, not a failed fact-check. The model
      // is told to mark anything it cannot verify as unverifiable.
    }
  }
  return results.slice(0, 8);
}

// ── Step 3 and 4: strengthen, and flag ─────────────────────────────────────

export interface RiskFlag {
  kind:
    | 'names_a_person'
    | 'ages_badly'
    | 'politically_contested'
    | 'unsupportable'
    | 'regret_risk';
  detail: string;
}

export interface Reinforcement {
  supporting: Array<{ point: string; source?: string }>;
  strongestCounter: string;
  riskFlags: RiskFlag[];
}

export const REINFORCE_PROMPT_VERSION = 'take_reinforce.v1';

export async function strengthenTake(
  input: { rawInput: string; storyTitle: string },
  llm: LlmClient,
): Promise<Reinforcement> {
  const response = await llm.complete({
    system: `A founder has given a one-line reaction to a news story. Strengthen it, and
flag what could go wrong.

Three jobs:
1. Find the strongest evidence FOR their position.
2. Find the strongest HONEST counter-argument. Not a strawman — the objection a
   smart person who disagrees would actually make.
3. Flag risk before anything is drafted:
   - names a real person or company critically
   - could age badly if the story develops
   - touches a contested political topic they have not chosen to be in
   - makes a claim they cannot personally support
   - is a hot take they would regret in a month

Do not refuse anything, and do not soften the position. Flagging is so they can
decide with their eyes open, not so you can talk them out of it.

Reply with JSON only:
{"supporting":[{"point":"","source":""}],"strongest_counter":"",
 "risk_flags":[{"kind":"names_a_person|ages_badly|politically_contested|unsupportable|regret_risk","detail":""}]}`,
    messages: [{ role: 'user', content: `STORY\n${input.storyTitle}\n\nTHEIR TAKE\n${input.rawInput}` }],
    model: STRATEGY_MODEL,
    maxTokens: 900,
    promptVersion: REINFORCE_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    supporting?: Array<{ point?: string; source?: string }>;
    strongest_counter?: string;
    risk_flags?: Array<{ kind?: string; detail?: string }>;
  }>(response.text);

  return {
    supporting: (parsed.supporting ?? [])
      .filter((s) => s.point)
      .map((s) => ({ point: s.point!, ...(s.source ? { source: s.source } : {}) })),
    strongestCounter: parsed.strongest_counter ?? '',
    riskFlags: (parsed.risk_flags ?? [])
      .filter((f) => f.kind && f.detail)
      .map((f) => ({ kind: f.kind as RiskFlag['kind'], detail: f.detail! })),
  };
}

// ── Step 5, 6 and 7: draft, clean up, predict ──────────────────────────────

export interface TakeDraft {
  body: string;
  likelyPushback: string[];
}

export const TAKE_DRAFT_PROMPT_VERSION = 'take_draft.v1';

/**
 * Draft in the founder's voice, preserving the opinion.
 *
 * The instruction to sand nothing is explicit and repeated, because the most
 * common failure of AI-assisted commentary is regression to a balanced
 * non-statement. It has to be prevented deliberately, not hoped for.
 */
export async function draftTake(
  input: {
    rawInput: string;
    storyTitle: string;
    storyUrl: string;
    corrections: string[];
    strongestCounter: string;
    voiceDescription: string;
    audience?: string | null;
    maxChars?: number;
  },
  llm: LlmClient,
): Promise<TakeDraft> {
  if (!input.rawInput.trim()) throw new TakeRequiresInput();

  const response = await llm.complete({
    system: `You turn a founder's raw reaction into a post in their voice.

THE ONE RULE THAT MATTERS: sand nothing.

Do not neutralise the take into a summary. Do not add "it depends", "of course",
"that said", or any hedge they did not write. If the input is a strong claim, the
output is a strong claim. A balanced non-statement is the failure mode here, and
it is worse than a rough post.

What you MAY change: grammar, structure, length, rhythm, word order. What you may
NOT change: the stance, the strength of the stance, or what it is about.

Never add a position they did not express. If their reaction only covers half the
story, the post covers half the story.

VOICE
${input.voiceDescription}

${input.audience ? `WRITTEN FOR\n${input.audience}\n` : ''}
${input.corrections.length > 0 ? `CORRECTIONS TO APPLY SILENTLY — they got these wrong, so do not repeat them:\n${input.corrections.map((c) => `- ${c}`).join('\n')}\n` : ''}
${input.strongestCounter ? `THE STRONGEST COUNTER, for context only. Do not pre-empt it unless the founder did:\n${input.strongestCounter}\n` : ''}
STYLE
- No em dashes. No hashtags. No "hot take", no "unpopular opinion".
- Under ${input.maxChars ?? 280} characters.
- No link in the body.

Then predict the two most likely replies, so they can decide whether to pre-empt
them in the post or leave them as conversation.

Reply with JSON only:
{"body":"","likely_pushback":["",""]}`,
    messages: [
      {
        role: 'user',
        content: `STORY\n${input.storyTitle}\n${input.storyUrl}\n\nTHEIR REACTION, VERBATIM\n${input.rawInput}`,
      },
    ],
    /*
     * Strategy, not draft. This writes the founder's opinion in their own voice
     * and it publishes under their name — the same tier as the fact-check that
     * gates it and the strengthener that follows it.
     */
    model: STRATEGY_MODEL,
    maxTokens: 700,
    promptVersion: TAKE_DRAFT_PROMPT_VERSION,
  });

  const parsed = extractJson<{ body?: unknown; likely_pushback?: unknown }>(response.text);
  /**
   * Checked, not cast. `!parsed.body` is false for the number `0`… and for
   * every other number, so a model answering `{"body": 42}` passed this guard
   * and then threw on `.trim()`. `asString` answers the question actually being
   * asked: is there usable text here.
   */
  const body = asString(parsed.body);
  if (!body) throw new Error('The take draft came back empty.');

  return {
    body,
    // Auxiliary, and there is no retry loop here — a wrong shape loses the
    // caveats rather than the take. See `asArray` in `generation/llm.ts`.
    likelyPushback: asArray<string>(parsed.likely_pushback).filter(Boolean).slice(0, 3),
  };
}

// ── The loop ───────────────────────────────────────────────────────────────

export type TakeStage =
  | { stage: 'needs_input' }
  | { stage: 'needs_revision'; verification: VerificationResult }
  | {
      stage: 'drafted';
      verification: VerificationResult;
      reinforcement: Reinforcement;
      draft: TakeDraft;
      /**
       * §377. How much of what you said survived into the draft.
       *
       * `opinionPreserved` was written to catch a draft that "sanded the
       * opinion off" and was called by nothing, so a Take could come back as a
       * fluent, verified, entirely generic paragraph and nothing would say so.
       * That is the one failure this whole path exists to prevent: the point of
       * a Daily Take is that it is *yours*.
       *
       * Reported rather than refused. A low overlap is a reason to look, not
       * proof of a problem — a short input rephrased well can score low
       * honestly, and refusing on it would block the good case to catch the bad
       * one.
       */
      opinion: { preserved: boolean; overlap: number; note: string };
    };

export interface RunTakeInput {
  rawInput: string;
  storyTitle: string;
  storyUrl: string;
  storySummary?: string;
  voiceDescription: string;
  audience?: string | null;
  maxChars?: number;
}

/**
 * The whole loop, in order.
 *
 * Returns `needs_revision` rather than drafting when fact-checking contradicts
 * the central claim. That is the entire point: the founder revises their own
 * take, and nothing is written until they do.
 */
export async function runTakeLoop(
  input: RunTakeInput,
  llm: LlmClient,
  search?: WebSearch,
): Promise<TakeStage> {
  if (!input.rawInput.trim()) return { stage: 'needs_input' };

  const verification = await factCheckTake(
    {
      rawInput: input.rawInput,
      storyTitle: input.storyTitle,
      storyUrl: input.storyUrl,
      storySummary: input.storySummary,
    },
    llm,
    search,
  );

  if (!verification.ok) return { stage: 'needs_revision', verification };

  const reinforcement = await strengthenTake(
    { rawInput: input.rawInput, storyTitle: input.storyTitle },
    llm,
  );

  const draft = await draftTake(
    {
      rawInput: input.rawInput,
      storyTitle: input.storyTitle,
      storyUrl: input.storyUrl,
      corrections: verification.claims
        .filter((c) => c.correction)
        .map((c) => c.correction!),
      strongestCounter: reinforcement.strongestCounter,
      voiceDescription: input.voiceDescription,
      audience: input.audience,
      maxChars: input.maxChars,
    },
    llm,
  );

  return {
    stage: 'drafted',
    verification,
    reinforcement,
    draft,
    /* §377. Computed here so no caller can forget to ask. */
    opinion: opinionPreserved(input.rawInput, draft.body),
  };
}

/**
 * How much the draft moved from the raw input. Stored alongside both, because
 * the diff is voice training data — and because a draft that shares almost no
 * vocabulary with the input probably sanded the opinion off.
 */
export function opinionPreserved(rawInput: string, draft: string): {
  preserved: boolean;
  overlap: number;
  note: string;
} {
  const tokens = (value: string): Set<string> =>
    new Set(
      value
        .toLowerCase()
        .match(/[\p{L}\p{N}]{4,}/gu)
        ?.filter((w) => !['this', 'that', 'with', 'from', 'have', 'been', 'they', 'what'].includes(w)) ??
        [],
    );

  const rawTokens = tokens(rawInput);
  const draftTokens = tokens(draft);
  if (rawTokens.size === 0) return { preserved: true, overlap: 1, note: 'No input to compare.' };

  let shared = 0;
  for (const token of rawTokens) if (draftTokens.has(token)) shared++;
  const overlap = shared / rawTokens.size;

  return {
    preserved: overlap >= 0.3,
    overlap: Number(overlap.toFixed(2)),
    note:
      overlap >= 0.3
        ? 'The draft still carries the original claim.'
        : 'The draft shares little vocabulary with what you said. Check it did not sand the opinion off.',
  };
}
