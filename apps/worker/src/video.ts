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
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
/** Font faces are served from here rather than fetched, so renders work offline. */
const PUBLIC_DIR = path.join(RENDER_PACKAGE, 'public');

let bundlePromise: Promise<string> | undefined;

/** Bundle once per process. Concurrent callers await the same promise. */
export function getBundle(): Promise<string> {
  bundlePromise ??= bundle(ENTRY, () => undefined, {
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
  return bundlePromise;
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
  hasAudio: boolean;
}

/**
 * Everything Gate 3 needs, measured from the file rather than assumed from the
 * composition. A render that silently produced 4 frames should fail QC, and it
 * only does if QC reads the output.
 */
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
    streams: Array<{ codec_type: string; width?: number; height?: number }>;
  };

  const video = parsed.streams.find((s) => s.codec_type === 'video');
  const hasAudio = parsed.streams.some((s) => s.codec_type === 'audio');

  const probe: VideoProbe = {
    durationSeconds: Number(parsed.format.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    frameLuminance: await sampleLuminance(filePath),
    hasAudio,
  };

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
async function sampleLuminance(filePath: string, samples = 12): Promise<number[]> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-vf', `fps=${samples}/60,signalstats,metadata=print:file=-`,
    '-f', 'null',
    '-',
  ]).catch((err: { stderr?: string; stdout?: string }) => ({ stderr: err.stderr ?? '', stdout: '' }));

  const values = [...(stderr ?? '').matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) =>
    Number(m[1]) / 255,
  );
  return values.length > 0 ? values : [];
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

export async function transcribeWords(audioPath: string): Promise<WhisperWord[]> {
  const model = process.env.WHISPER_MODEL_PATH ?? '/opt/models/ggml-base.en.bin';
  const dir = await mkdtemp(path.join(tmpdir(), 'halyard-whisper-'));
  const output = path.join(dir, 'out');

  try {
    // 16 kHz mono WAV is the only input whisper.cpp accepts.
    const wav = path.join(dir, 'audio.wav');
    await execFileAsync('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav]);

    await execFileAsync('whisper-cli', [
      '-m', model,
      '-f', wav,
      '--output-json-full',
      '--max-len', '1',
      '-of', output,
    ]);

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
