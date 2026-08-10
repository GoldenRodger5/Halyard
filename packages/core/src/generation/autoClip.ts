/**
 * Long-to-short clipping. Milestone 31, Part B.
 *
 * A tool without long-to-short clipping is behind in 2026. Record a five-minute
 * walkthrough, and Halyard should find the three to five moments worth cutting
 * out of it.
 *
 * Segment selection is a model call over a timestamped transcript, because the
 * judgement is "is this a self-contained idea with a strong opening", which is
 * not something a heuristic answers well. Everything around the call — window
 * validation, overlap resolution, duration bounds — is deterministic and lives
 * here.
 */
import { DRAFT_MODEL, STRATEGY_MODEL, extractJson, type LlmClient } from './llm.js';

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface ClipCandidate {
  startSeconds: number;
  endSeconds: number;
  /** Why this segment stands alone. */
  reason: string;
  /** The opening line, which becomes the hook. */
  hook: string;
  /** Coherence and hook strength, 1 to 5. */
  strength: number;
  transcript: string;
}

/** Shorts under 15 seconds rarely land; over 60 they stop being shorts. */
export const CLIP_BOUNDS = { minSeconds: 15, maxSeconds: 60, targetSeconds: 35 };

export const AUTOCLIP_PROMPT_VERSION = 'autoclip.v1';

export async function findClipCandidates(
  transcript: TranscriptSegment[],
  input: { title?: string; count?: number },
  llm: LlmClient,
): Promise<ClipCandidate[]> {
  if (transcript.length === 0) return [];

  const totalSeconds = transcript[transcript.length - 1]!.endSeconds;
  const wanted = input.count ?? 4;

  const response = await llm.complete({
    system: `You find the moments in a long recording that stand alone as short videos.

A good clip is:
- ONE self-contained idea. If it needs the previous two minutes to make sense, it
  is not a clip.
- Opens strongly. The first sentence has to work with no setup at all.
- Between ${CLIP_BOUNDS.minSeconds} and ${CLIP_BOUNDS.maxSeconds} seconds, ideally around ${CLIP_BOUNDS.targetSeconds}.
- Ends on a resolution, not mid-thought.

A bad clip is a section that happens to be interesting but starts with "and so",
"which means", or a pronoun with no referent.

Do not pad a clip to reach the duration, and do not return ${wanted} if only two
moments are actually good. Fewer, better.

Score coherence and hook strength together, 1 to 5. Anything below 3 is not worth
rendering.

Reply with JSON only:
{"clips":[{"start_seconds":0,"end_seconds":0,"reason":"","hook":"","strength":4}]}`,
    messages: [
      {
        role: 'user',
        content: `${input.title ? `Recording: ${input.title}\n` : ''}Length: ${Math.round(totalSeconds)}s. Want up to ${wanted} clips.

TRANSCRIPT
${transcript.map((s) => `[${s.startSeconds.toFixed(1)}] ${s.text}`).join('\n')}`.slice(0, 20_000),
      },
    ],
    model: totalSeconds > 600 ? STRATEGY_MODEL : DRAFT_MODEL,
    maxTokens: 1500,
    promptVersion: AUTOCLIP_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    clips?: Array<{
      start_seconds?: number;
      end_seconds?: number;
      reason?: string;
      hook?: string;
      strength?: number;
    }>;
  }>(response.text);

  const candidates = (parsed.clips ?? [])
    .filter((c) => typeof c.start_seconds === 'number' && typeof c.end_seconds === 'number')
    .map((c) => ({
      startSeconds: Math.max(0, c.start_seconds!),
      endSeconds: Math.min(totalSeconds, c.end_seconds!),
      reason: c.reason ?? '',
      hook: c.hook ?? '',
      strength: c.strength ?? 3,
      transcript: textBetween(transcript, c.start_seconds!, c.end_seconds!),
    }));

  return resolveClips(candidates);
}

/**
 * Deterministic clean-up: drop clips outside the duration bounds, drop weak
 * ones, and resolve overlaps in favour of the stronger clip.
 *
 * Overlapping clips are the most common model failure here, and two shorts
 * containing the same thirty seconds is worse than one.
 */
export function resolveClips(candidates: ClipCandidate[]): ClipCandidate[] {
  const valid = candidates
    .filter((clip) => {
      const duration = clip.endSeconds - clip.startSeconds;
      return (
        duration >= CLIP_BOUNDS.minSeconds &&
        duration <= CLIP_BOUNDS.maxSeconds &&
        clip.strength >= 3
      );
    })
    .sort((a, b) => b.strength - a.strength);

  const kept: ClipCandidate[] = [];
  for (const clip of valid) {
    const overlaps = kept.some(
      (existing) => clip.startSeconds < existing.endSeconds && clip.endSeconds > existing.startSeconds,
    );
    if (!overlaps) kept.push(clip);
  }

  return kept.sort((a, b) => a.startSeconds - b.startSeconds);
}

function textBetween(
  transcript: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number,
): string {
  return transcript
    .filter((s) => s.endSeconds > startSeconds && s.startSeconds < endSeconds)
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FFmpeg arguments for one clip: a 9:16 crop with the subject centred, plus the
 * audio, ready for Remotion to caption.
 */
export function clipArgs(input: {
  sourcePath: string;
  outputPath: string;
  startSeconds: number;
  endSeconds: number;
}): string[] {
  return [
    '-y',
    // Seeking before -i is orders of magnitude faster on a long file.
    '-ss', String(input.startSeconds),
    '-to', String(input.endSeconds),
    '-i', input.sourcePath,
    '-vf', 'crop=ih*9/16:ih,scale=1080:1920:flags=lanczos',
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'medium',
    '-c:a', 'aac',
    '-b:a', '192k',
    input.outputPath,
  ];
}
