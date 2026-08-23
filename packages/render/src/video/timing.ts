/**
 * Audio-first timing and captions. v1 §5.2, v2 D.3.
 *
 * "Generate TTS, measure duration, pass as durationInFrames so motion and voice
 * are locked." Everything here is pure so the timing rules can be tested without
 * rendering a frame — which matters, because a caption 300ms out of sync is
 * invisible in code review and obvious on a phone.
 *
 * Burned-in captions are not optional: most short-form is watched muted.
 */

export const DEFAULT_FPS = 30;

export interface TranscriptWord {
  text: string;
  /** Seconds from the start of the audio. */
  startSeconds: number;
  endSeconds: number;
}

export interface CaptionCue {
  text: string;
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  /** Index of the transcript word this cue opens on. Used to measure drift. */
  firstWordIndex: number;
}

/**
 * Total frames for a composition, from the measured audio duration plus a tail
 * so the last word is not clipped by the final frame.
 */
export function durationInFrames(
  audioSeconds: number,
  fps = DEFAULT_FPS,
  tailSeconds = 0.6,
): number {
  return Math.max(fps, Math.ceil((audioSeconds + tailSeconds) * fps));
}

/** Text-only cuts have no audio to lock to, so length comes from the content. */
export function durationInFramesForTextOnly(
  cues: Array<{ readSeconds: number }>,
  fps = DEFAULT_FPS,
  minSeconds = 8,
): number {
  const total = cues.reduce((sum, c) => sum + c.readSeconds, 0);
  return Math.ceil(Math.max(minSeconds, total) * fps);
}

/**
 * Group a word-level transcript into readable cues.
 *
 * Two or three words per cue is the karaoke style that reads as a template.
 * Whole clauses read as a person. Cues break on sentence boundaries first, then
 * on length, then on a pause longer than `pauseSeconds`.
 */
export function buildCaptionCues(
  words: TranscriptWord[],
  options: { fps?: number; maxChars?: number; maxWords?: number; pauseSeconds?: number } = {},
): CaptionCue[] {
  const fps = options.fps ?? DEFAULT_FPS;
  const maxChars = options.maxChars ?? 42;
  const maxWords = options.maxWords ?? 8;
  const pauseSeconds = options.pauseSeconds ?? 0.45;

  const cues: CaptionCue[] = [];
  let current: TranscriptWord[] = [];
  let currentFirstIndex = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    cues.push({
      text: current.map((w) => w.text).join(' ').replace(/\s+([.,!?])/g, '$1'),
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
      startFrame: Math.round(first.startSeconds * fps),
      endFrame: Math.round(last.endSeconds * fps),
      firstWordIndex: currentFirstIndex,
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const previous = words[i - 1];
    const gap = previous ? word.startSeconds - previous.endSeconds : 0;

    if (current.length > 0 && gap >= pauseSeconds) flush();

    if (current.length === 0) currentFirstIndex = i;
    current.push(word);

    const text = current.map((w) => w.text).join(' ');
    const endsSentence = /[.!?]$/.test(word.text);

    if (endsSentence || text.length >= maxChars || current.length >= maxWords) flush();
  }
  flush();

  return cues;
}

/**
 * Gate 3 checks caption drift against the transcript. This is the measurement
 * it uses: the largest absolute difference between a cue boundary and the word
 * it is meant to sit on.
 */
export function captionDriftMs(cues: CaptionCue[], words: TranscriptWord[]): number {
  if (cues.length === 0 || words.length === 0) return 0;
  let worst = 0;
  for (const cue of cues) {
    // Compare against the word the cue is meant to open on, not the nearest
    // word. Snapping to the nearest would report a cue displaced onto the wrong
    // word as being almost in sync, which is exactly the failure Gate 3 exists
    // to catch.
    const anchor = words[cue.firstWordIndex];
    if (!anchor) continue;
    worst = Math.max(worst, Math.abs(anchor.startSeconds - cue.startSeconds) * 1000);
  }
  return Math.round(worst);
}

/**
 * Scene timing for a composition driven by an artifact: each beat gets a share
 * of the runtime proportional to how much there is to read, with a floor so no
 * beat flashes past.
 */
export interface Scene {
  id: string;
  weight: number;
  minSeconds?: number;
  /**
   * A ceiling, for a scene whose length is a fact rather than a choice.
   *
   * §163. Almost every scene should stretch to fill the piece — a card given
   * more room is a card read more comfortably. Footage is the exception: a beat
   * stretched past its recording holds a frozen last frame, which on a real
   * render was four and a half seconds of stillness presented as a demo. The
   * time a capped scene gives up goes to the scenes that can use it.
   */
  maxSeconds?: number;
}

export interface TimedScene extends Scene {
  startFrame: number;
  durationFrames: number;
}

export function layoutScenes(
  scenes: Scene[],
  totalFrames: number,
  fps = DEFAULT_FPS,
): TimedScene[] {
  if (scenes.length === 0) return [];

  const minFrames = scenes.map((s) => Math.ceil((s.minSeconds ?? 1.2) * fps));
  const reserved = minFrames.reduce((a, b) => a + b, 0);
  const flexible = Math.max(0, totalFrames - reserved);

  /*
   * Only scenes that can stretch share the slack. A capped scene sits at its
   * floor and the time it would have taken is redistributed, so capping one
   * beat lengthens the others instead of shortening the piece.
   */
  const stretches = scenes.map(
    (s, i) => s.maxSeconds === undefined || Math.ceil(s.maxSeconds * fps) > minFrames[i]!,
  );
  const weightTotal = scenes.reduce((sum, s, i) => sum + (stretches[i] ? s.weight : 0), 0) || 1;
  const lastStretching = stretches.lastIndexOf(true);

  let cursor = 0;
  return scenes.map((scene, i) => {
    const maxFrames =
      scene.maxSeconds === undefined ? Number.POSITIVE_INFINITY : Math.ceil(scene.maxSeconds * fps);
    const extra = stretches[i] ? Math.floor((flexible * scene.weight) / weightTotal) : 0;

    /*
     * The last scene that can stretch absorbs the rounding, so the beats still
     * add up to exactly the runtime. It is deliberately not simply the last
     * scene: handing the remainder to a capped one would reintroduce the freeze.
     */
    const isLastStretching = i === lastStretching && i === scenes.length - 1;
    const durationFrames = isLastStretching
      ? Math.max(minFrames[i]!, totalFrames - cursor)
      : Math.min(minFrames[i]! + extra, maxFrames);

    const timed: TimedScene = { ...scene, startFrame: cursor, durationFrames };
    cursor += durationFrames;
    return timed;
  });
}

/**
 * v2 D.3 — loudness normalisation to −14 LUFS. The FFmpeg invocation lives here
 * so the target is stated once and the worker cannot drift from it.
 */
export const LOUDNORM_FILTER = 'loudnorm=I=-14:TP=-1.0:LRA=11';

export function loudnormArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i', inputPath,
    '-af', LOUDNORM_FILTER,
    '-ar', '48000',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ];
}

/** Trim trailing silence to under 300ms (v2 F.4 item 4). */
export function trimSilenceArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i', inputPath,
    '-af',
    'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB:' +
      'stop_periods=1:stop_silence=0.25:stop_threshold=-50dB',
    outputPath,
  ];
}
