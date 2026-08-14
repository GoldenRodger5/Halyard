/**
 * Audio production: measuring, ducking and normalising the track that goes
 * under a video.
 *
 * ## Why this exists as its own module
 *
 * Every Remotion composition accepts exactly one `audioSrc`. That is not a
 * limitation to work around — it is the right shape, because the thing worth
 * checking is the **mix**, not the stems. A voiceover that measures perfectly on
 * its own and is buried under a music bed is a bad video, and a gate that
 * measured the voiceover file would call it clean.
 *
 * So narration and music are combined, ducked and loudness-normalised here,
 * before the render, and the gate measures what the viewer will actually hear.
 *
 * Everything shells out to FFmpeg, which already lives in the worker container
 * for the video pipeline. Nothing here needs a network or an API key, which is
 * why it can be tested end to end against synthesised tones rather than mocks.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Target programme loudness, in LUFS.
 *
 * Every major platform normalises on playback — roughly −14 LUFS on TikTok,
 * Instagram and YouTube. Delivering louder than the target does not make the
 * video louder, it makes the platform turn it down, and anything squashed to
 * get there stays squashed after the gain reduction. Delivering quieter than
 * the target gets turned *up* on some platforms and left alone on others, which
 * is how one post in a feed sounds thin next to its neighbours.
 *
 * Hitting the target is the only option that sounds the same everywhere.
 */
export const TARGET_LUFS = -14;

/** True-peak ceiling. −1 dBTP leaves headroom for lossy-codec overshoot. */
export const TARGET_TRUE_PEAK = -1;

/**
 * Compressor settings for ducking the bed under the narration.
 *
 * These are the actual filter parameters, not a friendly number that gets
 * arithmetic done to it. The first version exported a `DUCK_DEPTH_DB = 18` and
 * derived `ratio = DUCK_DEPTH_DB / 3`, which is not a relationship that exists:
 * how far a compressor pulls a signal down depends on threshold, ratio *and*
 * how far the key signal sits above the threshold. Measured against real audio,
 * that configuration delivered about 10 dB while the constant claimed 18.
 *
 * The achieved depth is asserted in the tests instead, which is the only way to
 * state it honestly — see `MIN_DUCK_DEPTH_DB`.
 *
 * Attack is fast enough to catch the start of a word; release is slow enough
 * that the bed does not surge between words, which is the artefact that makes
 * automatic ducking sound automatic.
 */
export const DUCK_THRESHOLD = 0.015;
export const DUCK_RATIO = 12;
export const DUCK_ATTACK_MS = 20;
export const DUCK_RELEASE_MS = 350;

/**
 * The floor the mix is verified against, in dB.
 *
 * Broadcast practice for music under speech is roughly 9–15 dB. Deeper than
 * that and the bed may as well not be there while anyone is talking; shallower
 * and it fights the voice. This is a floor rather than a target because the
 * exact figure depends on the material, and a test that demanded an exact depth
 * would be asserting a property of the test's own tones.
 */
export const MIN_DUCK_DEPTH_DB = 9;

/** Music level relative to full scale when nobody is speaking. */
export const MUSIC_BED_DB = -22;

export interface LoudnessMeasurement {
  /** Integrated programme loudness across the whole file. */
  lufs: number;
  truePeakDb: number;
  /** Loudness range. Very low means squashed; very high means uneven. */
  loudnessRange: number;
  /** The offset FFmpeg suggests to reach the target, used by the second pass. */
  targetOffset: number;
  thresholdLufs: number;
}

/**
 * A file whose loudness could not be measured is not a quiet file.
 *
 * FFmpeg reports `-inf` for pure digital silence, and JSON has no `-Infinity`,
 * so it arrives as the string `"-inf"`. Parsed naively that becomes `NaN`,
 * every downstream comparison against a threshold returns false, and silence
 * passes every check by failing to be a number.
 */
