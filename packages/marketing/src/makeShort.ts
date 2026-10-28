/* eslint-disable no-console -- a CLI step: stdout is its interface */
/**
 * `mk make <short idea>`: copy (≤3 model attempts, or a reviewed copy file) →
 * voiceover (ElevenLabs, ledgered) → whisper word timings → beats and captions
 * timed to the voice → real product clips → Remotion render → media QA on the
 * exported MP4 → preview → run record.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { OpenAiLlmClient } from '@halyard/core/generation';
import { runCopyGate, type CopyLine, type GateCheck } from './copyGate.js';
import { systemPrompt, writeCopy, type Attempt } from './copywriter.js';
import { loadLocalAsset, loadProvenancedPhoto, sha256, type AssetRecord } from './assets.js';
import sharp from 'sharp';
import { supportedBy } from './formats/carousel.js';
import { buildRecord, diffCopy, writeBrief } from './makeCarousel.js';
import { openRun, proofExcerpts, readJsonIfExists, REPO_ROOT, writeJson, type ShotSpec } from './runContext.js';
import { writePreview } from './preview.js';
import { qaVideo } from './qa/video.js';

export const FPS = 30;
export const TEXT_BOX = { x0: 120, y0: 270, x1: 900, y1: 1250 };
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(process.env.HOME ?? '', '.halyard-models/ggml-base.en.bin');
/** Halyard's own figure for ElevenLabs (`ELEVENLABS_USD_PER_1K_CHARS`, default $0.22). An estimate, not a bill. */
const ELEVENLABS_USD_PER_1K = Number(process.env.ELEVENLABS_USD_PER_1K_CHARS || 0.22);

export interface ShortCopy {
  beats: Array<{ role: string; kicker: string; on_screen: string; vo: string; source?: string; claim_ids?: string[]; fact_ids?: string[]; /** One-line headline over a real-screen beat (V2). */ head?: string }>;
  caption: string;
  hashtags: string[];
  caption_claim_ids?: string[];
  caption_fact_ids?: string[];
}

const LIMITS = { kicker: 26, on_screen: 46, vo_words: 30, total_words: [78, 112] as [number, number] };

const SCHEMA = `Reply with this JSON object and nothing else:
{
  "beats": [
    {"role":"<role, in the order given>","kicker":"≤${LIMITS.kicker} chars label","on_screen":"≤${LIMITS.on_screen} chars, the line a muted viewer reads","vo":"what the voice says for this beat, one or two short spoken sentences, ≤${LIMITS.vo_words} words","source":"for broil/reduce/simmer: 1 to 3 comma-separated proof paths that support on_screen+vo","claim_ids":[],"fact_ids":[]}
  ],
  "caption": "TikTok caption, 1 to 3 short sentences, useful on its own",
  "hashtags": ["3 to 5 specific tags, no #"],
  "caption_claim_ids": [],
  "caption_fact_ids": []
}
Rules:
- Total spoken words across all beats: ${LIMITS.total_words[0]} to ${LIMITS.total_words[1]} (about 30 to 42 seconds).
- Write the vo to be HEARD: say "one and a half pounds", not "1½ lb"; no symbols, no parentheses, no abbreviations.
- on_screen may use numerals ("1½ lb", "8 to 10 min"). No em dashes, no exclamation marks.
- The first beat's vo starts with the hook in five words or fewer.
- Any sentence that mentions RecipeFix or the app must list a quotable claim id.`;

export function shortLines(copy: ShortCopy): CopyLine[] {
  return copy.beats.flatMap((b, i) => {
    const ids = { claimIds: b.claim_ids ?? [], factIds: b.fact_ids ?? [] };
    return [
      { where: `beat ${i + 1} kicker`, text: b.kicker, ...ids },
      { where: `beat ${i + 1} on-screen`, text: b.on_screen, ...ids },
      { where: `beat ${i + 1} vo`, text: b.vo, ...ids },
      ...(b.head ? [{ where: `beat ${i + 1} head`, text: b.head, ...ids }] : []),
    ];
  });
}

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

