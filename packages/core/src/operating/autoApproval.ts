/**
 * Whether an autonomous draft has earned unattended approval.
 *
 * This is deliberately stricter than human approval. A person may inspect a
 * warning and decide it is acceptable; autonomy may only act on settled,
 * measured, previously calibrated conditions.
 */
import type { GateName, GateResult } from '../qc/index.js';

export interface AutonomousApprovalInput {
  autonomous: boolean;
  status: string;
  format: string;
  scheduledAt: Date | null;
  now?: Date;
  qcPassed: boolean;
  gates: GateResult[];
  currentCopyClean: boolean;
  productionRecipeStatus: string | null;
  productionRecipeHumanReviewRequired: boolean | null;
  hasFinishedRender: boolean;
  attachedAssetCount: number;
}

export interface AutonomousApprovalVerdict {
  eligible: boolean;
  reasons: string[];
  requiredGates: GateName[];
}

function requiredGates(format: string): GateName[] {
  if (format === 'video') {
    return ['copy', 'media', 'visual', 'coherence', 'creative', 'critic'];
  }
  if (['image', 'carousel', 'pin', 'story'].includes(format)) {
    return ['copy', 'visual'];
  }
  return ['copy'];
}

export function evaluateAutonomousApproval(
  input: AutonomousApprovalInput,
): AutonomousApprovalVerdict {
  const reasons: string[] = [];
  const required = requiredGates(input.format);
  const now = input.now ?? new Date();

  if (!input.autonomous) reasons.push('This item was not created by the autonomous editorial controller.');
  if (input.status !== 'pending_approval') {
    reasons.push(`The item is ${input.status}, not pending approval.`);
  }
  if (!input.scheduledAt) {
    reasons.push('No publishing slot is attached.');
  } else if (input.scheduledAt.getTime() <= now.getTime()) {
    reasons.push('The attached publishing slot has already passed and must be rescheduled.');
  }

  if (!input.currentCopyClean) {
    reasons.push('The exact current copy still has deterministic copy/slop findings.');
  }
  if (!input.qcPassed) reasons.push('The stored QC verdict is not passing.');

  const failed = input.gates.filter((gate) => gate.status === 'failed');
  if (failed.length > 0) {
    reasons.push(`Failed gates: ${failed.map((gate) => gate.gate).join(', ')}.`);
  }

  for (const gateName of required) {
    const gate = input.gates.find((candidate) => candidate.gate === gateName);
    if (!gate) {
      reasons.push(`Required gate ${gateName} has no verdict.`);
      continue;
    }
    if (gate.status !== 'passed') {
      reasons.push(`Required gate ${gateName} is ${gate.status}, not passed.`);
    }
  }

  /*
   * Recipe acceptance is the permission boundary between "this one looked
   * good" and "Halyard may repeat this production method unattended."
   */
  if (input.productionRecipeStatus !== 'accepted') {
    reasons.push('The production recipe has not been accepted for unattended reuse.');
  }
  if (input.productionRecipeHumanReviewRequired !== false) {
    reasons.push('The production recipe still requires human review.');
  }

  if (input.format === 'video' && !input.hasFinishedRender) {
    reasons.push('The video has no finished final render.');
  }
  if (
    ['image', 'carousel', 'pin', 'story'].includes(input.format) &&
    !input.hasFinishedRender &&
    input.attachedAssetCount === 0
  ) {
    reasons.push('The visual post has no reviewed finished media.');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    requiredGates: required,
  };
}
