/**
 * The four gates, and the shape the queue reads them in. v2 Part F.5.
 *
 *   ✓ Copy       passed  (0 flags)
 *   ✓ Claims     3/3 verified against artifact
 *   ⚠ Visual     4.2/5 — "slide 4 text is close to the safe area"
 *   ✓ Audio      WER 0.4%, 158 wpm, −14.1 LUFS
 *
 * Content that fails any gate never reaches the approval queue, so the queue
 * stays worth reading. Warnings are visible but not blocking; failures never
 * arrive.
 */
export * from './slopFilter.js';
export * from './claimVerifier.js';
export * from './visualQC.js';
export * from './audioQC.js';
export * from './deliveryQC.js';
export * from './retentionQC.js';
export * from './destinationQC.js';
export * from './coherence.js';
export * from './creativeQC.js';

import { slopFilter, slopSummary, type SlopFilterInput, type SlopFilterResult } from './slopFilter.js';
import { verifyClaims, type Claim, type ClaimVerificationResult } from './claimVerifier.js';
import {
  runDestinationQC,
  type DestinationQCInput,
  type DestinationQCResult,
} from './destinationQC.js';
import { runProofQC, type ProofQCInput, type ProofQCResult } from '../proof/testimonials.js';

/**
 * Every gate, as a list.
 *
 * §374. This was a type union, which is unreachable at runtime — nothing could
 * iterate it, count it, or check anything about it. That is how a gate name
 * outgrew its column on the review screen and printed "Destinationno link":
 * the string was right, the layout was wrong, and no test could have known the
 * longest name because no test could see the names.
 *
 * The same shape every other vocabulary in this codebase uses — `STAGES`,
 * `MOVES`, `BED_MOODS`, `JOB_KINDS` — for the same reason.
 */
export const GATE_NAMES = [
  'copy',
  'claims',
  'visual',
  'audio',
  'destination',
  'proof',
  /**
   * Does the artifact show what the post claims? Every other gate passes on a
   * video whose voiceover describes a feature the footage never shows.
   */
  'coherence',
  /**
   * Does the opening earn the next three seconds? Measured from the rendered
   * file, so it runs in `review_media` beside `visual` rather than at copy time.
   */
  'retention',
  /**
   * Is it good creative, rather than merely legal creative? §205.
   *
   * Every other gate can pass on a stack of text cards that ignored a recording
   * of the product. This one reads the plan rather than the pixels, because at
   * the level of pixels a card changing and a product being used are the same
   * event.
   */
  'creative',
  /**
   * Is it *well made*? §275.
   *
   * Every other gate checks a nameable defect — a banned phrase, a contrast
   * ratio, a word count. None of them can see "every caption is set the same
   * way, so the piece reads as automated", because each frame is individually
   * fine and the *set* of them is the problem. This gate carries the critic's
   * judgements, which are warnings and never failures.
   */
  'critic',
] as const;

export type GateName = (typeof GATE_NAMES)[number];
export type GateStatus = 'passed' | 'warning' | 'failed' | 'skipped';

export interface GateResult {
  gate: GateName;
  status: GateStatus;
  /** One line, as rendered on the queue card. */
  summary: string;
  /** Everything the detail view shows. */
  detail: unknown;
  /**
   * How many things this gate actually looked at.
   *
   * The distinction `verify-flows` draws between "verified" and "never run"
   * applies to every gate: examining nothing and finding nothing wrong is not
   * the same as examining something and finding it good. A gate with
   * `examined: 0` reports `skipped`, never `passed`, so a silently broken
   * extractor cannot render as a green tick.
   */
  examined?: number;
}

export interface QCResults {
  /** False means the item never enters the approval queue. */
  passed: boolean;
  gates: GateResult[];
  ranAt: string;
}

