/**
 * Did the correction make things worse somewhere else?
 *
 * §165. A correction that removes the failure it targeted is not automatically
 * an improvement. The loop's characteristic failure mode is the fix that trades
 * one defect for another — shortening a script to fix pacing and losing the
 * claim the post existed to make; changing a caption backdrop to fix contrast
 * and pushing text outside the safe area. Without this check the controller
 * would count that as progress and spend the rest of its budget oscillating.
 *
 * So an iteration is accepted only if it is better *and* not worse. "Not worse"
 * is defined here, deterministically, over the gate verdicts and the invariants
 * that must survive any correction.
 */
import type { GateName, GateResult } from '../qc/index.js';

export interface Regression {
  kind:
    | 'gate_newly_failing'
    | 'gate_lost_verification'
    | 'evidence_lost'
    | 'captions_lost'
    | 'audio_lost'
    | 'creative_plan_lost';
  gate?: GateName;
  message: string;
}

/** The parts of an item a regression check reads. Deliberately small. */
export interface IterationSnapshot {
  gates: GateResult[];
  /** Claim source paths. Losing one means a claim stopped being traceable. */
  evidencePaths: string[];
  hasCaptions: boolean;
  hasAudio: boolean;
  /** Beat count, or null when this item never had a creative plan. */
  beatCount: number | null;
}

const rank: Record<string, number> = { passed: 3, warning: 2, skipped: 1, failed: 0 };

/**
 * Every way `next` is worse than `previous`.
 *
 * An empty array means the correction introduced nothing new. It does **not**
 * mean the item passes — that is a separate question the controller asks.
 */
export function regressionsBetween(
  previous: IterationSnapshot,
  next: IterationSnapshot,
): Regression[] {
  const found: Regression[] = [];
  const before = new Map(previous.gates.map((g) => [g.gate, g]));

  for (const gate of next.gates) {
    const was = before.get(gate.gate);
    if (!was) continue;

    if (was.status !== 'failed' && gate.status === 'failed') {
      found.push({
        kind: 'gate_newly_failing',
        gate: gate.gate,
        message: `${gate.gate} was ${was.status} and is now failing: ${gate.summary}`,
      });
      continue;
    }

    /*
     * A gate that was passed and is now skipped is the stale-green problem
     * arriving from the other direction: nothing failed, but something that had
     * been established no longer is. Invalidation does this deliberately, so
     * the controller only treats it as a regression once re-measurement has had
     * its chance — see `acceptable` below.
     */
    if (rank[gate.status]! < rank[was.status]! && gate.status === 'skipped') {
      found.push({
        kind: 'gate_lost_verification',
        gate: gate.gate,
        message: `${gate.gate} was ${was.status} and is no longer established.`,
      });
    }
  }

  /*
   * Provenance is not a gate, and losing it is the quietest possible
   * regression: the post still reads well, the claims gate still passes on
   * whatever claims remain, and the link back to the artifact is simply gone.
   */
  const lost = previous.evidencePaths.filter((p) => !next.evidencePaths.includes(p));
  if (lost.length > 0) {
    found.push({
      kind: 'evidence_lost',
      message: `${lost.length} claim source path(s) no longer present: ${lost.slice(0, 3).join(', ')}`,
    });
  }

  if (previous.hasCaptions && !next.hasCaptions) {
    found.push({ kind: 'captions_lost', message: 'The item had captions and no longer does.' });
  }
  if (previous.hasAudio && !next.hasAudio) {
    found.push({ kind: 'audio_lost', message: 'The item had a voiceover and no longer does.' });
  }
  if (
    previous.beatCount !== null &&
    (next.beatCount === null || next.beatCount < previous.beatCount)
  ) {
    found.push({
      kind: 'creative_plan_lost',
      message: `The creative plan went from ${previous.beatCount} beats to ${next.beatCount ?? 0}.`,
    });
  }

  return found;
}

/**
 * Regressions that are an expected consequence of the correction in flight.
 *
 * Invalidation deliberately drops gates to `skipped`, so between applying a
 * correction and re-measuring, `gate_lost_verification` is the system working
 * rather than failing. Once the rebuild has run, a gate that is *still* not
 * established is a real regression, and this stops filtering it.
 */
export function acceptable(regression: Regression, pendingGates: GateName[]): boolean {
  return (
    regression.kind === 'gate_lost_verification' &&
    regression.gate !== undefined &&
    pendingGates.includes(regression.gate)
  );
}
