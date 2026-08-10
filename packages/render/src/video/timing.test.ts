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