export interface RunAllGatesInput {
  copy: SlopFilterInput;
  claims?: { claims: Claim[]; artifact: unknown };
  /**
   * Gates this item's format genuinely demands.
   *
   * Without this, `passed` was `gates.every(g => g.status !== 'failed')` — and a
   * *skipped* gate is not a failed one, so an item whose gates never ran read as
   * passed. That is the "never verified ≠ passed" violation this codebase is
   * built around, arriving through the one function meant to enforce it.
   *
   * Declaring a requirement makes a gate that did not run fail honestly.
   * Declaring nothing preserves the previous behaviour, which is correct for
   * copy-time callers: at that point the media does not exist yet.
   */
  requires?: GateName[];
  /*
   * There is deliberately no `visual`, `audio` or `coherence` input here.
   *
   * `runAllGates` runs at copy time, before any media exists, so no caller
   * could supply them — and none of the six production callers ever did. They
   * were accepted for two years, exercised only by tests, and the Auditor
   * reported `gate.input_never_supplied` against them the whole time.
   *
   * The measurements are real and they happen where their inputs exist:
   * `runVisualQC` and `runCoherenceQC` in the `review_media` handler after the
   * render, `runAudioQC` in `tts` after the voiceover. Both stages merge their
   * verdict into this function's own `gates` array, so the aggregate still
   * carries a media verdict — written by the stage that can actually measure
   * it, rather than by a parameter nothing can fill.
   *
   * The gate *entries* remain below, as slots those stages replace. See §119.
   */
  /** Milestone 42 — where the post sends people, checked before approval. */
  destination?: DestinationQCInput;
  /**
   * Milestone 45 — quoted testimonials, verified against stored rows.
   *
   * Omitted when there is nothing to check; the gate then reports 'skipped'.
   * A quote that does not resolve is a *failure*, not a warning, because there
   * is no acceptable version of publishing an invented testimonial.
   */
  proof?: ProofQCInput;
}

/**
 * Does this body look like it contains something an extractor should have found?
 *
 * The failure this catches is specific and has already happened once: an
 * extractor whose pattern silently matches nothing reports zero findings, the
 * gate reports no problems, and the post publishes unexamined. Comparing what
 * the extractor returned against what the text obviously contains is the only
 * cheap way to notice.
 */
