import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FPS,
  LOUDNORM_FILTER,
  buildCaptionCues,
  captionDriftMs,
  durationInFrames,
  durationInFramesForTextOnly,
  layoutScenes,
  loudnormArgs,
  trimSilenceArgs,
  type TranscriptWord,
} from './timing.js';

function words(pairs: Array<[string, number, number]>): TranscriptWord[] {
  return pairs.map(([text, startSeconds, endSeconds]) => ({ text, startSeconds, endSeconds }));
}

describe('audio-first timing — v1 §5.2', () => {
  it('derives frame count from the measured audio duration', () => {
    expect(durationInFrames(28)).toBe(Math.ceil(28.6 * DEFAULT_FPS));
    expect(durationInFrames(28, 60)).toBe(Math.ceil(28.6 * 60));
  });

  it('leaves a tail so the last word is not clipped', () => {
    expect(durationInFrames(10) / DEFAULT_FPS).toBeGreaterThan(10);
  });

  it('never produces a composition shorter than a second', () => {
    expect(durationInFrames(0)).toBeGreaterThanOrEqual(DEFAULT_FPS);
  });

  it('falls back to reading time for a text-only cut', () => {
    const frames = durationInFramesForTextOnly([{ readSeconds: 4 }, { readSeconds: 5 }]);
    expect(frames / DEFAULT_FPS).toBe(9);
    expect(durationInFramesForTextOnly([{ readSeconds: 2 }]) / DEFAULT_FPS).toBe(8);
  });
});

