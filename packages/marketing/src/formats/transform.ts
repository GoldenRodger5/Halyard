/**
 * Before/after transformation ("Recipe Fixed #N"): a STORED, REAL RecipeFix
 * adaptation result → a 20–35 s vertical video showing what changed and why,
 * including the cooking step that changed. P3 in PLAYBOOK.md §8.
 *
 *   pnpm mk transform                 list transforms
 *   pnpm mk transform <id> [--voice]  render + QA + posts
 *
 * Nothing is adapted, written or paraphrased by a model here. The spec in
 * data/transforms.yaml only POINTS into the stored result (which ingredient,
 * which step, which words of its reason) and the code refuses a pointer that
 * does not match the stored text verbatim. The step diff is computed from the
 * Original's step and the result's step, word by word, so the highlighted
 * words are exactly the words that changed.
 *
 * Works on any result with RecipeFix's response shape: ingredients[] with
 * original / adapted / changeReason, steps[] with title / instruction /
 * updated_note, explanations[], servings / originalServings.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadStoredOutput } from '../assets.js';
import { forbiddenMatches, numbersIn, type GateCheck } from '../copyGate.js';
import { claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
import { loadOriginals } from './recipe.js';
import {
  FPS,
  check,
  contactSheet,
  duration,
  humanTextProblems,
  loudnessChecked,
  openStudio,
  originalPhoto,
  qaFrame,
  relRepo,
  renderVideo,
  runCost,
  sfx,
  transcriptCheck,
  voice,
  writeJson,
  writeStudioPreview,
  type PlatformPost,
  type StudioRecord,
  type Studio,
} from '../studio.js';

export const SERIES = 'Recipe Fixed';

export interface TransformSpec {
  id: string;
  number: number;
  result: { repo: string; commit: string; file: string; export: string };
  original: string;
  diet: string;
  keyword: string;
  hook: { title: string; line1: string; line2: string; question: string; options: string[]; answer: number; options_from: string[] };
  swaps: Array<{ ingredient: number; why: string; short: [string, string] }>;
  step: { result: number; original: { section: string; step: number }; before: string[]; after: string[]; keep?: string; why: string; takeaway: { text: string; from: string }; before_headline: string };
  save: string;
  tips: Array<{ text: string; from: string }>;
  tie: string;
  voice?: { hook: string; swaps: string; step: string; result: string; close: string };
  caption: { lead: string; youtube_title: string };
  tags: string[];
  claims: string[];
  never_show?: string[];
}

interface ResultShape {
  recipeName: string;
  servings: number;
  originalServings?: number;
  ingredients: Array<{ original: string | null; adapted: string; changeReason?: string | null; changeType?: string }>;
  steps: Array<{ title: string; instruction: string; updated_note?: string }>;
  explanations?: string[];
}

export function loadTransforms(file = path.join(REPO_ROOT, 'packages/marketing/data/transforms.yaml')): TransformSpec[] {
  return (yaml.load(readFileSync(file, 'utf8')) as { transforms: TransformSpec[] }).transforms;
}

// ── Word diff ───────────────────────────────────────────────────────────────

export type SegKind = 'same' | 'del' | 'ins' | 'keep' | 'gap';
export interface Seg {
  text: string;
  kind: SegKind;
}

const ELLIPSIS = '…';
const normTok = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}…]+|[^\p{L}\p{N}…]+$/gu, '');
const tokensOf = (frags: string[]) => [ELLIPSIS, ...frags.flatMap((f, i) => [...(i ? [ELLIPSIS] : []), ...f.trim().split(/\s+/)]), ELLIPSIS];

/**
 * Word-level diff of two excerpt lists. Weighted LCS (a match is worth its
 * length), so "on"/"foil-lined" align before a stray "a" does and the changed
 * words come out as readable phrases.
 */
