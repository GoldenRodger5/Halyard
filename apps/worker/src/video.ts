/**
 * Video rendering. Milestone 25.
 *
 * Bundles the Remotion entry once per process and reuses it — bundling is the
 * expensive part, and a worker that renders four videos should pay for it once.
 *
 * Everything here runs inside the worker container, which is where Chromium,
 * FFmpeg and whisper.cpp live. It is never reachable from a route handler.
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getCompositions } from '@remotion/renderer';

const execFileAsync = promisify(execFile);

const RENDER_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/render',
);
const ENTRY = path.join(RENDER_PACKAGE, 'src/video/entry.tsx');
/**
 * What the Remotion bundle serves static files from.
 *
 * Font faces live here so renders work offline, and §163 writes cut capture
 * footage here too. Exported so the capture handler writes to the same place
 * the renderer reads from, rather than recomputing the path from its own depth.
 */
export const PUBLIC_DIR = path.join(RENDER_PACKAGE, 'public');

let bundlePromise: Promise<string> | undefined;
let bundledPublicFingerprint: string | undefined;

/**
 * What the public directory currently contains, as one string.
 *
 * §163. Remotion **copies** `publicDir` into the bundle, and caches bundles by
 * a key derived from the code. Change only a public file and the cache hits, so
 * the render is served the previous copy — which is how the first footage
 * render 404'd on a file that was sitting on disk. The failure is loud here and
 * would be silent for a file that merely changed, so the fingerprint covers
 * size and mtime, not just names.
 */
export function publicFingerprint(dir: string, prefix = ''): string {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const parts: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      parts.push(publicFingerprint(full, `${prefix}${entry.name}/`));
    } else {
      const stat = statSync(full);
      parts.push(`${prefix}${entry.name}:${stat.size}:${stat.mtimeMs}`);
    }
  }
  return parts.join('|');
}

/**
 * Drop the cached bundle so the next render picks up new public assets.
 *
 * §163. The in-process half of the same problem: the worker is long-lived, so
 * footage written after the first render of the process would never be served
 * and the beat would render an empty band. Called after a capture writes a cut.
 * `getBundle` re-checks the fingerprint anyway, so this is belt and braces —
 * and cheap, because the fingerprint is a stat walk of a small directory.
 */
export function invalidateBundle(): void {
  bundlePromise = undefined;
  bundledPublicFingerprint = undefined;
}

/** Bundle once per process. Concurrent callers await the same promise. */
export function getBundle(): Promise<string> {
  // Re-bundle when the public directory has changed under us, whichever
  // process changed it.
  const fingerprint = publicFingerprint(PUBLIC_DIR);
  if (bundledPublicFingerprint !== undefined && bundledPublicFingerprint !== fingerprint) {
    bundlePromise = undefined;
  }
  bundledPublicFingerprint = fingerprint;

  bundlePromise ??= bundleWithFreshPublic();
  return bundlePromise;
}

/**
 * Bundle, then re-copy `public/` over the result.
 *
 * §163. Remotion caches bundles keyed on the code and copies `publicDir` in
 * when it builds one. Those two facts together mean a file written into
 * `public/` after a bundle exists is never served: the code has not changed, so
 * the cache hits, so the render is handed the previous copy. That is how the
 * first footage render 404'd on a file sitting on disk.
 *
 * Re-copying is the cheap half of the fix — a few megabytes against a bundle
 * that takes tens of seconds — and it keeps Remotion's code cache, which is the
 * expensive part. Overwriting a directory Remotion owns is deliberate: it is
 * the same copy Remotion itself performs, just done again with current bytes.
 */
async function bundleWithFreshPublic(): Promise<string> {
  const dir = await bundleOnce();
  await cp(PUBLIC_DIR, path.join(dir, 'public'), { recursive: true, force: true });
  return dir;
}

function bundleOnce(): Promise<string> {
  return bundle(ENTRY, () => undefined, {
    publicDir: PUBLIC_DIR,
    // The render package is ESM TypeScript importing with explicit `.js`
    // specifiers, which is what Node wants. Remotion's webpack has to be told
    // that a `.js` specifier may resolve to the `.tsx` source beside it.
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          ...(config.resolve?.extensionAlias ?? {}),
          '.js': ['.ts', '.tsx', '.js'],
          '.jsx': ['.tsx', '.jsx'],
        },
      },
    }),
  });
}