export function looksUnextracted(body: string, extracted: number): string | null {
  if (extracted > 0) return null;

  // A quotation mark pair around a sentence-length span.
  const quoted = /["\u201C\u201D\u201F][^"\u201C\u201D\u201F]{20,}["\u201C\u201D\u201F]/.test(body);
  if (quoted) {
    return 'This post contains something in quotation marks, but no quote was extracted for verification. Either it is the product\u2019s own words, or the extractor missed it.';
  }

  // A number attached to a unit, or an explicit causal claim: the shapes a
  // factual assertion takes in this system's copy.
  const numericClaim = /\b\d+(\.\d+)?\s?(%|percent|degrees|minutes|hours|grams?|cups?|tsp|tbsp|x\b)/i.test(body);
  const causal = /\b(because|which is why|the reason|so that|causes?|prevents?)\b/i.test(body);
  if (numericClaim && causal) {
    return 'This post states a number and a mechanism, but no claim was extracted to check against the artifact.';
  }

  return null;
}

export function runAllGates(input: RunAllGatesInput): QCResults {
  const gates: GateResult[] = [];

  const copy: SlopFilterResult = slopFilter(input.copy);
  gates.push({
    gate: 'copy',
    status: copy.errors.length > 0 ? 'failed' : copy.warnings.length > 0 ? 'warning' : 'passed',
    summary: slopSummary(copy),
    detail: copy,
  });

  if (input.claims) {
    const claims: ClaimVerificationResult = verifyClaims(input.claims.claims, input.claims.artifact);
    const hasReview = claims.results.some((r) => r.verdict === 'needs_review');

    // Zero claims examined is not a pass. It may be an honest "this post makes
    // no factual assertions", or it may be an extractor that returned nothing —
    // and those look identical from here, so neither gets a tick.
    const examinedNothing = input.claims.claims.length === 0;
    gates.push({
      gate: 'claims',
      status: examinedNothing
        ? 'skipped'
        : !claims.passed
          ? 'failed'
          : hasReview
            ? 'warning'
            : 'passed',
      summary: examinedNothing
        ? (looksUnextracted(input.copy.body, 0) ?? 'no claims were extracted to verify')
        : claims.summary,
      detail: claims,
      examined: input.claims.claims.length,
    });
  } else {
    gates.push({
      gate: 'claims',
      status: 'skipped',
      summary: 'no claims to verify',
      detail: null,
      examined: 0,
    });
  }

  /**
   * Visual and audio are supplied by tests and by nothing in production, and
   * that is a fact about *timing* rather than a bug in this function.
   *
   * `runAllGates` runs at **copy time**, when no media exists yet — so no
   * production caller could supply them. The real measurements happen at the
   * only moment their inputs exist: `runVisualQC` in the `review_media` handler
   * after the render, `runAudioQC` in the `tts` handler after the voiceover.
   *
   * The inputs are kept rather than deleted because the aggregate legitimately
   * can express a media verdict, and a future unification of the two stages
   * would use exactly this path. What changed is that an unmeasured dimension
   * can no longer contribute to a pass — see `requires` below.
   */
  /*
   * Media slots.
   *
   * Always `skipped` here, because this stage cannot see media. `review_media`
   * replaces `visual` and `coherence` after the render and `tts` replaces
   * `audio` after the voiceover, each recomputing `passed` over the merged
   * list. A caller that names one in `requires` gets an honest failure, which
   * is the correct answer for "this item may not be approved on copy alone".
   */
  gates.push({
    gate: 'visual',
    status: 'skipped',
    summary: 'no media here — measured after render, by review_media',
    detail: null,
  });

  gates.push({
    gate: 'audio',
    status: 'skipped',
    summary: 'no voiceover here — measured after synthesis, by tts',
    detail: null,
  });

  gates.push({
    gate: 'coherence',
    status: 'skipped',
    summary: 'nothing rendered to compare against the post',
    detail: null,
    examined: 0,
  });

  if (input.destination) {
    const destination: DestinationQCResult = runDestinationQC(input.destination);
    const warnings = destination.findings.filter((f) => f.severity === 'warning');
    gates.push({
      gate: 'destination',
      status: !destination.passed ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
      summary: destination.summary,
      detail: destination,
    });
  } else {
    gates.push({
      gate: 'destination',
      status: 'skipped',
      summary: 'no link',
      detail: null,
    });
  }

  if (input.proof) {
    const proof: ProofQCResult = runProofQC(input.proof);
    // Same rule: finding no quotes is not the same as verifying some. An
    // extractor that silently matches nothing produced exactly this result once
    // already, and it looked green.
    const examinedNothing = proof.verified === 0 && proof.findings.length === 0;
    const suspicion = examinedNothing ? looksUnextracted(input.proof.body, 0) : null;
    gates.push({
      gate: 'proof',
      // A body that visibly contains a quotation but yielded none is the
      // extractor-failure signature, and it warns rather than staying silent.
      status: suspicion ? 'warning' : examinedNothing ? 'skipped' : proof.passed ? 'passed' : 'failed',
      summary: suspicion ?? proof.summary,
      detail: proof,
      examined: proof.verified + proof.findings.length,
    });
  } else {
    gates.push({
      gate: 'proof',
      status: 'skipped',
      summary: 'no quoted testimonial',
      detail: null,
      examined: 0,
    });
  }

  /**
   * A required gate that did not run is a failure, not a pass.
   *
   * `every(status !== 'failed')` treated `skipped` as acceptable, which is right
   * for a gate the item does not need and wrong for one it does. The caller
   * says which is which; nothing here guesses.
   */
  const required = new Set(input.requires ?? []);
  const unrun = gates.filter((g) => required.has(g.gate) && g.status === 'skipped');
  for (const gate of unrun) {
    gate.status = 'failed';
    gate.summary = `${gate.summary} — required for this item and never ran, so it cannot be called passed.`;
  }

  return {
    passed: gates.every((g) => g.status !== 'failed'),
    gates,
    ranAt: new Date().toISOString(),
  };
}

/**
 * v2 Part C — disclosure is required when content shows photorealistic synthetic
 * media, an AI-generated human, or a real person altered to appear to say or do
 * something they did not. AI-assisted *text* is exempt.
 *
 * A cloned founder voice is the case platform rules most directly target, so it
 * always carries a disclosure. Consent is satisfied; disclosure costs a line.
 */
export type AiComponent = 'copy' | 'voiceover' | 'imagery' | 'motion' | 'none';

export function requiresAiLabel(components: AiComponent[]): boolean {
  return components.includes('voiceover') || components.includes('imagery');
}

export function suggestedDisclosure(
  components: AiComponent[],
  audioMode: 'founder_cloned' | 'founder_recorded' | 'text_only',
): string | null {
  if (!requiresAiLabel(components)) return null;
  if (components.includes('imagery')) {
    return 'Some imagery in this post is AI generated. #AIgenerated';
  }
  if (audioMode === 'founder_cloned') {
    return 'Narration is my own voice, synthesised. #AIvoiceover';
  }
  return 'This post uses AI voiceover. #AIvoiceover';
}

/**
 * The publish-time check. v2 C.3: "The publish job refuses to post when
 * requires_ai_label is true and no disclosure is present in the caption or the
 * platform's native AI toggle is unset."
 */
export function disclosureSatisfied(input: {
  aiComponents: AiComponent[];
  disclosureText: string | null | undefined;
  body: string;
  platformAiToggleSet?: boolean;
}): { ok: boolean; reason?: string } {
  if (!requiresAiLabel(input.aiComponents)) return { ok: true };
  if (input.platformAiToggleSet) return { ok: true };

  const disclosure = (input.disclosureText ?? '').trim();
  if (!disclosure) {
    return { ok: false, reason: 'AI label required but no disclosure text is set.' };
  }
  const bodyHasIt =
    input.body.includes(disclosure) ||
    /#ai(voiceover|generated)\b/i.test(input.body) ||
    /\bAI[- ](generated|voiceover|narration)\b/i.test(input.body);
  if (!bodyHasIt) {
    return {
      ok: false,
      reason: 'Disclosure text is set but does not appear in the caption, and no platform AI toggle is set.',
    };
  }
  return { ok: true };
}

/**
 * The gate list after a human rewrites the body.
 *
 * §157. `qc_results.gates` is what the queue renders, and an edit used to leave
 * every entry untouched — so an operator could rewrite a post and the screen
 * would go on showing `copy: passed (0 flags)` and `claims: 2/2 verified
 * against artifact` for words nothing had examined. That is §143 again, with
 * the operator doing the rewriting instead of the hook generator.
 *
 * The two gates are treated differently because only one can be settled here.
 * The copy gate **is** the slop filter, which is deterministic and has already
 * run on the new text — so it is re-run, not invalidated. The claims gate
 * cannot be: the claims were extracted from the old wording and checked against
 * the artifact, and whether they survive an edit is a question only a
 * re-verification answers. It is marked unverified rather than left green.
 *
 * Every other gate is returned untouched. Editing a caption does not un-measure
 * a render, and blanking the visual verdict would mean re-rendering to get it
 * back.
 */
export function gatesAfterEdit(
  gates: GateResult[],
  lint: { passed: boolean; violations: Array<{ rule: string; message: string }> },
): { gates: GateResult[]; passed: boolean } {
  const flags = lint.violations.length;

  const next = gates.map((gate): GateResult => {
    if (gate.gate === 'copy') {
      return {
        gate: 'copy',
        status: !lint.passed ? 'failed' : flags > 0 ? 'warning' : 'passed',
        summary: `re-run after a human edit — ${flags} flag${flags === 1 ? '' : 's'}`,
        detail: { violations: lint.violations },
      };
    }
    if (gate.gate === 'claims') {
      return {
        gate: 'claims',
        status: 'warning',
        summary: 'not re-verified since a human edit',
        detail: null,
      };
    }
    return gate;
  });

  return { gates: next, passed: next.every((g) => g.status !== 'failed') };
}
