/**
 * Auto Clip, with deterministic fixtures.
 *
 * The agent is registered `blocked`, because Halyard ingests no long-form
 * footage and so nothing can call it. That is a real prerequisite and this file
 * does not pretend otherwise — it exercises the code with a stub model rather
 * than claiming the agent has ever run.
 *
 * It is worth testing anyway, because "blocked" was being used to excuse
 * "untested". Every judgement here except the choosing itself is deterministic:
 * the bounds, the strength floor, the overlap resolution and the ffmpeg
 * arguments are all code, and all of them were unasserted.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIP_BOUNDS,
  clipArgs,
  findClipCandidates,
  resolveClips,
  type ClipCandidate,
  type TranscriptSegment,
} from './autoClip.js';
import type { LlmClient } from './llm.js';

const clip = (over: Partial<ClipCandidate> = {}): ClipCandidate => ({
  startSeconds: 0,
  endSeconds: 30,
  reason: 'stands alone',
  hook: 'Here is the thing',
  strength: 4,
  transcript: 'text',
  ...over,
});

const TRANSCRIPT: TranscriptSegment[] = [
  { startSeconds: 0, endSeconds: 10, text: 'One.' },
  { startSeconds: 10, endSeconds: 20, text: 'Two.' },
  { startSeconds: 20, endSeconds: 30, text: 'Three.' },
  { startSeconds: 30, endSeconds: 40, text: 'Four.' },
  { startSeconds: 40, endSeconds: 50, text: 'Five.' },
];

/** A model that answers with exactly what the test wants to see handled. */
function stubLlm(payload: unknown): LlmClient {
  return {
    complete: async () => ({
      text: JSON.stringify(payload),
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  } as unknown as LlmClient;
}

describe('resolveClips', () => {
  it('drops a clip shorter than a short', () => {
    expect(resolveClips([clip({ startSeconds: 0, endSeconds: CLIP_BOUNDS.minSeconds - 1 })])).toEqual([]);
  });

  it('drops a clip longer than a short', () => {
    expect(resolveClips([clip({ startSeconds: 0, endSeconds: CLIP_BOUNDS.maxSeconds + 1 })])).toEqual([]);
  });

  it('drops a clip the model was not confident about', () => {
    // Two shorts nobody watches is worse than one.
    expect(resolveClips([clip({ strength: 2 })])).toEqual([]);
    expect(resolveClips([clip({ strength: 3 })])).toHaveLength(1);
  });

  it('keeps the stronger of two clips that overlap', () => {
    const kept = resolveClips([
      clip({ startSeconds: 0, endSeconds: 30, strength: 3, reason: 'weaker' }),
      clip({ startSeconds: 20, endSeconds: 50, strength: 5, reason: 'stronger' }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.reason).toBe('stronger');
  });

  it('keeps two clips that merely touch', () => {
    // Adjacent is not overlapping; rejecting these would halve the output.
    const kept = resolveClips([
      clip({ startSeconds: 0, endSeconds: 30 }),
      clip({ startSeconds: 30, endSeconds: 60 }),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('returns clips in playing order, not strength order', () => {
    const kept = resolveClips([
      clip({ startSeconds: 60, endSeconds: 90, strength: 5 }),
      clip({ startSeconds: 0, endSeconds: 30, strength: 4 }),
    ]);
    expect(kept.map((c) => c.startSeconds)).toEqual([0, 60]);
  });
});

describe('findClipCandidates', () => {
  it('asks nothing of the model when there is no transcript', async () => {
    let called = false;
    const llm = { complete: async () => { called = true; return { text: '{}' }; } } as unknown as LlmClient;
    expect(await findClipCandidates([], {}, llm)).toEqual([]);
    expect(called).toBe(false);
  });

  it('clamps a clip that runs past the end of the recording', async () => {
    const clips = await findClipCandidates(
      TRANSCRIPT,
      {},
      stubLlm({ clips: [{ start_seconds: 20, end_seconds: 9_999, strength: 4 }] }),
    );
    expect(clips).toHaveLength(1);
    // 20→50 is 30s, inside the bounds; unclamped it would have been discarded
    // as too long, silently losing a usable clip.
    expect(clips[0]!.endSeconds).toBe(50);
  });

  it('carries the spoken words of the range it selected', async () => {
    const clips = await findClipCandidates(
      TRANSCRIPT,
      {},
      stubLlm({ clips: [{ start_seconds: 10, end_seconds: 40, strength: 4 }] }),
    );
    expect(clips[0]!.transcript).toBe('Two. Three. Four.');
  });

  it('discards an entry with no timings rather than inventing them', async () => {
    const clips = await findClipCandidates(
      TRANSCRIPT,
      {},
      stubLlm({ clips: [{ reason: 'good bit', strength: 5 }] }),
    );
    expect(clips).toEqual([]);
  });

  it('survives a model that returns no clips at all', async () => {
    expect(await findClipCandidates(TRANSCRIPT, {}, stubLlm({}))).toEqual([]);
  });

  it('still applies the deterministic bounds to what the model returned', async () => {
    // The model is not trusted to respect the bounds it was told about.
    const clips = await findClipCandidates(
      TRANSCRIPT,
      {},
      stubLlm({ clips: [{ start_seconds: 0, end_seconds: 5, strength: 5 }] }),
    );
    expect(clips).toEqual([]);
  });
});

describe('clipArgs', () => {
  const args = clipArgs({
    sourcePath: '/in.mp4',
    outputPath: '/out.mp4',
    startSeconds: 12,
    endSeconds: 42,
  });

  it('seeks before the input, which is what makes a long file affordable', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args.indexOf('-to')).toBeLessThan(args.indexOf('-i'));
  });

  it('crops to a vertical frame at the size every short platform wants', () => {
    expect(args.join(' ')).toContain('crop=ih*9/16:ih,scale=1080:1920');
  });

  it('keeps the audio, which the captioner needs', () => {
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
  });

  it('overwrites rather than prompting, because nothing is watching', () => {
    expect(args[0]).toBe('-y');
  });
});