export interface RenderVideoInput {
  compositionId: string;
  props: Record<string, unknown>;
  outputPath: string;
  /** Overrides the composition default. Comes from the measured audio length. */
  durationInFrames?: number;
  concurrency?: number;
  onProgress?: (progress: number) => void;
}

export interface RenderVideoResult {
  outputPath: string;
  durationMs: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Concurrency is capped rather than left to Remotion's default: each thread is
 * a Chromium tab, and a container with a small CPU allocation thrashes long
 * before it saturates.
 */
export function renderConcurrency(): number {
  const cpus = Number(process.env.RENDER_CONCURRENCY ?? 0);
  if (cpus > 0) return cpus;
  const parallelism = (process as NodeJS.Process & { availableParallelism?: () => number })
    .availableParallelism;
  const available = typeof parallelism === 'function' ? parallelism.call(process) : 4;
  return Math.max(1, Math.min(8, available - 1));
}

export async function renderVideo(input: RenderVideoInput): Promise<RenderVideoResult> {
  const startedAt = Date.now();
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: input.compositionId,
    inputProps: input.props,
  });

  const durationInFrames = input.durationInFrames ?? composition.durationInFrames;

  await renderMedia({
    serveUrl,
    composition: { ...composition, durationInFrames },
    codec: 'h264',
    outputLocation: input.outputPath,
    inputProps: input.props,
    concurrency: input.concurrency ?? renderConcurrency(),
    // 9:16 shorts are watched on phones; CRF 23 is the point where a lower
    // number stops being visible and starts only costing upload time.
    crf: 23,
    onProgress: ({ progress }) => input.onProgress?.(progress),
    chromiumOptions: { gl: 'swangle' },
    logLevel: 'error',
  });

  const stats = await readFile(input.outputPath);

  return {
    outputPath: input.outputPath,
    durationMs: Date.now() - startedAt,
    durationInFrames,
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    bytes: stats.byteLength,
  };
}

export async function listCompositions(): Promise<string[]> {
  const serveUrl = await getBundle();
  return (await getCompositions(serveUrl)).map((c) => c.id);
}

// ── FFmpeg probing, for the visual QC gate ─────────────────────────────────

export interface VideoProbe {
  durationSeconds: number;
  width: number;
  height: number;
  loudnessLufs?: number;
  truePeakDbtp?: number;
  frameLuminance: number[];
  /**
   * Tonal range per sampled frame, `(YMAX - YMIN) / 255`, in the same order.
   *
   * The mean cannot see Halyard's own content. Its renders are a light card
   * with a small region of dark text, so swapping every word on screen moves
   * `YAVG` by 0.004 normalised — under the 0.01 that counts as "the same
   * picture" — while `YMIN` drops from 85 to 10. Measured on all four fixture
   * renders; see `DECISIONS.md` §74.
   *
   * Free: `signalstats` already prints YMIN and YMAX in the output this
   * function was parsing for YAVG.
   */
  frameContentRange: number[];
  hasAudio: boolean;
  /**
   * Frames per second, from the stream rather than assumed.
   *
   * `runRetentionQC` measures its opening window in frames (90, "roughly three
   * seconds at 30fps") and falls back to 30 when this is absent. A 24fps render
   * would then be judged against 3.75 seconds while the comment said three, so
   * the number is read rather than defaulted.
   */
  fps?: number;
}

/**
 * Everything Gate 3 needs, measured from the file rather than assumed from the
 * composition. A render that silently produced 4 frames should fail QC, and it
 * only does if QC reads the output.
 */
/** "30000/1001" → 29.97. Null for absent, unparseable or zero-denominator. */
export function parseFrameRate(raw: string | undefined): number | null {
  if (!raw) return null;
  const [num, den] = raw.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0 || n <= 0) return null;
  return Number((n / d).toFixed(3));
}

