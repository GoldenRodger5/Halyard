/**
 * The studio: what every format shares, once.
 *
 *   run dir → assets into public/ → voice (cached, ledgered) → bundle → render
 *   video + stills → loudness → QA (OCR read-back, safe box, contrast, LUFS,
 *   duration) → contact sheet → record.json + preview.html
 *
 * A format (quiz, recipe, …) only decides WHAT is on screen and when.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { sha256 } from './assets.js';
import { Ledger } from './ledger.js';
import { LEDGER_FILE, REPO_ROOT, RUNS_DIR, SPEND_CAP_USD } from './runContext.js';
import { synthWithTimestamps, type TimedWord } from './makeShort.js';
import { qaStill, tokens } from './qa/image.js';
import { wer } from './qa/video.js';
import type { GateCheck } from './copyGate.js';

export const FPS = 30;
export const SAFE = { x0: 120, y0: 270, x1: 900, y1: 1250 };
export const RECIPEFIX_REPO = '/Users/isaacmineo/PROJECT_2025/recipe-fix';
/** Photos and the logo are read at this RecipeFix commit (main, released 2026-10-26). */
export const RECIPEFIX_REF = 'a82f8bb9aff1cea7d5539156c807faa2602c9e29';
const ELEVENLABS_USD_PER_1K = Number(process.env.ELEVENLABS_USD_PER_1K_CHARS || 0.22);
const VO_CACHE = path.join(RUNS_DIR, '_cache', 'vo');

export interface Studio {
  id: string;
  dir: string;
  pub: string;
  ledger: Ledger;
  assets: Array<{ id: string; provenance: string; licence: string; sha256: string }>;
}

/** Local calendar date: a run made at 8 pm is today's run, not tomorrow's UTC one. */
export const localDate = () => new Date().toLocaleDateString('en-CA');

export function openStudio(kind: string, id: string, date = localDate()): Studio {
  const runId = `${kind}-${id}`;
  const dir = path.join(RUNS_DIR, date, runId);
  const pub = path.join(dir, 'public');
  mkdirSync(path.join(pub, 'fonts'), { recursive: true });
  mkdirSync(path.join(pub, 'brand'), { recursive: true });
  for (const f of ['Inter-Regular.woff', 'Inter-SemiBold.woff', 'InstrumentSerif-Regular.ttf']) {
    copyFileSync(path.join(REPO_ROOT, 'packages/render/assets/fonts', f), path.join(pub, 'fonts', f));
  }
  // Lilita One (SIL OFL), the chunky display face quiz channels use; from @fontsource/lilita-one.
  copyFileSync(path.join(path.dirname(require.resolve('@fontsource/lilita-one/package.json')), 'files/lilita-one-latin-400-normal.woff2'), path.join(pub, 'fonts', 'LilitaOne.woff2'));
  const s: Studio = { id: runId, dir, pub, ledger: new Ledger(LEDGER_FILE, SPEND_CAP_USD), assets: [] };
  const mark = gitBytes('LAUNCH_KIT/assets/brand/recipefix-mark-512.png');
  writeFileSync(path.join(pub, 'brand/recipefix-mark-512.png'), mark);
  s.assets.push({ id: 'brand/recipefix-mark-512.png', provenance: `recipe-fix ${RECIPEFIX_REF.slice(0, 8)}:LAUNCH_KIT/assets/brand/recipefix-mark-512.png`, licence: 'first-party brand mark', sha256: sha256(mark) });
  return s;
}

export function gitBytes(file: string, ref = RECIPEFIX_REF): Buffer {
  return execFileSync('git', ['-C', RECIPEFIX_REPO, 'show', `${ref}:${file}`], { maxBuffer: 64 * 1024 * 1024 });
}

/**
 * An Original's licensed stock photo, cropped to a vertical 9:16 from the
 * 1600² master (centre column; no upscale beyond the cover fit).
 */