export function wordDiff(beforeFrags: string[], afterFrags: string[], keep?: string): { before: Seg[]; after: Seg[] } {
  const a = tokensOf(beforeFrags);
  const b = tokensOf(afterFrags);
  const na = a.map(normTok);
  const nb = b.map(normTok);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = na[i] === nb[j] ? Math.max(1, na[i]!.length) + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const before: Array<[string, SegKind]> = [];
  const after: Array<[string, SegKind]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (na[i] === nb[j]) {
      const k: SegKind = a[i] === ELLIPSIS ? 'gap' : 'same';
      before.push([a[i]!, k]);
      after.push([b[j]!, k]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) before.push([a[i++]!, 'del']);
    else after.push([b[j++]!, 'ins']);
  }
  while (i < a.length) before.push([a[i++]!, 'del']);
  while (j < b.length) after.push([b[j++]!, 'ins']);
  return { before: withKeep(merge(before), keep), after: withKeep(merge(after), keep) };
}

function merge(toks: Array<[string, SegKind]>): Seg[] {
  const out: Seg[] = [];
  for (const [t, k] of toks) {
    const last = out[out.length - 1];
    if (last && last.kind === k && k !== 'gap') last.text += ` ${t}`;
    else out.push({ text: t, kind: k });
  }
  return out;
}

function withKeep(segs: Seg[], keep?: string): Seg[] {
  if (!keep) return segs;
  const out: Seg[] = [];
  let found = false;
  for (const s of segs) {
    const at = s.kind === 'same' ? s.text.indexOf(keep) : -1;
    if (at < 0) {
      out.push(s);
      continue;
    }
    found = true;
    const pre = s.text.slice(0, at).trim();
    const post = s.text.slice(at + keep.length).trim();
    if (pre) out.push({ text: pre, kind: 'same' });
    out.push({ text: keep, kind: 'keep' });
    if (post) out.push({ text: post, kind: 'same' });
  }
  if (!found) throw new Error(`keep phrase "${keep}" is not unchanged text on both sides of the diff`);
  return out;
}

// ── Reading the stored result ───────────────────────────────────────────────

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
function mustContain(where: string, haystack: string | null | undefined, needle: string): void {
  if (!haystack || !squash(haystack).includes(squash(needle))) throw new Error(`${where} does not contain "${needle}" verbatim`);
}

/** `steps[0].updated_note`, `explanations[1]`, `ingredients[5].changeReason` → the string at that path. */
export function atPath(obj: unknown, p: string): string {
  const v = p.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
  if (typeof v !== 'string') throw new Error(`no string at ${p}`);
  return v;
}

export interface TransformContent {
  name: string;
  servings: { from: number; to: number } | null;
  swaps: Array<{ from: string; to: string; why: string; reason: string; short: [string, string] }>;
  step: { title: string; originalText: string; resultText: string; note: string; before: Seg[]; after: Seg[]; why: string; takeaway: string };
  tips: string[];
  capturedOn: string | null;
  provenance: string;
  sha256: string;
}