function parseLoudnessNumber(raw: unknown): number {
  const value = Number(raw);
  if (Number.isFinite(value)) return value;
  // Digital silence, or a measurement that did not happen. Both are "as quiet
  // as it is possible to be", which is a real answer and a failing one.
  return Number.NEGATIVE_INFINITY;
}

/**
 * Measure a file with FFmpeg's `loudnorm` filter in analysis mode.
 *
 * This is the first pass of two-pass normalisation. Single-pass loudnorm is a
 * dynamic filter — it adapts as it goes, which changes the relative level of a
 * quiet passage against a loud one. For spoken word over a bed that is audible
 * as pumping. Measuring first and applying a fixed correction second is slower
 * and is what keeps the mix sounding like the mix.
 */
export async function measureLoudness(filePath: string): Promise<LoudnessMeasurement> {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=11:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );

  // loudnorm prints its JSON block to stderr, after the log. Take the last
  // brace-delimited block rather than the first: the log above it can contain
  // braces of its own.
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`ffmpeg loudnorm produced no measurement for ${path.basename(filePath)}`);
  }

  const parsed = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;

  return {
    lufs: parseLoudnessNumber(parsed.input_i),
    truePeakDb: parseLoudnessNumber(parsed.input_tp),
    loudnessRange: parseLoudnessNumber(parsed.input_lra),
    targetOffset: Number(parsed.target_offset) || 0,
    thresholdLufs: parseLoudnessNumber(parsed.input_thresh),
  };
}