export async function originalPhoto(s: Studio, originalId: string, shape: 'tall' | 'wide' = 'tall'): Promise<string> {
  if (shape === 'wide') {
    const out = `photo-${originalId}-16x9.jpg`;
    const file = path.join(s.pub, out);
    if (!existsSync(file)) {
      const bytes = gitBytes(`public/images/originals/${originalId}-16x9.webp`);
      await sharp(bytes).jpeg({ quality: 92 }).toFile(file);
      s.assets.push({ id: out, provenance: `recipe-fix ${RECIPEFIX_REF.slice(0, 8)}:public/images/originals/${originalId}-16x9.webp`, licence: 'Licensed stock (Unsplash/Pexels) per RecipeFix docs/RECIPEFIX_ORIGINALS.md; never "our photo"', sha256: sha256(bytes) });
    }
    return out;
  }
  const out = `photo-${originalId}.jpg`;
  const file = path.join(s.pub, out);
  if (!existsSync(file)) {
    const bytes = gitBytes(`public/images/originals/${originalId}-1x1.webp`);
    const meta = await sharp(bytes).metadata();
    const h = meta.height!;
    const w = Math.round((h * 9) / 16);
    await sharp(bytes)
      .extract({ left: Math.round((meta.width! - w) / 2), top: 0, width: w, height: h })
      .jpeg({ quality: 92 })
      .toFile(file);
    s.assets.push({
      id: out,
      provenance: `recipe-fix ${RECIPEFIX_REF.slice(0, 8)}:public/images/originals/${originalId}-1x1.webp, centre 9:16 crop`,
      licence: 'Licensed stock (Unsplash/Pexels) per RecipeFix docs/RECIPEFIX_ORIGINALS.md; never "our photo"',
      sha256: sha256(bytes),
    });
  }
  return out;
}

export interface Voice {
  file: string;
  seconds: number;
  words: TimedWord[];
}

/** ElevenLabs, cached by exact text: the same words are never paid for twice. */
export async function voice(s: Studio, text: string, name: string): Promise<Voice> {
  mkdirSync(VO_CACHE, { recursive: true });
  const key = sha256(`${process.env.ELEVENLABS_VOICE_ID}|eleven_multilingual_v2|${text}`).slice(0, 24);
  const mp3 = path.join(VO_CACHE, `${key}.mp3`);
  const align = path.join(VO_CACHE, `${key}.json`);
  if (!existsSync(mp3) || !existsSync(align)) {
    const est = (text.length / 1000) * ELEVENLABS_USD_PER_1K;
    s.ledger.assertCanSpend(est);
    const { audio, words } = await synthWithTimestamps(text);
    writeFileSync(mp3, audio);
    writeFileSync(align, JSON.stringify({ text, words }));
    s.ledger.record({
      run: s.id,
      provider: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      purpose: `voice: ${name}`,
      units: { characters: text.length },
      usd: Number(est.toFixed(4)),
      basis: `characters × $${ELEVENLABS_USD_PER_1K}/1k (plan-dependent estimate)`,
    });
  }
  const out = `vo-${name}.mp3`;
  copyFileSync(mp3, path.join(s.pub, out));
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], { encoding: 'utf8' }));
  return { file: out, seconds, words: (JSON.parse(readFileSync(align, 'utf8')) as { words: TimedWord[] }).words };
}

/** Countdown tick and reveal chime, synthesised here: no licence question. */
export function sfx(s: Studio): { tick: string; reveal: string; whoosh: string } {
  const tick = path.join(s.pub, 'sfx-tick.wav');
  const reveal = path.join(s.pub, 'sfx-reveal.wav');
  if (!existsSync(tick))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1250:duration=0.06', '-af', 'afade=t=out:st=0.01:d=0.05,volume=0.9', '-ar', '48000', tick]);
  if (!existsSync(reveal))
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.7',
      '-f', 'lavfi', '-i', 'sine=frequency=1318.5:duration=0.7',
      '-filter_complex', '[1]adelay=90|90[b];[0][b]amix=inputs=2:normalize=0,afade=t=out:st=0.05:d=0.65,volume=0.8',
      '-ar', '48000', reveal,
    ]);
  const whoosh = path.join(s.pub, 'sfx-whoosh.wav');
  if (!existsSync(whoosh))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.35:amplitude=0.6', '-af', 'highpass=f=400,lowpass=f=5000,afade=t=in:d=0.12,afade=t=out:st=0.15:d=0.2,volume=0.7', '-ar', '48000', whoosh]);
  return { tick: 'sfx-tick.wav', reveal: 'sfx-reveal.wav', whoosh: 'sfx-whoosh.wav' };
}

