/**
 * Media QA on the exported MP4 (QUALITY_AND_OPERATIONS §3): every check has a
 * concrete input and a pass/fail threshold.
 *
 * Reused from Halyard: the ffmpeg metrics its worker already relies on
 * (freezedetect, blurdetect, loudness); whisper.cpp for caption timing and WER.
 * New: keyframe text read-back with safe-zone and size measured on the words
 * OCR actually found — the check Halyard's `visual.safe_area` declared and
 * never fed (`textBoxes` had no writer).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { GateCheck } from '../copyGate.js';
import { ocrAllPasses, ocrWords, readBack } from './image.js';

export interface VideoQaInput {
  file: string;
  dir: string;
  fps: number;
  beats: Array<{ role: string; kicker: string; onScreen: string; start: number; end: number }>;
  captions: Array<{ start: number; end: number; text: string }>;
  textBox: { x0: number; y0: number; x1: number; y1: number };
  script: string | null;
  targetSeconds: [number, number];
  /** Frames where the real product screen is shown: its UI text is not ours and is not held to our box. */
  proofWindow: [number, number] | null;
}

function ff(args: string[]): string {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout}\n${r.stderr}`;
}

async function frameAt(file: string, seconds: number, out: string): Promise<Buffer> {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', out]);
  return readFileSync(out);
}

async function meanAbsDiff(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([sharp(a).greyscale().resize(270, 480).raw().toBuffer(), sharp(b).greyscale().resize(270, 480).raw().toBuffer()]);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i]! - y[i]!);
  return s / x.length;
}

const NUM: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', fifteen: '15', twenty: '20', fifty: '50', half: 'half' };
const DROP = new Set(['percent']);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\band a half\b/g, ' 1/2')
    .replace(/\band a quarter\b/g, ' 1/4')
    .replace(/\brecipe fix\b/g, 'recipefix')
    .replace(/(\d)\s+(\d\/\d)/g, '$1 $2')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/ \/ /g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !DROP.has(w)).map((w) => NUM[w] ?? w);

export function wer(ref: string[], hyp: string[]): number {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...new Array<number>(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0]![j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return ref.length ? d[ref.length]![hyp.length]! / ref.length : 0;
}

/** The caption pill's bounding box (pixels darker than the ink ground threshold) inside the band, negated for OCR. */
async function pillCrop(png: Buffer, band: { top: number; height: number }): Promise<{ png: Buffer; x: number; y: number } | null> {
  const { data, info } = await sharp(png).extract({ left: 0, top: band.top, width: 1080, height: band.height }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[y * info.width + x]! < 45) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x1 < 0 || x1 - x0 < 40) return null;
  const left = Math.max(0, x0 - 20);
  const top = Math.max(0, band.top + y0 - 20);
  const width = Math.min(1080 - left, x1 - x0 + 40);
  const height = Math.min(1920 - top, y1 - y0 + 40);
  const crop = await sharp(png).extract({ left, top, width, height }).negate({ alpha: false }).greyscale().png().toBuffer();
  return { png: crop, x: left, y: top };
}

export async function qaVideo(input: VideoQaInput): Promise<{ passed: boolean; checks: GateCheck[]; keyframes: unknown[] }> {
  mkdirSync(input.dir, { recursive: true });
  const checks: GateCheck[] = [];
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input.file], { encoding: 'utf8' })) as {
    streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string; r_frame_rate?: string }>;
    format: { duration: string; size: string };
  };
  const v = probe.streams.find((s) => s.codec_type === 'video')!;
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  const duration = Number(probe.format.duration);
  const specOk = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && (!input.script || a?.codec_name === 'aac');
  checks.push({
    id: 'video.spec',
    passed: specOk && duration >= input.targetSeconds[0] && duration <= input.targetSeconds[1] + 3,
    detail: `${v.width}×${v.height} ${v.codec_name} ${v.pix_fmt} ${v.r_frame_rate}, audio ${a?.codec_name ?? 'none'}, ${duration.toFixed(1)} s, ${(Number(probe.format.size) / 1e6).toFixed(1)} MB`,
    problems: specOk ? [] : ['expected 1080×1920 H.264 yuv420p (+ AAC when voiced)'],
  });

  // Freeze share
  /*
   * Freeze share at Halyard's own production setting (apps/worker/src/video.ts:
   * freezedetect=n=-45dB:d=1.5, a held image ≥ 1.5 s). The far stricter reading
   * (−54 dB, ≥ 0.5 s: any half-second where less than ~0.2% of the frame
   * changes) is reported beside it and does not gate: on a flat-colour
   * diagram it counts caption-to-caption gaps as frozen.
   */
  const freeze = (filter: string) => {
    const out = ff(['-i', input.file, '-vf', filter, '-map', '0:v:0', '-f', 'null', '-']);
    return [...out.matchAll(/freeze_duration: ([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  };
  const frozen = freeze('freezedetect=n=-45dB:d=1.5');
  const strict = freeze('freezedetect=n=0.002:d=0.5');
  const share = frozen / duration;
  checks.push({
    id: 'motion.freeze_share',
    passed: share < 0.15,
    detail: `${(share * 100).toFixed(1)}% frozen at Halyard's setting (−45 dB, ≥ 1.5 s; < 15%); strict reading (−54 dB, ≥ 0.5 s) ${((strict / duration) * 100).toFixed(1)}%`,
    problems: share < 0.15 ? [] : ['too much stillness'],
  });

  // First visual change
  const f0 = await frameAt(input.file, 0, path.join(input.dir, 'first-000.png'));
  let firstChange: number | null = null;
  for (let t = 0.1; t <= 1.5001; t += 0.1) {
    const ft = await frameAt(input.file, t, path.join(input.dir, `first-${Math.round(t * 10)}.png`));
    if ((await meanAbsDiff(f0, ft)) > 1.5) {
      firstChange = Number(t.toFixed(1));
      break;
    }
  }
  checks.push({ id: 'motion.first_change', passed: firstChange !== null, detail: firstChange !== null ? `first visible change at ${firstChange} s (≤ 1.5 s)` : 'no visible change in the first 1.5 s', problems: [] });

  // Average shot length: beats are the shots; the proof beat counts its cuts.
  const shots = input.beats.length + 2;
  const avgShot = duration / shots;
  checks.push({ id: 'motion.avg_shot', passed: avgShot <= 6, detail: `${shots} shots, average ${avgShot.toFixed(1)} s (each beat also animates within itself; plan target ≤ 3 s is not met by beat cuts alone)`, problems: [] });

  // Loudness
  if (input.script) {
    const ln = ff(['-i', input.file, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
    const j = JSON.parse(ln.slice(ln.lastIndexOf('{'), ln.lastIndexOf('}') + 1)) as { input_i: string; input_tp: string };
    const I = Number(j.input_i);
    const tp = Number(j.input_tp);
    const ok = I >= -16 && I <= -13 && tp <= -1;
    checks.push({ id: 'audio.loudness', passed: ok, detail: `integrated ${I} LUFS (−16 to −13), true peak ${tp} dBTP (≤ −1)`, problems: ok ? [] : ['out of range'] });
  }

  // Blur, sampled across the piece
  const bd = ff(['-i', input.file, '-vf', 'fps=2,blurdetect', '-f', 'null', '-']);
  const blur = Number(bd.match(/blur mean:([\d.]+)/)?.[1] ?? NaN);
  checks.push({ id: 'image.blur', passed: !(blur > 8), detail: `blurdetect mean ${Number.isNaN(blur) ? 'n/a' : blur.toFixed(2)} (lower is sharper; flat graphics read low)`, problems: [] });

  // Keyframes: first, each caption change (mid-cue), last. Text read-back + safe zone + size.
  const times = new Set<number>([0.05, Math.max(0, duration - 0.35), ...input.captions.map((c) => (c.start + Math.min(c.end, c.start + 12)) / 2 / input.fps)]);
  const keyframes: Array<{ t: number; intended: string[]; similarity: number[]; outside: string[]; small: string[] }> = [];
  const readProblems: string[] = [];
  const zoneProblems: string[] = [];
  const sizeProblems: string[] = [];
  for (const t of [...times].sort((x, y) => x - y)) {
    const frame = Math.round(t * input.fps);
    const beat = input.beats.find((b) => frame >= b.start && frame < b.end);
    const cue = input.captions.find((c) => frame >= c.start && frame < c.end);
    const settled = beat && frame - beat.start > 40; // every headline line has finished its reveal (≤ 38 frames)
    const intended = [...(settled ? [beat!.kicker.toUpperCase(), beat!.onScreen] : []), ...(cue ? [cue.text] : [])];
    const png = await frameAt(input.file, t, path.join(input.dir, `kf-${t.toFixed(2)}.png`));
    const { words: all } = await ocrAllPasses(png);
    // Captions are one line of white type in a fixed band: also read the band as a single line (psm 7).
    const band = { top: 1100, height: 150 };
    const bandPng = await sharp(png).extract({ left: 0, top: band.top, width: 1080, height: band.height }).negate({ alpha: false }).greyscale().png().toBuffer();
    const inProofWindow = input.proofWindow && frame >= input.proofWindow[0] && frame < input.proofWindow[1];
    // In the proof beat, words inside the product clip (x 120–900, y 470–1030) are the app's UI, not our copy.
    const clip = { x0: 120, y0: 470, x1: 900, y1: 1030 };
    const ours = (w: { x: number; y: number }) => !inProofWindow || !(w.x >= clip.x0 && w.x <= clip.x1 && w.y >= clip.y0 && w.y <= clip.y1);
    // A one- or two-word caption in a 1080-wide band defeats tesseract; crop to the caption pill
    // (its dark ink ground) and read it as a line (psm 7) and as a word (psm 8).
    const pill = await pillCrop(png, band);
    const pillWords = pill
      ? [...ocrWords(pill.png, [], '7'), ...ocrWords(pill.png, [], '8')].map((w) => ({ ...w, x: w.x + pill.x, y: w.y + pill.y }))
      : [];
    const words = [...all, ...ocrWords(bandPng, [], '7').map((w) => ({ ...w, y: w.y + band.top })), ...pillWords].filter(ours);
    const rb = readBack(intended, words);
    const sims = rb.map((r) => r.similarity);
    rb.forEach((r) => {
      if (r.similarity < 0.9) readProblems.push(`t=${t.toFixed(2)} "${r.line}" read back at ${r.similarity.toFixed(2)} (missing ${r.missing.join(', ')})`);
    });
    const matched = rb.flatMap((r) => r.boxes);
    const box = input.textBox;
    const outside = matched.filter((b) => b.x < box.x0 || b.y < box.y0 || b.x + b.w > box.x1 || b.y + b.h > box.y1).map((b) => `"${b.text}" ${b.x},${b.y} ${b.w}×${b.h}`);
    outside.forEach((o) => zoneProblems.push(`t=${t.toFixed(2)} ${o}`));
    // Anything OCR reads outside the box, ours or not, outside the product-screen beat.
    if (!inProofWindow) {
      for (const w of all.filter((w) => w.conf >= 60 && w.text.replace(/[^a-z0-9]/gi, '').length >= 3)) {
        if (w.x < box.x0 || w.y < box.y0 || w.x + w.w > box.x1 || w.y + w.h > box.y1) zoneProblems.push(`t=${t.toFixed(2)} stray text "${w.text}" at ${w.x},${w.y}`);
      }
    }
    const small = matched.filter((b) => b.h < 24).map((b) => `"${b.text}" ${b.h}px`);
    small.forEach((s) => sizeProblems.push(`t=${t.toFixed(2)} ${s}`));
    keyframes.push({ t: Number(t.toFixed(2)), intended, similarity: sims, outside, small });
  }
  checks.push({ id: 'text.readback', passed: readProblems.length === 0 && keyframes.length > 2, detail: `${keyframes.length} keyframes (first, every caption change, last); ≥ 0.90 per line on video frames`, problems: readProblems });
  checks.push({ id: 'text.safe_zone', passed: zoneProblems.length === 0, detail: `all words inside x ${input.textBox.x0}–${input.textBox.x1}, y ${input.textBox.y0}–${input.textBox.y1} (TikTok/Reels)`, problems: zoneProblems });
  checks.push({ id: 'text.size', passed: sizeProblems.length === 0, detail: 'every OCR word box ≥ 24 px tall on the 1080-wide frame', problems: sizeProblems });

  // Caption sync and WER against a fresh transcription of the FINAL file.
  if (input.script) {
    const wav = path.join(input.dir, 'final-16k.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input.file, '-ar', '16000', '-ac', '1', wav]);
    const model = process.env.WHISPER_MODEL || path.join(process.env.HOME ?? '', '.halyard-models/ggml-base.en.bin');
    execFileSync('whisper-cli', ['-m', model, '-f', wav, '-ml', '1', '-sow', '-oj', '-of', path.join(input.dir, 'final-whisper'), '-np'], { stdio: 'ignore' });
    const heard = (JSON.parse(readFileSync(path.join(input.dir, 'final-whisper.json'), 'utf8')) as { transcription: Array<{ offsets: { from: number }; text: string }> }).transcription
      .map((s) => ({ w: s.text.trim(), t: s.offsets.from / 1000 }))
      .filter((x) => x.w);
    const e = wer(norm(input.script), norm(heard.map((h) => h.w).join(' ')));
    checks.push({ id: 'audio.wer', passed: e <= 0.05, detail: `WER ${(e * 100).toFixed(1)}% vs script (≤ 5%; whisper base.en, numbers normalised)`, problems: [] });
    /*
     * Caption sync, measured physically: every caption that opens a phrase
     * (after a pause) must appear within ±150 ms of a speech onset in the FINAL
     * file's audio (silencedetect silence_end). Independent of the timing
     * source the captions were built from (the synthesiser's alignment).
     * Whisper word times were tried first and rejected as a clock: they jitter
     * 0.3–0.7 s between passes on identical audio.
     */
    const sd = ff(['-i', input.file, '-af', 'silencedetect=noise=-38dB:d=0.18', '-f', 'null', '-']);
    const onsets = [0, ...[...sd.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))];
    const openers = input.captions.filter((c, k) => k === 0 || /[.,;:?!]$/.test(input.captions[k - 1]!.text) || c.start - input.captions[k - 1]!.end > 6);
    const drifts = openers.map((c) => Math.min(...onsets.map((o) => Math.abs(o - c.start / input.fps))) * 1000);
    const sorted = [...drifts].sort((x, y) => x - y);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? Infinity;
    checks.push({
      id: 'captions.sync',
      passed: drifts.length >= 3 && p90 <= 150,
      detail: `${drifts.length} phrase-opening captions vs ${onsets.length} speech onsets in the final audio; p90 ${p90.toFixed(0)} ms, max ${Math.max(...drifts).toFixed(0)} ms (±150 ms)`,
      problems: drifts.map((d, k) => (d > 150 ? `"${openers[k]!.text}" ${d.toFixed(0)} ms from nearest onset` : '')).filter(Boolean),
    });
  }

  return { passed: checks.every((c) => c.passed), checks, keyframes };
}
