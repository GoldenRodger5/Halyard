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
export * from './retentionQC.js';
export * from './destinationQC.js';

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

export type GateName = 'copy' | 'claims' | 'visual' | 'audio' | 'destination';
export type GateStatus = 'passed' | 'warning' | 'failed' | 'skipped';

export interface GateResult {
  gate: GateName;
  status: GateStatus;
  /** One line, as rendered on the queue card. */
  summary: string;
  /** Everything the detail view shows. */
  detail: unknown;
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
  audio?: AudioProbe;
  /** Loudness measured on the finished cut, surfaced in the audio line. */
  loudnessLufs?: number;
  /** Milestone 42 — where the post sends people, checked before approval. */
  destination?: DestinationQCInput;
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
    gates.push({
      gate: 'claims',
      status: !claims.passed ? 'failed' : hasReview ? 'warning' : 'passed',
      summary: claims.summary,
      detail: claims,
    });
  } else {
    gates.push({ gate: 'claims', status: 'skipped', summary: 'no claims to verify', detail: null });
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
