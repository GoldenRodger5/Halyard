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

import { slopFilter, slopSummary, type SlopFilterInput, type SlopFilterResult } from './slopFilter.js';
import { verifyClaims, type Claim, type ClaimVerificationResult } from './claimVerifier.js';
import {
  runVisualQC,
  type MediaProbe,
  type VisionScore,
  type VisualQCResult,
  type VisualTarget,
} from './visualQC.js';
import { runAudioQC, type AudioProbe, type AudioQCResult } from './audioQC.js';
import {
  runDestinationQC,
  type DestinationQCInput,
  type DestinationQCResult,
} from './destinationQC.js';
import { runProofQC, type ProofQCInput, type ProofQCResult } from '../proof/testimonials.js';
import { runCoherenceQC, type CoherenceInput, type CoherenceResult } from './coherence.js';

export type GateName =
  | 'copy'
  | 'claims'
  | 'visual'
  | 'audio'
  | 'destination'
  | 'proof'
  /**
   * Does the artifact show what the post claims? Every other gate passes on a
   * video whose voiceover describes a feature the footage never shows.
   */
  | 'coherence';
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
  visual?: { probe: MediaProbe; target: VisualTarget; visionScore?: VisionScore };
  /**
   * Frame and audio observations against the post's own intent.
   *
   * Omitted where nothing was rendered, or where frames could not be sampled —
   * the gate then reports `skipped`, never `passed`.
   */
  coherence?: CoherenceInput;
  audio?: AudioProbe;
  /** Loudness measured on the finished cut, surfaced in the audio line. */
  loudnessLufs?: number;
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

  if (input.visual) {
    const visual: VisualQCResult = runVisualQC(
      input.visual.probe,
      input.visual.target,
      input.visual.visionScore,
    );
    const warnings = visual.findings.filter((f) => f.severity === 'warning');
    gates.push({
      gate: 'visual',
      status: !visual.passed ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
      summary: visual.summary,
      detail: visual,
    });
  } else {
    gates.push({ gate: 'visual', status: 'skipped', summary: 'no media', detail: null });
  }

  if (input.audio) {
    const audio: AudioQCResult = runAudioQC(input.audio);
    const suffix =
      input.loudnessLufs !== undefined ? `, ${input.loudnessLufs.toFixed(1)} LUFS` : '';
    gates.push({
      gate: 'audio',
      status: audio.passed ? 'passed' : 'failed',
      summary: audio.summary + suffix,
      detail: audio,
    });
  } else {
    gates.push({ gate: 'audio', status: 'skipped', summary: 'no voiceover', detail: null });
  }

  if (input.coherence) {
    const coherence: CoherenceResult = runCoherenceQC(input.coherence);
    const warnings = coherence.findings.filter((f) => f.severity === 'warning');
    gates.push({
      gate: 'coherence',
      // `examined: 0` means no frame was ever looked at, and runCoherenceQC
      // reports that as a failure rather than a pass — so the status follows it
      // rather than the finding count.
      status:
        coherence.examined === 0
          ? 'skipped'
          : !coherence.passed
            ? 'failed'
            : warnings.length > 0
              ? 'warning'
              : 'passed',
      summary: coherence.summary,
      detail: coherence,
      examined: coherence.examined,
    });
  } else {
    gates.push({
      gate: 'coherence',
      status: 'skipped',
      summary: 'nothing rendered to compare against the post',
      detail: null,
      examined: 0,
    });
  }

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
