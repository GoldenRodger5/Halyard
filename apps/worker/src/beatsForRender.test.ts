/**
 * §169. The boundary where provenance was being lost.
 *
 * `planBeforeAfter` has set `sourcePath` on every artifact-derived beat since
 * §160, and `creative.test.ts` asserts it — on the *plan*. The mapping into
 * `renders.input_props` was an object literal inside the generate handler and
 * did not copy it, so the thing that actually ships could not say which
 * artifact path any of its beats came from. Nothing failed, because nothing
 * looked.
 */
import { describe, expect, it } from 'vitest';
import { planBeforeAfter, type ProductArtifact } from '@halyard/core';
import { beatsForRender } from './handlers/generate.js';

const artifact: ProductArtifact = {
  kind: 'deploy_diff',
  raw: {},
  headline: 'One deploy',
  visualHints: [],
  highlights: [
    {
      type: 'swap',
      sourcePath: 'changes[0]',
      before: 'manual rollback',
      after: 'automatic rollback',
      reason: 'The runner reverts a failed health check without a human.',
    },
    { type: 'swap', sourcePath: 'changes[1]', before: '4 steps', after: '1 step' },
  ],
};

const plan = planBeforeAfter(artifact, { platform: 'tiktok', format: 'video', targetSeconds: 30 })!;

describe('beatsForRender', () => {
  it('carries provenance into the render row', () => {
    const beats = beatsForRender(plan);
    const traced = beats.filter((b) => typeof b.sourcePath === 'string');
    expect(traced.length).toBeGreaterThan(0);
    expect(beats.find((b) => b.role === 'proof')?.sourcePath).toBe('changes[0]');
  });

  it('carries provenance for every beat the plan traced', () => {
    /*
     * The plan is the authority. Whatever it could trace, the render row must
     * be able to trace — otherwise the guarantee holds only until the artifact
     * is stored, which is the moment it starts mattering.
     */
    const planned = plan.beats.filter((b) => b.sourcePath).length;
    expect(beatsForRender(plan).filter((b) => b.sourcePath).length).toBe(planned);
  });

  it('adds no provenance to a beat that never had any', () => {
    // The hook is written, not extracted. Inventing a source for it would be
    // worse than having none.
    expect(beatsForRender(plan).find((b) => b.role === 'hook')?.sourcePath).toBeUndefined();
  });

  it('still carries what the render actually needs to draw', () => {
    for (const beat of beatsForRender(plan)) {
      expect(beat).toHaveProperty('id');
      expect(beat).toHaveProperty('role');
      expect(beat).toHaveProperty('weight');
      expect(beat).toHaveProperty('minSeconds');
      expect(beat).toHaveProperty('emphasis');
    }
  });

  it('carries footage only when the planner supplied it', () => {
    expect(beatsForRender(plan).some((b) => 'media' in b)).toBe(false);
    const withFootage = planBeforeAfter(artifact, {
      platform: 'tiktok',
      format: 'video',
      targetSeconds: 30,
      footage: { file: 'capture/x.mp4', label: 'In the product', durationMs: 3000 },
    })!;
    expect(beatsForRender(withFootage).filter((b) => 'media' in b)).toHaveLength(1);
  });
});