export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format: { duration?: string };
    streams: Array<{
      codec_type: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
  };

  const video = parsed.streams.find((s) => s.codec_type === 'video');
  const hasAudio = parsed.streams.some((s) => s.codec_type === 'audio');

  const probe: VideoProbe = {
    durationSeconds: Number(parsed.format.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    frameLuminance: [],
    frameContentRange: [],
    hasAudio,
  };

  const luminance = await sampleLuminance(filePath);
  probe.frameLuminance = luminance.mean;
  probe.frameContentRange = luminance.range;

  // ffprobe reports frame rate as a rational, "30000/1001" for 29.97. Left
  // undefined rather than guessed when it is missing or degenerate, so the
  // consumer's own documented fallback applies instead of a wrong number.
  const fps = parseFrameRate(video?.r_frame_rate);
  if (fps !== null) probe.fps = fps;

  if (hasAudio) {
    const loudness = await measureLoudness(filePath);
    probe.loudnessLufs = loudness.integratedLufs;
    probe.truePeakDbtp = loudness.truePeakDbtp;
  }

  return probe;
}

/**
 * Mean luminance of sampled frames. Gate 3 rejects an interior frame below 5%,
 * which is how a composition that renders a black gap gets caught.
 */
async function sampleLuminance(
  filePath: string,
  samples = 12,
): Promise<{ mean: number[]; range: number[] }> {
  /**
   * `metadata=print:file=-` writes to **stdout**. This read `stderr`.
   *
   * ffmpeg puts its own progress and banner on stderr, which is where the
   * loudness filter's JSON genuinely goes — and copying that pattern here was
   * the mistake. `file=-` means stdout, so the regex ran over the banner and
   * matched nothing, every time, on every platform. `frameLuminance` has always
   * been `[]`.
   *
   * That is not a cosmetic gap. This function's own comment says it is "how a
   * composition that renders a black gap gets caught", and Gate 3's luminance
   * rules have therefore never run on any render Halyard has produced. The gate
   * reported `passed` with `examined: 0` — a check that never happened, shown
   * as one that succeeded.
   *
   * Both streams are searched now rather than swapping one guess for another:
   * the payload is unambiguous (`lavfi.signalstats.YAVG=`), an ffmpeg build that
   * routes it elsewhere still works, and there is nothing for it to collide
   * with.
   */
  const result = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-vf', `fps=${samples}/60,signalstats,metadata=print:file=-`,
    '-f', 'null',
    '-',
  ]).catch((err: { stderr?: string; stdout?: string }) => ({
    stderr: err.stderr ?? '',
    stdout: err.stdout ?? '',
  }));

  const printed = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  /**
   * Parsed per frame block rather than with three independent scans, so a
   * dropped value cannot silently shift one series against another. The arrays
   * are read positionally by everything downstream.
   */
  const mean: number[] = [];
  const range: number[] = [];
  for (const block of printed.split(/frame:\d+/).slice(1)) {
    const avg = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(block);
    const min = /lavfi\.signalstats\.YMIN=([\d.]+)/.exec(block);
    const max = /lavfi\.signalstats\.YMAX=([\d.]+)/.exec(block);
    if (!avg) continue;
    mean.push(Number(avg[1]) / 255);
    range.push(min && max ? (Number(max[1]) - Number(min[1])) / 255 : 0);
  }
  return { mean, range };
}

async function measureLoudness(
  filePath: string,
): Promise<{ integratedLufs?: number; truePeakDbtp?: number }> {
  const result = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json',
    '-f', 'null',
    '-',
  ]).catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? '' }));

  const stderr = (result as { stderr?: string }).stderr ?? '';
  const jsonMatch = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr);
  if (!jsonMatch) return {};

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { input_i?: string; input_tp?: string };
    return {
      integratedLufs: parsed.input_i ? Number(parsed.input_i) : undefined,
      truePeakDbtp: parsed.input_tp ? Number(parsed.input_tp) : undefined,
    };
  } catch {
    return {};
  }
}