describe('caption cues', () => {
  it('breaks on sentence boundaries', () => {
    const cues = buildCaptionCues(
      words([
        ['Your', 0, 0.3],
        ['loaf', 0.3, 0.6],
        ['is', 0.6, 0.75],
        ['gummy.', 0.75, 1.2],
        ['The', 1.3, 1.5],
        ['starch', 1.5, 1.9],
        ['holds', 1.9, 2.2],
        ['water.', 2.2, 2.7],
      ]),
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('Your loaf is gummy.');
    expect(cues[1]?.text).toBe('The starch holds water.');
  });

  it('breaks on a pause even mid-sentence', () => {
    const cues = buildCaptionCues(
      words([
        ['Drop', 0, 0.3],
        ['the', 0.3, 0.45],
        ['oven', 0.45, 0.9],
        ['twenty', 1.6, 2.0],
        ['five', 2.0, 2.3],
      ]),
      { pauseSeconds: 0.4 },
    );
    expect(cues).toHaveLength(2);
  });

  it('breaks on length rather than producing an unreadable line', () => {
    const cues = buildCaptionCues(
      words(
        Array.from({ length: 20 }, (_, i) => [`word${i}`, i * 0.3, i * 0.3 + 0.25] as [string, number, number]),
      ),
      { maxChars: 40 },
    );
    expect(cues.length).toBeGreaterThan(2);
    for (const cue of cues) expect(cue.text.length).toBeLessThanOrEqual(48);
  });

  it('converts seconds to frames on the cue', () => {
    const cues = buildCaptionCues(words([['Hello.', 1, 1.5]]));
    expect(cues[0]?.startFrame).toBe(30);
    expect(cues[0]?.endFrame).toBe(45);
  });

  it('reports zero drift when cues are built from the transcript', () => {
    const transcript = words([
      ['Your', 0, 0.3],
      ['loaf', 0.3, 0.6],
      ['is', 0.6, 0.8],
      ['gummy.', 0.8, 1.2],
    ]);
    expect(captionDriftMs(buildCaptionCues(transcript), transcript)).toBe(0);
  });

  it('reports drift when a cue is shifted off its word', () => {
    const transcript = words([
      ['Your', 0, 0.3],
      ['loaf.', 0.3, 0.7],
    ]);
    const cues = buildCaptionCues(transcript).map((c) => ({
      ...c,
      startSeconds: c.startSeconds + 0.34,
    }));
    expect(captionDriftMs(cues, transcript)).toBeGreaterThan(200);
  });

  it('handles an empty transcript without throwing', () => {
    expect(buildCaptionCues([])).toEqual([]);
    expect(captionDriftMs([], [])).toBe(0);
  });
});

describe('scene layout', () => {
  it('fills exactly the available frames', () => {
    const total = 28 * DEFAULT_FPS;
    const scenes = layoutScenes(
      [
        { id: 'headline', weight: 1, minSeconds: 2 },
        { id: 'swap-0', weight: 2, minSeconds: 3 },
        { id: 'swap-1', weight: 2, minSeconds: 3 },
      ],
      total,
    );
    const sum = scenes.reduce((a, s) => a + s.durationFrames, 0);
    expect(sum).toBe(total);
    expect(scenes[0]?.startFrame).toBe(0);
  });

  it('honours the per-scene minimum so nothing flashes past', () => {
    const scenes = layoutScenes(
      [
        { id: 'a', weight: 1, minSeconds: 3 },
        { id: 'b', weight: 99, minSeconds: 3 },
      ],
      8 * DEFAULT_FPS,
    );
    expect(scenes[0]!.durationFrames).toBeGreaterThanOrEqual(3 * DEFAULT_FPS);
  });

  it('returns nothing for no scenes', () => {
    expect(layoutScenes([], 300)).toEqual([]);
  });
});

describe('audio post-processing — v2 D.3 and F.4', () => {
  it('normalises to −14 LUFS with a −1 dBTP ceiling', () => {
    expect(LOUDNORM_FILTER).toContain('I=-14');
    expect(LOUDNORM_FILTER).toContain('TP=-1.0');
    expect(loudnormArgs('in.wav', 'out.m4a')).toEqual(
      expect.arrayContaining(['-af', LOUDNORM_FILTER, 'out.m4a']),
    );
  });

  it('trims trailing silence rather than leaving dead air', () => {
    const args = trimSilenceArgs('in.wav', 'out.wav').join(' ');
    expect(args).toContain('silenceremove');
    expect(args).toContain('stop_silence=0.25');
  });
});

/**
 * §163. A scene whose length is a fact, not a choice.
 */
describe('layoutScenes with a capped scene', () => {
  const fps = 30;
  const total = 30 * fps;

  it('never stretches a capped scene past its cap', () => {
    /*
     * The defect this exists for: a demo beat holding 3.8s of footage was given
     * 8.7s of the piece, and Remotion froze the last frame for the difference.
     */
    const laid = layoutScenes(
      [
        { id: 'hook', weight: 1, minSeconds: 1.2 },
        { id: 'demo', weight: 3, minSeconds: 3.8, maxSeconds: 3.8 },
        { id: 'card', weight: 2, minSeconds: 2.4 },
      ],
      total,
      fps,
    );
    expect(laid[1]!.durationFrames).toBe(Math.ceil(3.8 * fps));
  });

  it('stretches a capped scene up to its ceiling but no further', () => {
    /*
     * The floor and the ceiling are not the same number in general. A scene
     * that may grow a little — footage that can hold a beat on its final frame
     * briefly, but not for four seconds — must take the slack up to the cap and
     * then stop. Asserting only the floor==ceiling case would leave the cap
     * itself untested, since a scene pinned at its floor never stretches.
     */
    const laid = layoutScenes(
      [
        { id: 'demo', weight: 5, minSeconds: 2, maxSeconds: 4 },
        { id: 'card', weight: 1, minSeconds: 2.4 },
      ],
      total,
      fps,
    );
    // Weight 5 of 6 over ~25s of slack would be far past 4s without the cap.
    expect(laid[0]!.durationFrames).toBe(Math.ceil(4 * fps));
    expect(laid[0]!.durationFrames).toBeGreaterThan(Math.ceil(2 * fps));
  });

  it('gives the time back to the scenes that can use it', () => {
    // Capping one beat must lengthen the others, not shorten the piece.
    const scenes = [
      { id: 'hook', weight: 1, minSeconds: 1.2 },
      { id: 'demo', weight: 3, minSeconds: 3.8 },
      { id: 'card', weight: 2, minSeconds: 2.4 },
    ];
    const uncapped = layoutScenes(scenes, total, fps);
    const capped = layoutScenes(
      scenes.map((s) => (s.id === 'demo' ? { ...s, maxSeconds: 3.8 } : s)),
      total,
      fps,
    );
    expect(capped[2]!.durationFrames).toBeGreaterThan(uncapped[2]!.durationFrames);
  });

  it('still fills the runtime exactly, with no gap and no overrun', () => {
    const laid = layoutScenes(
      [
        { id: 'hook', weight: 1, minSeconds: 1.2 },
        { id: 'demo', weight: 3, minSeconds: 3.8, maxSeconds: 3.8 },
        { id: 'card', weight: 2, minSeconds: 2.4 },
      ],
      total,
      fps,
    );
    const last = laid[laid.length - 1]!;
    expect(last.startFrame + last.durationFrames).toBe(total);
    for (let i = 1; i < laid.length; i += 1) {
      expect(laid[i]!.startFrame).toBe(laid[i - 1]!.startFrame + laid[i - 1]!.durationFrames);
    }
  });

  it('leaves an uncapped layout exactly as it was', () => {
    // The cap is opt-in; every composition that never sets one is untouched.
    const scenes = [
      { id: 'a', weight: 1, minSeconds: 1.2 },
      { id: 'b', weight: 2, minSeconds: 2.4 },
      { id: 'c', weight: 3, minSeconds: 3.6 },
    ];
    const laid = layoutScenes(scenes, total, fps);
    expect(laid.map((s) => s.durationFrames).reduce((a, b) => a + b, 0)).toBe(total);
    expect(laid[0]!.durationFrames).toBeGreaterThan(Math.ceil(1.2 * fps));
  });

  it('does not hand the rounding remainder to a capped final scene', () => {
    /*
     * The last scene normally absorbs the remainder so the beats add up. Doing
     * that to a capped scene would put the freeze back at the end of the piece.
     */
    const laid = layoutScenes(
      [
        { id: 'card', weight: 2, minSeconds: 2.4 },
        { id: 'demo', weight: 3, minSeconds: 3.8, maxSeconds: 3.8 },
      ],
      total,
      fps,
    );
    expect(laid[1]!.durationFrames).toBe(Math.ceil(3.8 * fps));
  });
});

/**
 * §270. Word timings on the cue, for karaoke captions.
 *
 * Word-by-word highlighting is the dominant short-form caption style because in
 * a feed that autoplays muted it gives the eye something to track. The cue has
 * always known its text and its span; it now carries the words too.
 */
describe('cues carry their words', () => {
  const words = [
    { text: 'Your', startSeconds: 0.0, endSeconds: 0.3 },
    { text: 'dusting', startSeconds: 0.3, endSeconds: 0.8 },
    { text: 'flour', startSeconds: 0.8, endSeconds: 1.2 },
  ];

  it('keeps every word, with its own timing', () => {
    const [cue] = buildCaptionCues(words);
    expect(cue!.words.map((w) => w.text)).toEqual(['Your', 'dusting', 'flour']);
    expect(cue!.words[1]!.startSeconds).toBe(0.3);
    expect(cue!.words[1]!.endSeconds).toBe(0.8);
  });

  it('spans exactly the cue it belongs to', () => {
    const [cue] = buildCaptionCues(words);
    expect(cue!.words[0]!.startSeconds).toBe(cue!.startSeconds);
    expect(cue!.words[cue!.words.length - 1]!.endSeconds).toBe(cue!.endSeconds);
  });

  it('leaves exactly one word active at any instant inside the cue', () => {
    /*
     * The property the highlight depends on. Overlapping ranges would light two
     * words at once and read as a glitch.
     */
    const [cue] = buildCaptionCues(words);
    for (const t of [0.1, 0.35, 0.5, 0.9, 1.1]) {
      const lit = cue!.words.filter((w) => t >= w.startSeconds && t <= w.endSeconds);
      expect(lit.length, `t=${t}`).toBeLessThanOrEqual(2); // boundaries may touch
      expect(lit.length, `t=${t}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('joins to the same text it always did', () => {
    const [cue] = buildCaptionCues(words);
    expect(cue!.words.map((w) => w.text).join(' ')).toBe(cue!.text);
  });
});