/** Duration in seconds, via ffprobe. */
export async function audioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe could not read a duration from ${path.basename(filePath)}`);
  }
  return seconds;
}

export interface SilenceMeasurement {
  leadingMs: number;
  trailingMs: number;
}

/**
 * Leading and trailing silence, which the audio gate checks.
 *
 * Measured against a −50 dB floor rather than absolute zero, because an MP3
 * decode of "silence" is not bit-zero and a check for true zero would report
 * every real file as having none.
 */
export async function measureEdgeSilence(filePath: string): Promise<SilenceMeasurement> {
  const duration = await audioDuration(filePath);
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'silencedetect=noise=-50dB:d=0.05',
      '-f',
      'null',
      '-',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );

  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));

  // Leading silence only counts if a silent run begins at the very start.
  const leadingMs = starts.length > 0 && starts[0]! <= 0.01 ? Math.round((ends[0] ?? 0) * 1000) : 0;

  // Trailing silence only counts if the final silent run is never closed, or
  // closes at the end of the file.
  let trailingMs = 0;
  if (starts.length > 0) {
    const lastStart = starts[starts.length - 1]!;
    const lastEnd = ends.length === starts.length ? ends[ends.length - 1]! : undefined;
    if (lastEnd === undefined || lastEnd >= duration - 0.02) {
      trailingMs = Math.max(0, Math.round((duration - lastStart) * 1000));
    }
  }

  return { leadingMs, trailingMs };
}

export interface MixInput {
  narrationPath: string;
  /** Absent is a legitimate state: narration alone, still normalised. */
  musicPath?: string | null;
  outputPath: string;
  /** Silence held after the last word, so the video does not cut on a syllable. */
  tailSeconds?: number;
  targetLufs?: number;
}

export interface MixResult {
  outputPath: string;
  durationSeconds: number;
  /** Measured on the finished mix, not on either stem. */
  lufs: number;
  truePeakDb: number;
  hadMusic: boolean;
}

/**
 * A short tail so the last word is not clipped by the end of the video, and the
 * music has somewhere to resolve. Long enough to feel deliberate, short enough
 * that the audio gate's 300 ms trailing-silence rule still governs the
 * narration itself.
 */
export const DEFAULT_TAIL_SECONDS = 0.6;

/**
 * Combine narration and music into the single track the composition plays.
 *
 * The music is side-chained against the narration, so it steps back while
 * someone is speaking and returns in the gaps, rather than sitting at one level
 * throughout. A static bed is the thing that makes a video sound like a
 * template; ducking is most of what makes it sound produced.
 *
 * Two passes: measure, then correct by a fixed amount. See `measureLoudness`
 * for why the one-pass version pumps.
 */
export async function mixAudio(input: MixInput): Promise<MixResult> {
  const targetLufs = input.targetLufs ?? TARGET_LUFS;
  const tail = input.tailSeconds ?? DEFAULT_TAIL_SECONDS;
  const narrationSeconds = await audioDuration(input.narrationPath);
  const totalSeconds = narrationSeconds + tail;

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-mix-'));
  const staged = path.join(work, 'staged.wav');

  try {
    if (input.musicPath) {
      /**
       * `apad` then `atrim` on the narration: the sidechain needs a control
       * signal for the whole mix, including the tail. Without the pad the
       * sidechain input ends early, the compressor releases, and the music
       * jumps up at exactly the moment the video is ending.
       *
       * `aloop` on the music: a bed shorter than the narration would otherwise
       * simply stop, leaving the back half of the video dry. Looping a bed is
       * standard practice and inaudible on the kind of material used here.
       */
      const filter = [
        `[0:a]apad=whole_dur=${totalSeconds.toFixed(3)},atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB[vo]`,
        `[1:a]aloop=loop=-1:size=2147483647,atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB,volume=${MUSIC_BED_DB}dB[bed]`,
        `[vo]asplit=2[vo_mix][vo_key]`,
        `[bed][vo_key]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}:makeup=1[ducked]`,
        `[vo_mix][ducked]amix=inputs=2:duration=longest:normalize=0[mixed]`,
      ].join(';');

      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostats',
          '-y',
          '-i',
          input.narrationPath,
          '-i',
          input.musicPath,
          '-filter_complex',
          filter,
          '-map',
          '[mixed]',
          '-ar',
          '48000',
          '-ac',
          '2',
          staged,
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
    } else {
      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostats',
          '-y',
          '-i',
          input.narrationPath,
          '-af',
          `apad=whole_dur=${totalSeconds.toFixed(3)},atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB`,
          '-ar',
          '48000',
          '-ac',
          '2',
          staged,
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
    }

    const measured = await measureLoudness(staged);

    // Second pass: apply the correction FFmpeg measured, as a fixed offset.
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-y',
        '-i',
        staged,
        '-af',
        [
          `loudnorm=I=${targetLufs}:TP=${TARGET_TRUE_PEAK}:LRA=11`,
          `measured_I=${measured.lufs}`,
          `measured_TP=${measured.truePeakDb}`,
          `measured_LRA=${measured.loudnessRange}`,
          `measured_thresh=${measured.thresholdLufs}`,
          `offset=${measured.targetOffset}`,
          'linear=true',
          'print_format=summary',
        ].join(':'),
        '-ar',
        '48000',
        '-ac',
        '2',
        '-b:a',
        '192k',
        input.outputPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );

    const finalLoudness = await measureLoudness(input.outputPath);

    return {
      outputPath: input.outputPath,
      durationSeconds: await audioDuration(input.outputPath),
      lufs: finalLoudness.lufs,
      truePeakDb: finalLoudness.truePeakDb,
      hadMusic: Boolean(input.musicPath),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Attach a finished audio track to a finished video.
 *
 * The alternative is letting Remotion play the audio during the render, via the
 * `audioSrc` prop the compositions accept. That needs the file to be reachable
 * from inside headless Chromium — a public URL, or a copy staged into the
 * bundle's public directory — and it buys nothing, because no composition here
 * reacts to the audio. It only draws.
 *
 * So the render stays silent and the mix is muxed on afterwards: no asset
 * serving, no CORS, no decoding audio in a browser, and the video stream is
 * copied rather than re-encoded.
 *
 * `-shortest` is deliberate. The video's frame count is derived from the audio
 * length, so the two should already agree; if they ever disagree, ending on the
 * shorter of the two is the failure that is visible in QC rather than the one
 * that leaves a frozen final frame or a stretch of black.
 */
export async function muxAudioIntoVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      outputPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}