export function shortShapeProblems(copy: ShortCopy, roles: string[], proof: Record<string, unknown>, neverShow: string[]): string[] {
  const p: string[] = [];
  if (!Array.isArray(copy.beats)) return ['beats is not an array'];
  const got = copy.beats.map((b) => b.role);
  if (got.join(',') !== roles.join(',')) p.push(`beat roles must be exactly [${roles.join(', ')}], got [${got.join(', ')}]`);
  let total = 0;
  copy.beats.forEach((b, i) => {
    const at = `beat ${i + 1}`;
    if (!b.kicker?.trim() || b.kicker.length > LIMITS.kicker) p.push(`${at} kicker must be 1–${LIMITS.kicker} chars`);
    if (!b.on_screen?.trim() || b.on_screen.length > LIMITS.on_screen) p.push(`${at} on_screen must be 1–${LIMITS.on_screen} chars (got ${b.on_screen?.length ?? 0})`);
    const n = words(b.vo ?? '').length;
    total += n;
    if (n === 0 || n > LIMITS.vo_words) p.push(`${at} vo must be 1–${LIMITS.vo_words} words (got ${n})`);
    if (/[½¼¾()%°/]|\d\s?lb\b|\bmin\b/.test(b.vo ?? '')) p.push(`${at} vo has a symbol or abbreviation a voice cannot say cleanly: "${b.vo}"`);
    if (['broil', 'reduce', 'simmer'].includes(b.role)) {
      const s = supportedBy(`${b.on_screen} ${b.vo}`.replace(/\b(one and a half|eight|ten|fifteen)\b/gi, ''), b.source ?? '', proof);
      if (s) p.push(`${at}: ${s}`);
    }
  });
  if (total < LIMITS.total_words[0] || total > LIMITS.total_words[1]) p.push(`total vo is ${total} words; need ${LIMITS.total_words[0]}–${LIMITS.total_words[1]}`);
  if (!Array.isArray(copy.hashtags) || copy.hashtags.length < 3 || copy.hashtags.length > 5) p.push('hashtags: 3 to 5');
  const flat = JSON.stringify(copy).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  for (const banned of neverShow) if (flat.includes(banned.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())) p.push(`must never show "${banned}"`);
  return p;
}

