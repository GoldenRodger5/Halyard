/**
 * Bounded self-correction. §165.
 *
 * Halyard runs its gates, and until now a failing verdict was terminal: the
 * item went to `failed` and waited for a person. This is the loop that tries
 * to fix it first — once, surgically, up to three times, and never past the
 * approval boundary.
 */
export {
  defectsFrom,
  type Component,
  type CorrectionAction,
  type Defect,
  type DefectPolicy,
} from './defects.js';
export {
  ACTION_SCOPE,
  assertScope,
  policyFor,
  type ActionScope,
  type PolicyEntry,
} from './policy.js';
export {
  gatesInvalidatedBy,
  invalidateGates,
  rebuildFrom,
  type RebuildStage,
} from './invalidation.js';
export {
  acceptable,
  regressionsBetween,
  type IterationSnapshot,
  type Regression,
} from './regression.js';
export {
  MAX_CORRECTIONS,
  MAX_CORRECTION_SPEND_USD,
  acceptCorrection,
  bestIteration,
  decide,
  type ControllerState,
  type Decision,
  type IterationRecord,
} from './controller.js';
