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
import { mkdtemp, rm, open } from 'node:fs/promises';
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
/**
 * §317. Mean volume of a finished file, in dBFS.
 *
 * Distinguishes "no audio" from "silent audio", which every other check here
 * conflates — and the second is the dangerous one, because a silent stream
 * looks like sound to every player and to every `hasAudio` test. Four rendered
 * files carried one before this existed.
 *
 * Returns null when there is no audio stream at all, which is a legitimate
 * state for a caption-led cut.
 */
export async function meanVolumeDb(filePath: string): Promise<number | null> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-v', 'info',
    '-i', filePath,
    '-af', 'volumedetect',
    '-f', 'null', '-',
  ]).catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? '' }));

  if (!/Stream #\d+:\d+.*Audio:/.test(stderr)) return null;
  const match = stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/);
  return match ? Number(match[1]) : null;
}

/**
 * §320. Whether an MP4's index precedes its media data.
 *
 * Reads the box headers directly rather than shelling out: it is four bytes of
 * structure at the front of the file, and ffprobe does not report it.
 */
export async function hasFaststart(filePath: string): Promise<boolean | null> {
  try {
    const handle = await open(filePath, 'r');
    try {
      /* The first megabyte is more than enough to see which box comes first. */
      const buffer = Buffer.alloc(1024 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const head = buffer.subarray(0, bytesRead);
      const moov = head.indexOf('moov');
      const mdat = head.indexOf('mdat');
      if (moov === -1 && mdat === -1) return null;
      /* `moov` not in the first megabyte while `mdat` is means it is at the end. */
      if (moov === -1) return false;
      if (mdat === -1) return true;
      return moov < mdat;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

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
  /**
   * Where the Music Director wants the bed to sit, and how hard it ducks. §221.
   *
   * Optional: without it the mix uses the constants below, which is what every
   * video did before there was a director. A piece with no narration wants a
   * different bed level than one with a voice over it, and that is a creative
   * call, not a constant.
   */
  ducking?: { bedGainDb: number; duckDb: number };
  /**
   * Sound effects, already resolved to files with a time and a level. §242.
   *
   * `planSfx` and `selectEffect` have existed since §233 with **no caller at
   * all** — `mixAudio` had no input that could take them, so the whole
   * subsystem was unreachable from any handler. This is the input that makes
   * it reachable.
   *
   * Each cue is mixed as its own delayed input rather than pre-rendered into
   * one track: a pre-rendered SFX bus would have to be built at the right
   * length and offset anyway, and `adelay` does it exactly and audibly better
   * than arithmetic on buffers.
   */
  sfx?: Array<{ path: string; atSeconds: number; gainDb: number }>;
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
/**
 * §306. One narration track from lines that each land at a fixed second.
 *
 * A quiz cannot be narrated by reading a script straight through. The screen
 * holds a three-second countdown and a narrator reading continuously answers
 * during it — which removes the only thing the viewer was doing, and the pause
 * is the entire format. The words have to arrive when the visual does.
 *
 * Built the same way §242 places sound effects: each clip is its own delayed
 * input rather than arithmetic on buffers, because `adelay` does it exactly.
 * The result is a single file, so `mixAudio` needs no new input and the
 * ducking, loudness and true-peak work is unchanged.
 *
 * Overlap is possible and deliberately not prevented here: a line that runs
 * long into the next one is a *writing* problem, and silently truncating it
 * would hide it. `narrationOverlaps` reports it so the caller can fail loudly.
 */
export async function assembleTimedNarration(
  clips: Array<{ path: string; atSeconds: number }>,
  outputPath: string,
): Promise<{ outputPath: string; durationSeconds: number }> {
  if (clips.length === 0) throw new Error('assembleTimedNarration was given no clips.');

  const ordered = [...clips].sort((a, b) => a.atSeconds - b.atSeconds);
  const inputs = ordered.flatMap((clip) => ['-i', clip.path]);
  const delays = ordered
    .map((clip, i) => {
      const ms = Math.max(0, Math.round(clip.atSeconds * 1000));
      return `[${i}:a]adelay=${ms}|${ms}[n${i}]`;
    })
    .join(';');
  const mixLabels = ordered.map((_, i) => `[n${i}]`).join('');

  /*
   * `amix` with `normalize=0`: normalising would duck every line in proportion
   * to how many inputs exist, so a five-question quiz would be quieter than a
   * three-question one for no reason a listener could explain.
   */
  const filter = `${delays};${mixLabels}amix=inputs=${ordered.length}:normalize=0:dropout_transition=0[out]`;

  await execFileAsync('ffmpeg', [
    '-v', 'error',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:a', 'libmp3lame', '-q:a', '2',
    outputPath,
    '-y',
  ]);

  return { outputPath, durationSeconds: await audioDuration(outputPath) };
}

/**
 * Lines that run into the one after them.
 *
 * Reported rather than fixed. A line that overruns is a script that needs a
 * shorter sentence, and shifting it later would put the words out of step with
 * the picture they were written for — which is the problem this whole path
 * exists to solve.
 */
export function narrationOverlaps(
  lines: Array<{ atSeconds: number; durationSeconds: number; text: string }>,
): Array<{ text: string; overlapSeconds: number }> {
  const ordered = [...lines].sort((a, b) => a.atSeconds - b.atSeconds);
  const out: Array<{ text: string; overlapSeconds: number }> = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const line = ordered[i]!;
    const next = ordered[i + 1]!;
    const ends = line.atSeconds + line.durationSeconds;
    if (ends > next.atSeconds) {
      out.push({ text: line.text, overlapSeconds: Number((ends - next.atSeconds).toFixed(2)) });
    }
  }
  return out;
}

export async function mixAudio(input: MixInput): Promise<MixResult> {
  const targetLufs = input.targetLufs ?? TARGET_LUFS;
  const tail = input.tailSeconds ?? DEFAULT_TAIL_SECONDS;
  const narrationSeconds = await audioDuration(input.narrationPath);
  const totalSeconds = narrationSeconds + tail;

  /*
   * §221. The Director's levels, or the historical constants when no director
   * ran. `duckDb` is a depth in decibels; the sidechain wants a ratio, and a
   * deeper duck is a harder ratio. Clamped so a stray value cannot invert the
   * compressor or push it past what FFmpeg accepts.
   */
  const bedGainDb = input.ducking?.bedGainDb ?? MUSIC_BED_DB;
  const duckRatio =
    input.ducking === undefined
      ? DUCK_RATIO
      : Math.min(20, Math.max(1, Math.round(Math.abs(input.ducking.duckDb) * 1.5)));

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
      /*
       * §242. Effects are inputs 2..n, each delayed to its cue.
       *
       * Placed *after* the duck rather than inside it: an effect is a
       * punctuation mark on the edit, not part of the bed, and side-chaining
       * it against the voice would swallow exactly the transient that makes it
       * audible. They sit under the voice by level instead — `SFX_GAIN_DB`.
       */
      const cues = input.sfx ?? [];
      const sfxChains = cues.map((cue, i) => {
        const ms = Math.max(0, Math.round(cue.atSeconds * 1000));
        return `[${i + 2}:a]adelay=${ms}|${ms},volume=${cue.gainDb}dB[sfx${i}]`;
      });
      const mixInputs = ['[vo_mix]', '[ducked]', ...cues.map((_, i) => `[sfx${i}]`)];

      const filter = [
        `[0:a]apad=whole_dur=${totalSeconds.toFixed(3)},atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB[vo]`,
        `[1:a]aloop=loop=-1:size=2147483647,atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB,volume=${bedGainDb}dB[bed]`,
        `[vo]asplit=2[vo_mix][vo_key]`,
        `[bed][vo_key]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${duckRatio}:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}:makeup=1[ducked]`,
        ...sfxChains,
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:normalize=0[mixed]`,
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
          ...cues.flatMap((cue) => ['-i', cue.path]),
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
      /*
       * §242. Narration and effects, with no bed.
       *
       * The common case while the music library is empty, so SFX has to work
       * here or it works nowhere in production. Same placement as above: after
       * the voice, under it by level.
       */
      const cues = input.sfx ?? [];
      const pad = `apad=whole_dur=${totalSeconds.toFixed(3)},atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB`;

      if (cues.length > 0) {
        const chains = cues.map((cue, i) => {
          const ms = Math.max(0, Math.round(cue.atSeconds * 1000));
          return `[${i + 1}:a]adelay=${ms}|${ms},volume=${cue.gainDb}dB[sfx${i}]`;
        });
        const mixInputs = ['[vo]', ...cues.map((_, i) => `[sfx${i}]`)];
        const filter = [
          `[0:a]${pad}[vo]`,
          ...chains,
          `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:normalize=0[mixed]`,
        ].join(';');

        await execFileAsync(
          'ffmpeg',
          [
            '-hide_banner', '-nostats', '-y',
            '-i', input.narrationPath,
            ...cues.flatMap((cue) => ['-i', cue.path]),
            '-filter_complex', filter,
            '-map', '[mixed]',
            '-ar', '48000', '-ac', '2',
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
          pad,
          '-ar',
          '48000',
          '-ac',
          '2',
          staged,
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      }
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
      /*
       * §320. 44.1 kHz, stereo, and the index at the front.
       *
       * The mix is produced at 48 kHz and muxed as-is, and the result played
       * in ffmpeg and measured correctly while an operator heard nothing on a
       * normal player. Three things were wrong with that file for playback, all
       * of them free to fix:
       *
       * - `moov` sat at the end, so a player has to read the whole file before
       *   it knows there is audio. Fine for ffmpeg, wrong for anything that
       *   streams — and every platform Halyard publishes to streams.
       * - 48 kHz is correct and 44.1 kHz is what consumer playback paths are
       *   built around.
       * - The channel layout was never stated, so a decoder had to infer it.
       *
       * None of these is detectable by measuring the file, which is exactly why
       * it survived being checked. `runMediaIntegrity` reads levels; levels
       * were fine.
       */
      '-ar',
      '44100',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-shortest',
      outputPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}