// ─── timing ──────────────────────────────────────────────────────────────────

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/** whisper.cpp, one word per segment (`-ml 1`), JSON out. */
export function transcribe(wav: string, outBase: string): TimedWord[] {
  execFileSync('whisper-cli', ['-m', WHISPER_MODEL, '-f', wav, '-ml', '1', '-sow', '-oj', '-of', outBase, '-np'], { stdio: 'ignore' });
  const j = JSON.parse(readFileSync(`${outBase}.json`, 'utf8')) as { transcription: Array<{ offsets: { from: number; to: number }; text: string }> };
  return j.transcription
    .map((s) => ({ word: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
    .filter((w) => w.word.length > 0);
}

const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Script words get the times of the heard words they align to (LCS over
 * normalised tokens); unmatched script words are interpolated between their
 * neighbours. Captions then show what was WRITTEN, at the time it was SAID.
 */
export function alignScript(script: string[], heard: TimedWord[]): TimedWord[] {
  const a = script.map(key);
  const b = heard.map((h) => key(h.word));
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] && a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const times: Array<{ start: number; end: number } | null> = new Array(a.length).fill(null);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) {
      times[i] = { start: heard[j]!.start, end: heard[j]!.end };
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  const end = heard.at(-1)?.end ?? 0;
  return script.map((w, k) => {
    if (times[k]) return { word: w, ...times[k]! };
    const prev = [...times.slice(0, k)].reverse().find(Boolean);
    const next = times.slice(k + 1).find(Boolean);
    const s = prev ? prev.end : 0;
    const e = next ? next.start : end;
    return { word: w, start: s, end: Math.max(s + 0.05, e) };
  });
}

export function captionCues(timed: TimedWord[], fps = FPS): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  let group: TimedWord[] = [];
  const flush = () => {
    if (!group.length) return;
    cues.push({ start: Math.round(group[0]!.start * fps), end: Math.round(group.at(-1)!.end * fps), text: group.map((g) => g.word).join(' ') });
    group = [];
  };
  for (const w of timed) {
    const text = [...group, w].map((g) => g.word).join(' ');
    if (group.length && (text.length > 26 || group.length >= 4)) flush();
    group.push(w);
    if (/[.,;:?]$/.test(w.word)) flush();
  }
  flush();
  // Hold each cue until the next one starts (no flicker in pauses shorter than 0.6s).
  for (let k = 0; k < cues.length - 1; k++) if (cues[k + 1]!.start - cues[k]!.end < 18) cues[k]!.end = cues[k + 1]!.start;
  return cues;
}

/**
 * ElevenLabs text-to-speech WITH its character alignment, so caption timing is
 * the synthesiser's own clock rather than a transcription of it (whisper
 * base.en word times jitter 0.3–0.7 s between passes on the same audio).
 */
/** One project voice direction; per-run MK_ overrides support controlled auditions. */
export function voiceDirection() {
  const file = path.join(REPO_ROOT, 'packages/marketing/data/voice-profile.json');
  const profile = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (profile.approval_status === 'hold' && !process.env.MK_ELEVENLABS_VOICE_ID) {
    throw new Error('Project narration is on hold after owner review. Select a replacement voice before batch generation; an explicit MK_ELEVENLABS_VOICE_ID may be used for a controlled audition.');
  }
  const model = process.env.MK_ELEVENLABS_MODEL || profile.model_id || 'eleven_multilingual_v2';
  const voice = process.env.MK_ELEVENLABS_VOICE_ID || profile.voice_id || process.env.ELEVENLABS_VOICE_ID;
  const settings = profile.model_id === model && profile.voice_settings
    ? profile.voice_settings
    : model.startsWith('eleven_v4')
      ? { stability: 0.5, similarity_boost: 0.75 }
      : { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true };
  return { model, voice, settings };
}
export async function synthWithTimestamps(script: string): Promise<{ audio: Buffer; words: TimedWord[] }> {
  const key = process.env.ELEVENLABS_API_KEY;
  const {voice,model,settings}=voiceDirection();
  if (!key || !voice) throw new Error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({text:script,model_id:model,voice_settings:settings}),
  });
  if (!r.ok) throw new Error(`ElevenLabs with-timestamps ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { audio_base64: string; alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
  const a = j.alignment;
  const out: TimedWord[] = [];
  let cur: TimedWord | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { word: '', start: a.character_start_times_seconds[i]!, end: 0 };
    cur.word += ch;
    cur.end = a.character_end_times_seconds[i]!;
  });
  if (cur) out.push(cur);
  return { audio: Buffer.from(j.audio_base64, 'base64'), words: out };
}

// ─── make ────────────────────────────────────────────────────────────────────

const CAPTURES = path.join(REPO_ROOT, 'runs/2026-10-26/captures');
const SCREEN_PROVENANCE =
  'RecipeFix UI at commit e68b1404 (the live tree on 2026-10-26), local production build driven by scripts/journey.mjs with a simulated backend; the adaptation shown is the verbatim stored production result captured 2026-10-21. Real taps and transitions; scroll frames rendered one per frame at true page states (capture.json). runs/2026-10-26/captures-v2/capture.json';

type PlanShot = {
  kind: 'photo-hook' | 'photo-close' | 'clip' | 'still';
  start: number;
  end: number;
  src?: string;
  from?: number;
  crop?: { x: number; y: number; w: number };
  cropYEnd?: number;
};

/** Full-width crop of the 1170-wide captures (page text spans x 48–1122): never cut text horizontally. */
const FULL_WIDTH = { x: 24, w: 1122 };

/**
 * screen-hero: turn each beat's `shots` (idea data) into timed shots over the
 * voice-aligned beat, split by weight. Stills pan 240 px (a slow scroll) unless told otherwise.
 */
export function screenShotPlan(beats: Array<{ role: string; start: number; end: number }>, specs: Array<{ role: string; shots?: ShotSpec[] }>): PlanShot[] {
  const out: PlanShot[] = [];
  for (const b of beats) {
    const shots = specs.find((s) => s.role === b.role)?.shots ?? [];
    if (!shots.length) throw new Error(`beat '${b.role}' has no shots in the idea`);
    const total = shots.reduce((a, s) => a + (s.weight ?? 1), 0);
    let t = b.start;
    shots.forEach((s, i) => {
      const end = i === shots.length - 1 ? b.end : Math.round(t + ((b.end - b.start) * (s.weight ?? 1)) / total);
      const kind = s.kind ?? (s.src?.endsWith('.mp4') ? 'clip' : 'still');
      out.push(
        kind === 'photo-hook' || kind === 'photo-close'
          ? { kind, start: t, end }
          : { kind, start: t, end, src: s.src!, from: s.from ?? 0, crop: { ...FULL_WIDTH, y: s.y ?? 0 }, cropYEnd: s.yEnd ?? (s.y ?? 0) + (kind === 'still' ? 240 : 160) },
      );
      t = end;
    });
  }
  return out;
}

/**
 * The proof beat shows the app's own "RecipeFix changed this step" boxes,
 * cropped from the 3× captures (1170×2532) of the same session as the screen
 * recording. Round-1 critique: the 2× recording at full width put the step
 * text at ~30 px and started mid-sentence; a crop of the note box alone is
 * ~37 px and starts on its first line. Boxes located by OCR on each capture.
 */
const PROOF_NOTES = [
  { file: 'recipefix-adapt-b2-broiler-note.png', step: 4, crop: { left: 175, top: 1490, width: 960, height: 420 } },
  { file: 'recipefix-adapt-b1-tomato-sauce-note.png', step: 3, crop: { left: 175, top: 1045, width: 960, height: 410 } },
];

export async function makeShort(ideaId: string, opts: { copyFile?: string; date?: string; voice: boolean }): Promise<void> {
  const ctx = openRun(ideaId, opts.date);
  const { idea } = ctx;
  writeBrief(ctx);
  const roles = (idea.beats ?? []).map((b) => b.role);
  const pub = path.join(ctx.dir, 'public');
  mkdirSync(path.join(pub, 'fonts'), { recursive: true });

  const gate = (copy: ShortCopy): string[] => {
    const shape = shortShapeProblems(copy, roles, ctx.proof, idea.never_show);
    if (shape.some((s) => s.startsWith('beat roles') || s === 'beats is not an array')) return shape;
    const g = runCopyGate({
      pack: ctx.pack,
      lines: shortLines(copy),
      caption: { text: copy.caption, hashtags: copy.hashtags, platform: 'tiktok', claimIds: copy.caption_claim_ids, factIds: copy.caption_fact_ids },
      proofText: JSON.stringify(ctx.proof),
      factSources: idea.fact_sources,
      productTerms: ctx.ideas.product_terms,
    });
    return [...shape, ...g.checks.filter((c) => !c.passed).flatMap((c) => c.problems.filter((p) => !p.startsWith('warning')).map((p) => `${c.id}: ${p}`))];
  };

  // ── Copy ──
  let copy: ShortCopy;
  let modelCopy: ShortCopy | null;
  let attempts: Attempt<ShortCopy>[];
  let copySource: string;
  const modelFile = path.join(ctx.dir, 'copy-model.json');
  if (opts.copyFile) {
    copy = JSON.parse(readFileSync(opts.copyFile, 'utf8')) as ShortCopy;
    const m = readJsonIfExists<{ accepted: ShortCopy; attempts: Attempt<ShortCopy>[] }>(modelFile);
    modelCopy = m?.accepted ?? null;
    attempts = m?.attempts ?? [];
    copySource =
      modelCopy && diffCopy(modelCopy, copy).length === 0
        ? `model (${attempts.at(-1)?.model}), accepted on attempt ${attempts.length}; re-rendered without a new call`
        : `reviewed copy file ${path.relative(REPO_ROOT, opts.copyFile)}`;
    const problems = gate(copy);
    if (problems.length) throw new Error(`Copy fails the gates:\n- ${problems.join('\n- ')}`);
  } else {
    const paths = ['ingredients[0]', 'steps[3].instruction', 'steps[3].updated_note', 'steps[4].instruction', 'steps[4].updated_note', 'steps[5].updated_note', 'explanations[2]'];
    const user = [
      `POST: ${idea.question}`,
      `Format: vertical short video (TikTok and Reels), ${idea.target_seconds?.join('–')} s, voiceover plus on-screen text; animated diagrams; one beat shows the real RecipeFix screen. Pillar ${idea.pillar}. Audience: ${idea.audience}.`,
      `Claim ids this post may cite: ${idea.claim_ids.join(', ')}.`,
      'BEATS, in order (role: what it must do):',
      ...(idea.beats ?? []).map((b, i) => `${i + 1}. ${b.role}: ${b.must}`),
      `PROOF (the real stored RecipeFix result, ${ctx.proofRecord.disclosure}):`,
      proofExcerpts(ctx.proof, paths),
      'FACT SOURCES:',
      ...idea.fact_sources.map((f) => `${f.id}: ${f.statement}`),
      `NEVER show or say: ${idea.never_show.join('; ')}.`,
      SCHEMA,
    ].join('\n');
    const result = await writeCopy<ShortCopy>(new OpenAiLlmClient(), ctx.ledger, {
      run: ctx.runId,
      system: systemPrompt(ctx.brief, 'Write for the ear first: short sentences a person would actually say in a kitchen. One idea per beat.'),
      user,
      gate,
      estimateUsd: 0.12,
      promptVersion: 'mk.short.v1',
    });
    attempts = result.attempts;
    writeJson(modelFile, { accepted: result.accepted, attempts });
    if (!result.accepted) throw new Error(`No copy passed the gates in ${attempts.length} attempts; see ${path.relative(REPO_ROOT, modelFile)}`);
    copy = result.accepted;
    modelCopy = copy;
    copySource = `model (${attempts.at(-1)!.model}), accepted on attempt ${attempts.length}`;
    writeJson(path.join(ctx.dir, 'copy.json'), copy);
  }

  // ── Voice ──
  const script = copy.beats.map((b) => b.vo.trim()).join(' ');
  const voMp3 = path.join(pub, 'vo.mp3');
  const scriptFile = path.join(ctx.dir, 'vo-script.txt');
  const assets: AssetRecord[] = [ctx.proofRecord];
  let voiced = false;
  if (opts.voice) {
    // Identical words already voiced (with their alignment) on disk: reuse, never pay twice.
    const alignFile = path.join(ctx.dir, 'vo-alignment.json');
    const direction=voiceDirection();
    const directionFile=path.join(ctx.dir,'voice-direction.json');
    const sameDirection=existsSync(directionFile)&&readFileSync(directionFile,'utf8')===JSON.stringify(direction);
    const same = sameDirection && existsSync(voMp3) && existsSync(scriptFile) && existsSync(alignFile) && readFileSync(scriptFile, 'utf8') === script;
    if (!same) {
      const est = (script.length / 1000) * ELEVENLABS_USD_PER_1K;
      ctx.ledger.assertCanSpend(est);
      const { audio, words: aligned } = await synthWithTimestamps(script);
      writeFileSync(voMp3, audio);
      writeFileSync(scriptFile, script);
      writeJson(alignFile, aligned);
      writeFileSync(directionFile,JSON.stringify(direction));
      ctx.ledger.record({
        run: ctx.runId,
        provider: 'elevenlabs',
        model: direction.model,
        purpose: 'voiceover (with-timestamps)',
        units: { characters: script.length },
        usd: Number(est.toFixed(4)),
        basis: `characters × $${ELEVENLABS_USD_PER_1K}/1k (Halyard ELEVENLABS_USD_PER_1K_CHARS; plan-dependent estimate)`,
      });
    }
    voiced = true;
    assets.push({
      id: 'vo.mp3',
      kind: 'audio',
      location: path.relative(REPO_ROOT, voMp3),
      sha256: sha256(readFileSync(voMp3)),
      provenance: `ElevenLabs TTS (${direction.model}, voice ${direction.voice}) of vo-script.txt, generated ${new Date().toISOString().slice(0, 10)}`,
      licence: 'ElevenLabs output under the account plan terms; synthetic voice: disclose as AI voice where the platform asks (TikTok is_aigc)',
      disclosure: 'AI-generated voiceover',
    });
  }

  // ── Timing from the voice ──
  let timed: TimedWord[];
  let totalSeconds: number;
  if (voiced) {
    timed = JSON.parse(readFileSync(path.join(ctx.dir, 'vo-alignment.json'), 'utf8')) as TimedWord[];
    if (timed.length !== words(script).length) timed = alignScript(words(script), timed);
    totalSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voMp3], { encoding: 'utf8' }));
  } else {
    // Silent fallback: 2.6 words/s reading pace.
    let t = 0.3;
    timed = words(script).map((w) => ({ word: w, start: t, end: (t += 1 / 2.6) }));
    totalSeconds = t + 0.5;
  }
  // Beat k starts as its first word is spoken (the hook at frame 0).
  const starts: number[] = [];
  let wi = 0;
  copy.beats.forEach((b, k) => {
    starts.push(k === 0 ? 0 : Math.max(0, Math.round((timed[wi]!.start - 0.12) * FPS)));
    wi += words(b.vo).length;
  });
  const tail = Math.round(1.2 * FPS);
  const durationInFrames = Math.round(totalSeconds * FPS) + tail;
  const beats = copy.beats.map((b, k) => ({ role: b.role, kicker: b.kicker, onScreen: b.on_screen, start: starts[k]!, end: k + 1 < starts.length ? starts[k + 1]! : durationInFrames }));
  const captions = captionCues(timed);

  // ── Real product screens (capture stills → note-box crops) ──
  const proofBeat = beats.find((b) => b.role === 'proof');
  const proofFrames = proofBeat ? proofBeat.end - proofBeat.start : 0;
  const per = Math.floor(proofFrames / PROOF_NOTES.length);
  const steps = (ctx.proof.steps ?? []) as Array<{ title: string }>;
  const clips = [];
  for (const [k, n] of PROOF_NOTES.entries()) {
    const out = `note-${k + 1}.png`;
    const shot = loadLocalAsset(
      path.join(CAPTURES, n.file),
      'product_capture',
      'RecipeFix UI at commit 8c44a5b4 (RecipeOutputCard identical to the live 3f32680f tree), local build driven by scripts/journey.mjs (simulated backend); adaptation payload = verbatim stored production result captured 2026-10-21. runs/2026-10-26/captures/capture.json',
      'first-party capture',
      'Real RecipeFix screen, local build of the live UI; result captured Oct 21 2026',
    );
    await sharp(shot.bytes).extract(n.crop).png().toFile(path.join(pub, out));
    assets.push({ ...shot.record, id: `${shot.record.id} crop ${JSON.stringify(n.crop)} → 780 wide (downscale 0.81)` });
    clips.push({
      src: out,
      label: `Step ${n.step + 1}: ${steps[n.step]?.title ?? ''}`,
      frames: k === PROOF_NOTES.length - 1 ? proofFrames - per * (PROOF_NOTES.length - 1) : per,
      width: n.crop.width,
      height: n.crop.height,
    });
  }

  // Frame 1 carries a real photo (brand.md §2): the Original's licensed stock photo, labelled as such.
  const photo = loadProvenancedPhoto(
    ctx.proofRef,
    'public/images/originals/chicken-tikka-masala-1x1.webp',
    'docs/RECIPEFIX_ORIGINALS.md',
    /\|\s*Chicken Tikka Masala\s*\|\s*1585937421612/,
    'Unsplash License (licensed stock, not owned); RecipeFix docs/RECIPEFIX_ORIGINALS.md',
    "Photo is the Original recipe's licensed stock photo, not the adapted dish",
  );
  await sharp(photo.bytes).extract({ left: 520, top: 0, width: 1080, height: 1600 }).jpeg({ quality: 92 }).toFile(path.join(pub, 'original.jpg'));
  assets.push({ ...photo.record, id: `${photo.record.id} crop 1080×1600 from 1600×1600 (no upscale; Remotion cover-fits 1080×1920, ×1.2)` });
  for (const f of ['Inter-Regular.woff', 'Inter-SemiBold.woff', 'InstrumentSerif-Regular.ttf']) {
    copyFileSync(path.join(REPO_ROOT, 'packages/render/assets/fonts', f), path.join(pub, 'fonts', f));
  }

  // ── Render ──
  const props = {
    beats,
    captions,
    audio: voiced ? 'vo.mp3' : null,
    clips,
    photo: 'original.jpg',
    photoLabel: 'Photo: the original recipe, made with dairy (licensed stock)',
    provenance: `Real RecipeFix result · captured ${ctx.proofCapturedOn ? new Date(`${ctx.proofCapturedOn}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''} · screen from a local build of the live app`,
    data: { from: 4, to: 6, amountBefore: '1½ lb', amountAfter: '2¼ lb', amountLabel: 'chicken', broil: '8 to 10', checkAt: '10' },
  };
  const v2 = idea.composition === 'screen-hero';
  const shotPlan = v2 ? screenShotPlan(beats, idea.beats ?? []) : null;
  if (v2) {
    const capDir = path.join(REPO_ROOT, idea.captures ?? 'runs/2026-10-26/captures-v2');
    const files = [...new Set((shotPlan ?? []).map((x) => x.src).filter((x): x is string => Boolean(x)))];
    for (const f of files) copyFileSync(path.join(capDir, f), path.join(pub, f));
    for (const f of files) {
      const a = loadLocalAsset(path.join(capDir, f), 'product_capture', SCREEN_PROVENANCE, 'first-party capture', 'Real RecipeFix screen, local build of the live UI');
      assets.push(a.record);
    }
  }
  const compositionId = v2 ? 'ScreenShort' : 'MethodShort';
  // Each real-screen shot carries its beat's one-line head (hook and close shots included).
  const headOf = (frame: number) => {
    const k = beats.findIndex((b) => frame >= b.start && frame < b.end);
    return copy.beats[k]?.head ?? beats[k]?.onScreen ?? '';
  };
  const screenHeads = (shotPlan ?? []).filter((x) => x.kind === 'clip' || x.kind === 'still').map((x) => ({ start: x.start, end: x.end, text: headOf(x.start) }));
  const renderProps = v2
    ? {
        shots: shotPlan,
        heads: screenHeads,
        hook: { kicker: beats[0]!.kicker, text: beats[0]!.onScreen },
        close: { kicker: beats.at(-1)!.kicker, text: beats.at(-1)!.onScreen },
        captions,
        audio: props.audio,
        photo: 'original.jpg',
        photoLabel: props.photoLabel,
        screenLabel: 'Real app screen · local build',
        data: { from: 4, to: 6 },
      }
    : props;
  writeJson(path.join(ctx.dir, 'render-props.json'), renderProps);
  const serveUrl = await bundle({
    entryPoint: path.join(REPO_ROOT, 'packages/marketing/video/entry.tsx'),
    publicDir: pub,
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, extensionAlias: { ...(config.resolve?.extensionAlias ?? {}), '.js': ['.ts', '.tsx', '.js'] } },
    }),
  });
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: renderProps });
  const out = path.join(ctx.dir, `${ctx.runId}.mp4`);
  await renderMedia({
    serveUrl,
    composition: { ...composition, durationInFrames },
    codec: 'h264',
    crf: 18,
    outputLocation: out,
    inputProps: renderProps,
    chromiumOptions: { gl: 'swangle' },
    concurrency: 4,
    timeoutInMilliseconds: 120_000,
  });
  // Loudness to the QA target (−14 LUFS, ≤ −1 dBTP), video stream copied untouched.
  const normed = out.replace(/\.mp4$/, '.norm.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', out, '-af', 'loudnorm=I=-14:TP=-2:LRA=11',
    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', normed,
  ]);
  copyFileSync(normed, out);
  execFileSync('rm', ['-f', normed]);

  const caption = `${copy.caption}\n\n${copy.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`;
  writeFileSync(path.join(ctx.dir, 'caption.txt'), `${caption}\n`);

  // ── QA on the exported file ──
  const copyGate = runCopyGate({
    pack: ctx.pack,
    lines: shortLines(copy),
    caption: { text: copy.caption, hashtags: copy.hashtags, platform: 'tiktok', claimIds: copy.caption_claim_ids, factIds: copy.caption_fact_ids },
    proofText: JSON.stringify(ctx.proof),
    factSources: idea.fact_sources,
    productTerms: ctx.ideas.product_terms,
  });
  const shape = shortShapeProblems(copy, roles, ctx.proof, idea.never_show);
  // V2: what is on screen changes per SHOT (photo shots show the beat's kicker+headline; screen shots the label+head).
  const qaBeats = v2
    ? (shotPlan ?? []).map((x) => {
        const k = beats.findIndex((b) => x.start >= b.start && x.start < b.end);
        const b = beats[k]!;
        return x.kind === 'clip' || x.kind === 'still'
          ? { role: b.role, start: x.start, end: x.end, kicker: 'Real app screen · local build', onScreen: headOf(x.start) }
          : { role: b.role, start: x.start, end: x.end, kicker: b.kicker, onScreen: b.onScreen };
      })
    : beats;
  const screenShots = (shotPlan ?? []).filter((x) => x.kind === 'clip' || x.kind === 'still').map((x) => [x.start, x.end] as [number, number]);
  const media = await qaVideo({
    file: out,
    dir: path.join(ctx.dir, 'qa-frames'),
    fps: FPS,
    beats: qaBeats,
    productWindow: v2 ? { x0: 189, y0: 402, x1: 891, y1: 1132, onlyDuring: screenShots } : undefined,
    captionBand: v2 ? { top: 1136, height: 114 } : { top: 1100, height: 150 },
    captions,
    textBox: TEXT_BOX,
    script: voiced ? script : null,
    targetSeconds: idea.target_seconds ?? [30, 45],
    proofWindow: proofBeat ? [proofBeat.start, proofBeat.end] : null,
  });
  const checks: GateCheck[] = [
    ...copyGate.checks,
    { id: 'copy.shape', passed: shape.length === 0, detail: 'roles, lengths, speakability, proof support, never-show', problems: shape },
  ];
  const passed = checks.every((c) => c.passed) && media.passed;
  const spent = ctx.ledger.entries().filter((e) => e.run === ctx.runId).reduce((s, e) => s + e.usd, 0);
  const record = buildRecord(ctx, {
    copySource,
    copy,
    modelCopy,
    attempts: attempts as Attempt<unknown>[],
    assets,
    files: [out],
    caption,
    checks,
    mediaQa: media,
    passed,
    spent,
    extra: {
      safe_box: TEXT_BOX,
      disclosures: {
        ai_generated_voice: voiced,
        tiktok_is_aigc: voiced,
        instagram_ai_label: voiced,
        tiktok_your_brand: true,
        app_screen: 'Product screens are from a local build of the live RecipeFix UI (journey.mjs harness, simulated backend) displaying the verbatim stored production result captured 2026-10-21; disclosed on screen.',
        photo: "Original recipe's licensed stock photo (Unsplash), labelled on screen; not the adapted dish.",
        diagrams: 'Drawn illustrations, not footage.',
      },
      variants: {
        tiktok: { file: path.relative(REPO_ROOT, out), caption, notes: 'Set "Your brand" (brand_organic_toggle) and AI-generated content label (synthetic voice). Trending sound, if any, added by a human in the app.' },
        instagram_reels: { file: path.relative(REPO_ROOT, out), notes: 'Same master is valid for Reels (safe box is the intersection of both UIs). Use a Reels-specific caption; do not cross-post the TikTok file with its caption unchanged.' },
      },
      timing: { durationSeconds: durationInFrames / FPS, beats, captions: captions.length },
    },
  });
  writeJson(path.join(ctx.dir, 'record.json'), record);
  writePreview(ctx.dir, record);
  console.log(`${ctx.runId}: ${passed ? 'QA PASS' : 'QA FAIL'} — ${path.relative(REPO_ROOT, path.join(ctx.dir, 'preview.html'))}`);
  for (const c of [...checks, ...media.checks]) if (!c.passed || c.problems.length) console.log(`  ${c.passed ? 'warn' : 'FAIL'} ${c.id}: ${c.detail} | ${c.problems.join(' | ')}`);
}