/** Word-level transcript from whisper.cpp, for caption timing and audio QC. */
export interface WhisperWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * The whisper.cpp arguments, kept where they can be asserted.
 *
 * §144. `--split-on-word` is not optional. `--max-len 1` bounds a segment to
 * one *token*, and whisper's tokens are sub-word pieces — so the first live
 * voiceover came back as "Your g ummy bread isn 't under cooked" and
 * "sh ag gy". Two things read that output: the audio gate, which measured a
 * 29.4% word error rate against speech that was word-perfect, and the caption
 * cues, which would have put "g" and "ummy" on screen as separate cards.
 * `--split-on-word` makes the segment boundary a word boundary, which is what
 * both callers already assume.
 */
export function whisperArgs(model: string, wav: string, output: string): string[] {
  return [
    '-m', model,
    '-f', wav,
    '--output-json-full',
    '--max-len', '1',
    '--split-on-word',
    '-of', output,
  ];
}

export async function transcribeWords(audioPath: string): Promise<WhisperWord[]> {
  const model = process.env.WHISPER_MODEL_PATH ?? '/opt/models/ggml-base.en.bin';
  const dir = await mkdtemp(path.join(tmpdir(), 'halyard-whisper-'));
  const output = path.join(dir, 'out');

  try {
    // 16 kHz mono WAV is the only input whisper.cpp accepts.
    const wav = path.join(dir, 'audio.wav');
    await execFileAsync('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav]);

    await execFileAsync('whisper-cli', whisperArgs(model, wav, output));

    const parsed = JSON.parse(await readFile(`${output}.json`, 'utf8')) as {
      transcription?: Array<{ text: string; offsets?: { from: number; to: number } }>;
    };

    return (parsed.transcription ?? [])
      .filter((segment) => segment.text.trim().length > 0)
      .map((segment) => ({
        text: segment.text.trim(),
        startSeconds: (segment.offsets?.from ?? 0) / 1000,
        endSeconds: (segment.offsets?.to ?? 0) / 1000,
      }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Where to sample frames, given how long the video is.
 *
 * Weighted heavily toward the opening, because that is where the audience is
 * won or lost: 71% of viewers decide in the first few seconds, and 63% of the
 * highest click-through videos hook within three. Sampling evenly across a
 * 26-second video would put one frame in the window that decides everything.
 *
 * Three in the hook, three across the body, and never past the end.
 */
export function frameSampleTimes(durationSeconds: number): number[] {
  const hook = [0, 0.8, 2].filter((t) => t < durationSeconds);
  const bodyStart = 3;
  const body: number[] = [];
  if (durationSeconds > bodyStart) {
    const span = durationSeconds - bodyStart;
    for (let i = 1; i <= 3; i += 1) {
      const at = bodyStart + (span * i) / 4;
      if (at < durationSeconds) body.push(Number(at.toFixed(2)));
    }
  }
  return [...hook, ...body];
}

export interface SampledFrame {
  atSeconds: number;
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Pull real frames out of a rendered video, as PNG bytes.
 *
 * Seeks per frame rather than decoding the whole file: six seeks on a
 * thirty-second video is faster than one full decode, and the accuracy of
 * `-ss` before `-i` is good enough for a frame that is going to be described in
 * a sentence.
 *
 * Returns whatever it managed to extract. A frame that fails to decode is
 * skipped rather than fatal, and the coherence gate reports `skipped` when the
 * result is empty — an unmeasured render must never read as a coherent one.
 */
export async function sampleFrames(
  filePath: string,
  atSeconds: number[],
): Promise<SampledFrame[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'halyard-frames-'));
  const frames: SampledFrame[] = [];

  try {
    for (const at of atSeconds) {
      const out = path.join(dir, `frame-${at.toFixed(2)}.png`);
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-loglevel', 'error',
          '-ss', String(at),
          '-i', filePath,
          '-frames:v', '1',
          // Downscaled on the way out. A describer does not need 1080p, and the
          // bytes are base64'd into a request body where size is latency.
          '-vf', 'scale=512:-2',
          out,
        ]);
        frames.push({ atSeconds: at, bytes: await readFile(out), mimeType: 'image/png' });
      } catch {
        // One unreadable frame is not a reason to abandon the other five.
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  return frames;
}