const bundles = new Map<string, string>();
async function serveUrl(pub: string): Promise<string> {
  if (!bundles.has(pub)) {
    bundles.set(
      pub,
      await bundle({
        entryPoint: path.join(REPO_ROOT, 'packages/marketing/video/entry.tsx'),
        publicDir: pub,
        // The webpack cache served a stale component once (2026-10-26): a render must use the code on disk.
        enableCaching: false,
        webpackOverride: (config) => ({
          ...config,
          resolve: { ...config.resolve, extensionAlias: { ...(config.resolve?.extensionAlias ?? {}), '.js': ['.ts', '.tsx', '.js'] } },
        }),
      }),
    );
  }
  return bundles.get(pub)!;
}

/** Render, then normalise loudness to −14 LUFS / −2 dBTP (video re-encoded once at CRF 17). */
export async function renderVideo(s: Studio, compositionId: string, props: Record<string, unknown>, frames: number, out: string): Promise<string> {
  const url = await serveUrl(s.pub);
  const composition = await selectComposition({ serveUrl: url, id: compositionId, inputProps: props });
  const raw = path.join(s.dir, `${out}.raw.mp4`);
  await renderMedia({
    serveUrl: url,
    composition: { ...composition, durationInFrames: frames },
    codec: 'h264',
    crf: 16,
    outputLocation: raw,
    inputProps: props,
    chromiumOptions: { gl: 'swangle' },
    concurrency: Number(process.env.MK_RENDER_CONCURRENCY || 4),
    timeoutInMilliseconds: 120_000,
  });
  const file = path.join(s.dir, `${out}.mp4`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-2:LRA=11',
    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', file,
  ]);
  execFileSync('rm', ['-f', raw]);
  return file;
}

export async function renderStills(s: Studio, compositionId: string, props: Record<string, unknown>, frames: number[], prefix: string): Promise<string[]> {
  const url = await serveUrl(s.pub);
  const composition = await selectComposition({ serveUrl: url, id: compositionId, inputProps: props });
  const files: string[] = [];
  for (const [i, frame] of frames.entries()) {
    const png = path.join(s.dir, `${prefix}-${i + 1}.png`);
    await renderStill({ serveUrl: url, composition: { ...composition, durationInFrames: Math.max(frame + 1, composition.durationInFrames) }, frame, output: png, inputProps: props, chromiumOptions: { gl: 'swangle' } });
    // Instagram publishing takes JPEG only.
    const jpg = png.replace(/\.png$/, '.jpg');
    await sharp(png).jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toFile(jpg);
    files.push(jpg);
  }
  return files;
}

export function frameAt(file: string, seconds: number, out: string): Buffer {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', out]);
  return readFileSync(out);
}

/** Integrated loudness and true-ish peak of the exported file (ffmpeg ebur128 prints to stderr). */
export function loudnessChecked(file: string): { lufs: number; peak: number } {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = String(r.stderr ?? '');
  const tail = log.slice(log.lastIndexOf('Summary'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]), peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]) };
}

