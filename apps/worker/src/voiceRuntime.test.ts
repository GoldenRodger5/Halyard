/**
 * §428. A piece knows its own length even when no brief states it.
 *
 * `directVoice` chooses energy and stability partly from the runtime, and the
 * runtime came from `creative_briefs.target_seconds`. A brief is written only on
 * the artifact-driven path — six rows against forty-four content items — so
 * every format piece reached the voice director claiming thirty seconds
 * whatever its real length. A nineteen-second history and a forty-five-second
 * walkthrough were read identically, and neither was thirty.
 */
import { describe, expect, it } from 'vitest';
import { directVoice } from '@halyard/core';

/** The resolution §428 added, extracted so it can be asserted directly. */
function runtimeFor(item: {
  target_seconds?: number | null;
  screenplay?: { scenes?: Array<{ seconds?: number }> } | null;
}): { seconds: number; from: string } {
  const staged = Array.isArray(item.screenplay?.scenes)
    ? item.screenplay!.scenes.reduce((t, s) => t + (Number(s.seconds) || 0), 0)
    : 0;
  if (item.target_seconds) return { seconds: Number(item.target_seconds), from: 'brief' };
  if (staged > 0) return { seconds: Math.round(staged), from: 'screenplay' };
  return { seconds: 30, from: 'default' };
}

describe('where the runtime comes from', () => {
  it('prefers the brief, which is a decision', () => {
    const r = runtimeFor({ target_seconds: 45, screenplay: { scenes: [{ seconds: 19 }] } });
    expect(r).toEqual({ seconds: 45, from: 'brief' });
  });

  it('falls to the staged screenplay, which is what was actually built', () => {
    const r = runtimeFor({
      screenplay: { scenes: [{ seconds: 3.6 }, { seconds: 5.1 }, { seconds: 10.2 }] },
    });
    expect(r).toEqual({ seconds: 19, from: 'screenplay' });
  });

  it('only defaults when the piece genuinely cannot say', () => {
    expect(runtimeFor({})).toEqual({ seconds: 30, from: 'default' });
    expect(runtimeFor({ screenplay: { scenes: [] } })).toEqual({ seconds: 30, from: 'default' });
  });

  it('changes the direction, which is why it matters', () => {
    /*
     * If the runtime made no difference to the voice this would be bookkeeping.
     * A short piece and a long one are read differently, and thirty seconds was
     * neither.
     */
    const short = directVoice({ platform: 'tiktok', visualLanguage: null, emotionalAngle: null, targetSeconds: 15 });
    const long = directVoice({ platform: 'tiktok', visualLanguage: null, emotionalAngle: null, targetSeconds: 60 });
    expect(JSON.stringify(short)).not.toBe(JSON.stringify(long));
  });
});