/** Everything the video shows, read from the stored result and the Original, with every pointer checked. */
export function readTransform(spec: TransformSpec): TransformContent {
  const stored = loadStoredOutput({ repo: spec.result.repo, commit: spec.result.commit }, spec.result.file, spec.result.export);
  const r = stored.data as unknown as ResultShape;
  const orig = loadOriginals().originals.find((o) => o.id === spec.original);
  if (!orig) throw new Error(`no Original ${spec.original} in data/originals.json`);

  const swaps = spec.swaps.map((sw) => {
    const ing = r.ingredients[sw.ingredient];
    if (!ing?.original || !ing.changeReason) throw new Error(`ingredients[${sw.ingredient}] has no original line or no changeReason`);
    if (ing.changeType !== 'both' && ing.changeType !== 'swapped') throw new Error(`ingredients[${sw.ingredient}] is ${ing.changeType}, not a swap`);
    mustContain(`ingredients[${sw.ingredient}].changeReason`, ing.changeReason, sw.why);
    mustContain(`ingredients[${sw.ingredient}].original (lower-cased)`, ing.original.toLowerCase(), sw.short[0].toLowerCase());
    mustContain(`ingredients[${sw.ingredient}].adapted (lower-cased)`, ing.adapted.toLowerCase(), sw.short[1].toLowerCase());
    return { from: ing.original, to: ing.adapted, why: sw.why, reason: ing.changeReason, short: sw.short };
  });

  const st = r.steps[spec.step.result];
  if (!st) throw new Error(`no steps[${spec.step.result}]`);
  const sec = orig.methodSections.find((m) => m.title === spec.step.original.section);
  const ostep = sec?.steps[spec.step.original.step];
  if (!ostep) throw new Error(`Original ${spec.original} has no step ${spec.step.original.section}[${spec.step.original.step}]`);
  for (const e of spec.step.before) mustContain(`Original step "${sec!.title}"`, ostep, e);
  for (const e of spec.step.after) mustContain(`steps[${spec.step.result}].instruction`, st.instruction, e);
  mustContain(`steps[${spec.step.result}].updated_note`, st.updated_note, spec.step.why);
  const diff = wordDiff(spec.step.before, spec.step.after, spec.step.keep);

  // A tip may shorten its source; it may not show a number its source (or the serving change) lacks.
  const from = r.originalServings ?? r.servings;
  const shortened = (t: { text: string; from: string }) => {
    const src = atPath(r, t.from);
    for (const n of numbersIn(t.text)) if (!numbersIn(src).includes(n) && n !== String(r.servings) && n !== String(from)) throw new Error(`"${t.text}" shows ${n}, not in ${t.from}`);
    return t.text;
  };
  const tips = spec.tips.map(shortened);
  const takeaway = shortened(spec.step.takeaway);
  // The hook's options: each one's words (and numbers) must be in the result text it stands on.
  if (spec.hook.options.length !== spec.hook.options_from.length || !spec.hook.options[spec.hook.answer]) throw new Error('hook.options / options_from / answer do not line up');
  spec.hook.options.forEach((o, i) => {
    const src = atPath(r, spec.hook.options_from[i]!).toLowerCase();
    for (const w of o.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3)) if (!src.includes(w)) throw new Error(`hook option "${o}": "${w}" is not in ${spec.hook.options_from[i]}`);
    shortened({ text: o, from: spec.hook.options_from[i]! });
  });

  return {
    name: r.recipeName,
    servings: from !== r.servings ? { from, to: r.servings } : null,
    swaps,
    step: { title: st.title, originalText: ostep, resultText: st.instruction, note: st.updated_note ?? '', before: diff.before, after: diff.after, why: spec.step.why, takeaway },
    tips,
    capturedOn: stored.capturedOn,
    provenance: stored.record.location,
    sha256: stored.record.sha256,
  };
}

// ── Sound: a marker scribble and a highlighter swipe, synthesised here ─────

function markerSfx(s: Studio): { scribble: string; swipe: string } {
  const scribble = path.join(s.pub, 'sfx-scribble.wav');
  if (!existsSync(scribble))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=color=white:duration=0.28:amplitude=0.5', '-af', 'bandpass=f=2600:width_type=o:w=1.4,tremolo=f=28:d=0.7,afade=t=in:d=0.03,afade=t=out:st=0.18:d=0.1,volume=0.9', '-ar', '48000', scribble]);
  const swipe = path.join(s.pub, 'sfx-swipe.wav');
  if (!existsSync(swipe))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.22:amplitude=0.5', '-af', 'highpass=f=1200,lowpass=f=7000,afade=t=in:d=0.08,afade=t=out:st=0.1:d=0.12,volume=0.6', '-ar', '48000', swipe]);
  return { scribble: 'sfx-scribble.wav', swipe: 'sfx-swipe.wav' };
}

// ── The video ───────────────────────────────────────────────────────────────