/** Whisper the exported audio back and compare it with what the narrator was given. */
export function transcriptCheck(s: Studio, file: string, script: string): GateCheck {
  const wav = path.join(s.dir, 'qa-frames', 'audio.wav');
  mkdirSync(path.dirname(wav), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-ar', '16000', '-ac', '1', wav]);
  const model = process.env.WHISPER_MODEL || path.join(process.env.HOME ?? '', '.halyard-models/ggml-base.en.bin');
  const heard = execFileSync('whisper-cli', ['-m', model, '-f', wav, '-np'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .replace(/\[[^\]]*\]\s*/g, ' ')
    .replace(/recipe fix/gi, 'RecipeFix')
    .replace(/\s+/g, ' ')
    .trim();
  // Whisper base.en homophones for kitchen words; number words handled by tokens().
  const H: Record<string, string> = { seer: 'sear', seared: 'seared', sere: 'sear', four: '4', thyme: 'thyme', time: 'time' };
  const norm = (x: string) => tokens(x).map((w) => H[w] ?? w);
  const e = wer(norm(script), norm(heard));
  return check('audio.transcript', e <= 0.08, `WER ${(e * 100).toFixed(1)}% between script and whisper of the export`, [`heard: ${heard.slice(0, 300)}`]);
}

export function duration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
}

/** Frames every `step` seconds tiled into one image, for a human (or me) to look at. */
export function contactSheet(file: string, out: string, step = 1.5): void {
  const d = duration(file);
  const n = Math.ceil(d / step);
  const cols = Math.min(6, n);
  const rows = Math.ceil(n / cols);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${step},scale=270:-1,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', out]);
}

/** OCR read-back of the frame at `t`: every intended line must read, inside the safe box, at contrast. */
export async function qaFrame(s: Studio, file: string, t: number, label: string, intended: Array<string | { text: string; min?: number }>, canvas = { width: 1080, height: 1920 }, safe = SAFE) {
  mkdirSync(path.join(s.dir, 'qa-frames'), { recursive: true });
  const png = file.endsWith('.mp4') ? frameAt(file, t, path.join(s.dir, 'qa-frames', `${label}.png`)) : readFileSync(file);
  // OCR cannot read a lone glyph ("9", "8") reliably; such a line is recorded but not held to the read-back bar.
  const lines = intended.map((l) => (typeof l === 'string' ? { text: l } : l)).map((l) => (l.text.replace(/\W/g, '').length <= 2 ? { ...l, min: 0 } : l));
  const r = await qaStill({ png, intended: lines, safeBox: safe, canvas, minWordHeight: 22, label });
  return r.checks.map((c) => ({ ...c, id: `${label}:${c.id}` }));
}

export function check(id: string, passed: boolean, detail: string, problems: string[] = []): GateCheck {
  return { id, passed, detail, problems: passed ? problems : problems.length ? problems : [detail] };
}

/**
 * Text that reads like a person wrote it (owner rule 2026-10-26): no em
 * dashes, no spaced en dashes as punctuation, none of the stock phrases that
 * mark copy as generated. Applies to on-screen text and captions alike.
 */
const AI_TELLS = [/\belevate\b/i, /game[- ]changer/i, /\bunlock\b/i, /dive (in|into)/i, /\bdelve\b/i, /\bseamless(ly)?\b/i, /\brevolutioni[sz]e/i, /\bembark\b/i, /\btapestry\b/i, /\bunleash/i, /look no further/i, /in today's/i, /\bmouthwatering\b/i, /take your .* to the next level/i, /\bjourney\b/i, /not only .* but also/i];
export function humanTextProblems(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    if (t.includes('\u2014')) out.push(`em dash in "${t.slice(0, 60)}"`);
    if (/\s\u2013\s/.test(t)) out.push(`spaced en dash in "${t.slice(0, 60)}"`);
    for (const re of AI_TELLS) if (re.test(t)) out.push(`stock AI phrasing (${re.source}) in "${t.slice(0, 60)}"`);
  }
  return [...new Set(out)];
}

export function writeJson(file: string, v: unknown): void {
  writeFileSync(file, `${JSON.stringify(v, null, 2)}\n`);
}

/** Phone-size preview of everything a run produced, with the captions each platform will get. */
export function writeStudioPreview(s: Studio, record: StudioRecord): void {
  const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rel = (f: string) => path.relative(s.dir, path.resolve(REPO_ROOT, f));
  const media = [
    record.outputs.video ? `<figure><video src="${esc(rel(record.outputs.video))}" controls playsinline loop style="aspect-ratio:9/16"></video><figcaption>video</figcaption></figure>` : '',
    ...(record.outputs.slides ?? []).map((f, i) => `<figure><img src="${esc(rel(f))}"><figcaption>carousel ${i + 1}</figcaption></figure>`),
    ...(record.outputs.tiktok_slides ?? []).map((f, i) => `<figure><img src="${esc(rel(f))}"><figcaption>tiktok photo ${i + 1}</figcaption></figure>`),
  ].join('');
  const posts = Object.entries(record.posts)
    .map(([k, v]) => `<section><h3>${esc(k)}</h3><pre>${esc(v.text)}</pre>${v.thread?.length ? `<p>thread:</p>${v.thread.map((t) => `<pre>${esc(t)}</pre>`).join('')}` : ''}<p class="m">media: ${esc(v.media.join(', ') || 'none')}${v.title ? ` · title: ${esc(v.title)}` : ''}</p></section>`)
    .join('');
  const qa = record.qa.checks.map((c) => `<tr class="${c.passed ? 'ok' : 'bad'}"><td>${c.passed ? 'PASS' : 'FAIL'}</td><td>${esc(c.id)}</td><td>${esc(c.detail)}${c.problems.length ? `<ul>${c.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</td></tr>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(record.id)}</title>
<style>body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:24px;background:#faf7f3;color:#1f1a17}h1{font-size:22px}.grid{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;width:270px}video,img{width:270px;border-radius:12px;background:#000;display:block}figcaption{font-size:12px;color:#60554d}pre{white-space:pre-wrap;background:#fff;border:1px solid #e5dbd0;padding:10px;border-radius:8px;max-width:640px}.m{color:#60554d;font-size:13px}table{border-collapse:collapse;max-width:960px}td{border-top:1px solid #e5dbd0;padding:6px;vertical-align:top}.ok td:first-child{color:#2f8f5b}.bad td:first-child{color:#b3261e;font-weight:600}</style>
<h1>${esc(record.id)} — ${record.qa.passed ? 'QA PASS' : 'QA FAIL'}</h1><p class="m">${esc(record.summary)} · made ${esc(record.made_at)} · run cost $${record.cost_usd.toFixed(3)}</p>
<div class="grid">${media}</div><h2>Posts</h2>${posts}<h2>Sources</h2><ul>${record.sources.map((x) => `<li>${esc(x.name)} — <a href="${esc(x.url)}">${esc(x.url)}</a><br><q>${esc(x.quote)}</q></li>`).join('')}</ul>
<h2>QA</h2><table>${qa}</table><h2>Assets</h2><ul>${record.assets.map((a) => `<li>${esc(a.id)} — ${esc(a.provenance)} (${esc(a.licence)})</li>`).join('')}</ul>`;
  writeFileSync(path.join(s.dir, 'preview.html'), html);
}

export type PlatformKey = 'tiktok' | 'instagram' | 'x' | 'threads' | 'youtube' | 'facebook' | 'pinterest';

export interface PlatformPost {
  platform: PlatformKey;
  text: string;
  /** Repo-relative media files, in order. */
  media: string[];
  kind: 'video' | 'carousel' | 'image' | 'text';
  title?: string;
  /** TikTok cover: the moment the question and options are all on screen. */
  cover_ms?: number;
  /** Follow-up posts in a thread (X, Threads). */
  thread?: string[];
  ai_voice?: boolean;
}

export interface StudioRecord {
  schema: 1;
  id: string;
  format: string;
  summary: string;
  made_at: string;
  outputs: { video?: string; slides?: string[]; tiktok_slides?: string[] };
  /** Keyed by post id (`tiktok`, `tiktok_photos`, `instagram_reel`, …). */
  posts: Record<string, PlatformPost>;
  sources: Array<{ name: string; url: string; quote: string }>;
  claims: string[];
  assets: Studio['assets'];
  qa: { passed: boolean; checks: GateCheck[] };
  cost_usd: number;
  disclosures: Record<string, unknown>;
}

export function runCost(s: Studio): number {
  return s.ledger.entries().filter((e) => e.run === s.id).reduce((a, e) => a + e.usd, 0);
}

export const relRepo = (f: string) => path.relative(REPO_ROOT, f);
