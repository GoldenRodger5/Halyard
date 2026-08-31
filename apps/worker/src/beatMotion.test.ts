/**
 * §427. A photographic ground is not footage.
 *
 * `motionFor` returns one calm motion for a media beat and says why: "footage
 * is the content, and animating type over a product demonstration competes with
 * the thing the beat exists for". Right for a screen recording, where the
 * recording is the claim.
 *
 * §407 gave every beat a generated photograph. Passing that as `hasMedia` sent
 * every beat down that branch — a live render showed five beats all
 * `rise / push / crossfade`, which is the motion grammar switched off by its own
 * correct rule meeting a premise that had changed underneath it.
 */
import { describe, expect, it } from 'vitest';
import { motionFor } from '@halyard/core';

const beat = (over: Record<string, unknown> = {}) =>
  motionFor({
    treatment: 'myth_fact',
    role: 'hook',
    emphasis: 'quick',
    index: 0,
    total: 5,
    hasMedia: false,
    text: 'Gluten-free bread is not automatically healthier.',
    wordCount: 7,
    language: 'editorial_cut',
    ...over,
  } as never);

describe('what counts as media for the motion grammar', () => {
  it('gets out of the way for real footage', () => {
    const m = beat({ hasMedia: true });
    expect(m.camera).toBe('still');
    expect(m.entrance).toBe('none');
  });

  it('does its work when the picture is only a backdrop', () => {
    const m = beat({ hasMedia: false });
    expect(m.entrance).not.toBe('rise');
  });

  it('varies across beats of a piece, which it could not when all were media', () => {
    const roles = ['hook', 'setup', 'turn', 'payoff'];
    const motions = roles.map((role, i) =>
      JSON.stringify(beat({ role, index: i, total: roles.length, hasMedia: false })),
    );
    expect(new Set(motions).size).toBeGreaterThan(1);
  });

  it('is identical across beats when they really are footage, which is the point', () => {
    const roles = ['hook', 'setup', 'turn'];
    const motions = roles.map((role, i) =>
      JSON.stringify(beat({ role, index: i, total: roles.length, hasMedia: true, language: 'documentary' })),
    );
    expect(new Set(motions).size).toBe(1);
  });
});