export async function makeTransform(id: string, opts: { voice: boolean; date?: string }): Promise<StudioRecord> {
  const spec = loadTransforms().find((t) => t.id === id);
  if (!spec) throw new Error(`unknown transform ${id}; known: ${loadTransforms().map((t) => t.id).join(', ')}`);
  if (opts.voice && !spec.voice) throw new Error(`${id} has no voice lines`);
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  for (const c of spec.claims) if (!isQuotable(claimById(pack, c))) throw new Error(`${c} is not quotable in the pack at ${pack.commit}`);
  const paused = productPostsPaused(pack);
  const content = readTransform(spec);

  const s = openStudio('transform', opts.voice ? `${spec.id}-voice` : spec.id, opts.date);
  const fx = { ...sfx(s), ...markerSfx(s) };
  const photoTall = await originalPhoto(s, spec.original, 'tall');
  const photoWide = await originalPhoto(s, spec.original, 'wide');
  const series = `${SERIES} #${spec.number}`;
  const note = `Real RecipeFix result${content.capturedOn ? `, captured ${content.capturedOn}` : ''}. Recipe: a RecipeFix Original.`;
  const photoLabel = 'Photo: the Original recipe (licensed stock)';
  const sv = content.servings;

  // ── Timeline: reading time when silent, the narrator's clock when voiced ──
  const sec = (x: number) => Math.round(x * FPS);
  const v = opts.voice && spec.voice ? spec.voice : null;
  const vo = v
    ? {
        hook: await voice(s, v.hook, 'hook'),
        swaps: await voice(s, v.swaps, 'swaps'),
        step: await voice(s, v.step, 'step'),
        result: await voice(s, v.result, 'result'),
        close: await voice(s, v.close, 'close'),
      }
    : null;
  let t = 0;
  const hookEnd = (t += Math.max(sec(3.6), sec((vo?.hook.seconds ?? 0) + 0.5)));
  // One marked-up ingredient card: each line struck, its replacement landing, 1.1 s apart.
  const swapsStart = t;
  const rowAt = content.swaps.map((_, i) => swapsStart + 2 + i * sec(0.8));
  t = Math.max(rowAt[rowAt.length - 1]! + sec(2.2), swapsStart + sec((vo?.swaps.seconds ?? 0) + 1.2));
  const swaps = { rows: content.swaps.map((sw) => ({ from: sw.from, to: sw.to, why: sw.why })), rowAt, start: swapsStart, end: t };
  const stepStart = t;
  const insRuns = content.step.after.filter((x) => x.kind === 'ins').length;
  // As written (struck) for ~1.6 s, then the slot flips to the fixed step.
  const st = {
    beforeIn: stepStart + 2,
    strike: stepStart + 12,
    afterIn: stepStart + 44,
    sweep: stepStart + 54,
  };
  const keepAt = st.sweep + insRuns * 12 + 4;
  const whyAt = keepAt + 14;
  t = Math.max(whyAt + sec(3.0), stepStart + sec((vo?.step.seconds ?? 0) + 1.0));
  const step = { title: content.step.title, before: content.step.before, after: content.step.after, why: content.step.why, takeaway: content.step.takeaway, beforeHead: spec.step.before_headline, answer: 'AB'[spec.hook.answer] ?? null, start: stepStart, end: t, ...st, keepAt, whyAt };
  const resultStart = t;
  t += Math.max(sec(2.4), sec((vo?.result.seconds ?? 0) + 0.8));
  const result = { name: content.name, servings: sv, photo: photoTall, photoLabel, start: resultStart, end: t };
  const closeStart = t;
  const total = closeStart + Math.max(sec(4.6), sec((vo?.close.seconds ?? 0) + 3.5));
  const props = {
    series,
    hook: { title: spec.hook.title, question: spec.hook.question, options: spec.hook.options, answer: spec.hook.answer, servings: sv, photo: photoWide, end: hookEnd },
    swaps,
    step,
    result,
    close: { start: closeStart, save: spec.save, swaps: content.swaps.map((x) => x.short), tips: content.tips, tie: spec.tie, note },
    sfx: fx,
    audio: vo ? { hook: vo.hook.file, swaps: vo.swaps.file, step: vo.step.file, result: vo.result.file, close: vo.close.file } : null,
  };
  writeJson(`${s.dir}/render-props.json`, props);

  const video = await renderVideo(s, 'TransformShort', props, total, s.id);
  contactSheet(video, `${s.dir}/contact.png`, 1.0);

  // ── Posts: search phrase first, series name, 3–5 tags ──
  const tags = spec.tags.map((x) => `#${x}`).join(' ');
  const media = [relRepo(video)];
  const lead = spec.caption.lead;
  const swapLines = content.swaps.map((sw) => `${sw.from} → ${sw.to}\nWhy: ${sw.reason}`).join('\n\n');
  const stepLine = `The step: "${content.step.title}". As written: "${spec.step.before.join(' … ')}". Fixed: "${spec.step.after.join(' … ')}". Why: ${content.step.note}`;
  const tipLines = content.tips.map((x) => `• ${x}`).join('\n');
  const ai = Boolean(v);
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `${lead} ${series}.\n\n${tags}`, ai_voice: ai, cover_ms: 100 },
    instagram_reel: {
      platform: 'instagram',
      kind: 'video',
      media,
      text: `${lead}\n\n${series}: ${note}\n\n${swapLines}\n\n${stepLine}\n\n${spec.save}\n${tipLines}\n\n${tags}`,
      ai_voice: ai,
    },
    youtube: {
      platform: 'youtube',
      kind: 'video',
      media,
      title: `${spec.caption.youtube_title} #shorts`.slice(0, 100),
      text: `${lead}\n\n${series}. ${note}\n\n${swapLines}\n\n${stepLine}\n\n${spec.tie} https://recipefix.app/original-recipes/${spec.original}\n\n${tags}`,
      ai_voice: ai,
    },
    x: {
      platform: 'x',
      kind: 'video',
      media,
      text: `${spec.keyword[0]!.toUpperCase()}${spec.keyword.slice(1)}, 4 to 6 servings. ${spec.hook.line1} ${spec.hook.line2} ${series}\n\n${tags}`,
      thread: [`The step, as written: "${spec.step.before.join(' … ')}"\n\nFixed: "${spec.step.after.join(' … ')}"`, `Why: ${content.step.why}.\n\n${note}`],
    },
    threads: {
      platform: 'threads',
      kind: 'video',
      media,
      text: `${lead} ${series}.\n\n${tags}`,
      thread: [`As written: "${spec.step.before.join(' … ')}"\nFixed: "${spec.step.after.join(' … ')}"\nWhy: ${content.step.why}.`, `${note} ${spec.tie}`],
    },
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  checks.push(check('video.duration', d >= 20 && d <= 35, `${d.toFixed(1)} s (target 20–35 s)`));
  const loud = loudnessChecked(video);
  checks.push(check('audio.loudness', !v || (Math.abs(loud.lufs + 14) <= 1.5 && loud.peak <= -0.5), `${loud.lufs} LUFS, peak ${loud.peak} dBFS${v ? '' : ' (silent cut: SFX only, not held to −14)'}`));
  if (v) checks.push(transcriptCheck(s, video, [v.hook, v.swaps, v.step, v.result, v.close].join(' ')));
  const text = (segs: Seg[]) => segs.map((x) => x.text).join(' ');
  checks.push(...(await qaFrame(s, video, 0.05, 'hook', [series, spec.hook.title, spec.hook.question, ...spec.hook.options])));
  // Struck "as written" lines are checked by eye in the contact sheet (a strike through a word is the point).
  checks.push(...(await qaFrame(s, video, (swaps.end - 10) / FPS, 'swaps', swaps.rows.flatMap((x) => [x.to, x.why]))));
  // Struck text is checked by eye in the contact sheet: a strike line through a word is the point, and OCR reads it poorly.
  // The stamp repeats words of the fixed step ("one", "sheet", "8"), so the two are read in separate frames.
  checks.push(...(await qaFrame(s, video, (step.keepAt - 2) / FPS, 'step-fixed', [step.title, text(step.after).replace(/…/g, ' ')])));
  checks.push(...(await qaFrame(s, video, (step.end - 8) / FPS, 'step', [step.title, step.takeaway])));
  checks.push(...(await qaFrame(s, video, (result.end - 8) / FPS, 'result', [result.name, photoLabel])));
  checks.push(...(await qaFrame(s, video, (total - 4) / FPS, 'close', [...spec.save.split(/:\s*/), ...content.swaps.map((x) => `${x.short[0]} ${x.short[1]}`), ...content.tips, spec.tie, note])));

  const problems: string[] = [];
  const onScreen = [series, spec.hook.title, spec.hook.question, ...spec.hook.options, ...swaps.rows.flatMap((x) => [x.from, x.to, x.why]), step.title, text(step.before), text(step.after), step.why, step.takeaway, step.beforeHead, result.name, photoLabel, spec.save, ...content.swaps.flatMap((x) => x.short), ...content.tips, spec.tie, note];
  const captions = Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? '']);
  const everything = [...captions, ...onScreen];
  // Numbers: every number in the shown content occurs in the stored result or the Original.
  const sourceNums = new Set([...numbersIn(JSON.stringify(readTransformSource(spec))), ...(sv ? [String(sv.from), String(sv.to)] : [])]);
  for (const txt of [spec.hook.title, spec.hook.question, ...spec.hook.options, ...swaps.rows.flatMap((x) => [x.from, x.to, x.why]), step.title, text(step.before), text(step.after), step.why, step.takeaway, result.name, ...content.tips])
    for (const n of numbersIn(txt)) if (!sourceNums.has(n)) problems.push(`number ${n} in "${txt.slice(0, 50)}" is not in the stored result or the Original`);
  for (const ns of spec.never_show ?? []) for (const txt of everything) if (txt.includes(ns)) problems.push(`never_show "${ns}" appears`);
  const limits: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500, youtube: 5000 };
  for (const [k, p] of Object.entries(posts)) {
    for (const part of [p.text, ...(p.thread ?? [])]) if (part.length > limits[p.platform]!) problems.push(`${k}: ${part.length} chars > ${limits[p.platform]}`);
    const head = (p.platform === 'youtube' ? p.title! : p.text).slice(0, 50).toLowerCase();
    if (!head.includes(spec.keyword.toLowerCase())) problems.push(`${k}: search phrase "${spec.keyword}" not in the first 50 characters`);
    if (!p.text.includes(series) && !(p.title ?? '').includes(series)) problems.push(`${k}: series "${series}" missing`);
    const n = (p.text.match(/(^|\s)#\w+/g) ?? []).length;
    if (n < 3 || n > 5 || !/#recipefix\b/i.test(p.text)) problems.push(`${k}: ${n} hashtags (need 3–5 incl. #recipefix)`);
    if (p.platform === 'x' && /https?:\/\//.test([p.text, ...(p.thread ?? [])].join(' '))) problems.push(`${k}: no links on X`);
  }
  // proof.tikka_method_changes must_keep: the receipt words travel with the proof.
  const proofClaim = claimById(pack, 'proof.tikka_method_changes');
  if (spec.claims.includes('proof.tikka_method_changes'))
    for (const word of (proofClaim as { must_keep?: string[] } | undefined)?.must_keep ?? []) if (!posts.instagram_reel!.text.includes(word) && !note.includes(word) && !lead.includes(word)) problems.push(`must_keep "${word}" missing`);
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}): "${ex}" in "${txt.slice(0, 60)}"`);
  if (/comment below|follow for|like if|tag a friend/i.test(everything.join(' '))) problems.push('engagement bait wording');
  problems.push(...humanTextProblems(everything));
  checks.push(check('copy.platform_rules', problems.length === 0, 'search phrase in first 50 chars, series name, 3–5 tags, numbers from the result, never_show, lengths, no forbidden claims, reads human', [...new Set(problems)]));
  checks.push(check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? '?').slice(0, 8)} has a release receipt`));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'transform',
    summary: `${series}: ${spec.keyword}${sv ? `, ${sv.from} → ${sv.to} servings` : ''}; swaps + the changed step "${content.step.title}"`,
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video) },
    posts,
    sources: [
      { name: `Stored production RecipeFix result (${content.provenance}, sha256 ${content.sha256.slice(0, 12)})`, url: `https://recipefix.app/original-recipes/${spec.original}`, quote: `${content.step.title}: ${content.step.resultText}` },
      { name: `RecipeFix Original "${spec.original}" as written (data/originals.json, recipefixOriginals.ts @ ${loadOriginals().commit.slice(0, 8)})`, url: `https://recipefix.app/original-recipes/${spec.original}`, quote: content.step.originalText },
    ],
    claims: spec.claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: ai, tiktok_is_aigc: ai, photos: 'licensed stock photo of the Original recipe as written, labelled on screen; not the adapted dish', result: note, knowledge_commit: pack.commit },
  };
  writeJson(`${s.dir}/record.json`, record);
  writeStudioPreview(s, record);
  return record;
}

/** The raw text the numbers check reads: the stored result plus the Original. */
function readTransformSource(spec: TransformSpec): unknown {
  const stored = loadStoredOutput({ repo: spec.result.repo, commit: spec.result.commit }, spec.result.file, spec.result.export);
  return { result: stored.data, original: loadOriginals().originals.find((o) => o.id === spec.original) };
}
