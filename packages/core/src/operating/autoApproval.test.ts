import { describe, expect, it } from 'vitest';
import { evaluateAutonomousApproval } from './autoApproval.js';
import type { GateName, GateResult } from '../qc/index.js';

const gate = (name: GateName, status: GateResult['status'] = 'passed'): GateResult => ({
  gate: name,
  status,
  summary: status,
  detail: {},
  examined: status === 'skipped' ? 0 : 1,
});

const now = new Date('2026-09-28T14:00:00Z');

const goodVideo = {
  autonomous: true,
  status: 'pending_approval',
  format: 'video',
  scheduledAt: new Date('2026-09-28T20:00:00Z'),
  now,
  qcPassed: true,
  currentCopyClean: true,
  gates: [
    gate('copy'),
    gate('media'),
    gate('visual'),
    gate('coherence'),
    gate('creative'),
    gate('critic'),
    gate('retention', 'warning'),
  ],
  productionRecipeStatus: 'accepted',
  productionRecipeHumanReviewRequired: false,
  hasFinishedRender: true,
  attachedAssetCount: 1,
};

describe('evaluateAutonomousApproval', () => {
  it('allows only a fully calibrated future-slot autonomous video', () => {
    const result = evaluateAutonomousApproval(goodVideo);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('does not convert a critic warning into unattended permission', () => {
    const result = evaluateAutonomousApproval({
      ...goodVideo,
      gates: goodVideo.gates.map((g) => (g.gate === 'critic' ? gate('critic', 'warning') : g)),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/critic is warning/i);
  });

  it('refuses an unmeasured media-integrity gate even when the aggregate QC flag is true', () => {
    const result = evaluateAutonomousApproval({
      ...goodVideo,
      gates: goodVideo.gates.map((g) => (g.gate === 'media' ? gate('media', 'skipped') : g)),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/media is skipped/i);
  });

  it('requires the production recipe to have earned unattended reuse', () => {
    const result = evaluateAutonomousApproval({
      ...goodVideo,
      productionRecipeStatus: 'review_required',
      productionRecipeHumanReviewRequired: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/not been accepted/i);
    expect(result.reasons.join(' ')).toMatch(/still requires human review/i);
  });

  it('does not publish late just because approval finally became possible', () => {
    const result = evaluateAutonomousApproval({
      ...goodVideo,
      scheduledAt: new Date('2026-09-28T13:00:00Z'),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/already passed/i);
  });

  it('uses a smaller required-gate set for calibrated native text', () => {
    const result = evaluateAutonomousApproval({
      autonomous: true,
      status: 'pending_approval',
      format: 'text',
      scheduledAt: new Date('2026-09-28T20:00:00Z'),
      now,
      qcPassed: true,
      currentCopyClean: true,
      gates: [gate('copy'), gate('claims', 'warning')],
      productionRecipeStatus: 'accepted',
      productionRecipeHumanReviewRequired: false,
      hasFinishedRender: false,
      attachedAssetCount: 0,
    });
    expect(result.eligible).toBe(true);
    expect(result.requiredGates).toEqual(['copy']);
  });
});
