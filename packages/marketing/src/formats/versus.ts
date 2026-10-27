/**
 * This or that: three sourced head-to-head rounds → a split-screen vertical
 * video with a 3-second countdown, the winner, both numbers, why, the source,
 * then RecipeFix.
 *
 * Every number comes from facts/versus.yaml (USDA FoodData Central, per 100 g).
 * The winner, the ratio and the order are COMPUTED from those numbers here, so
 * the video cannot crown the wrong food even if a line of copy is wrong; the
 * copy is then checked against the computed ratio.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { GateCheck } from '../copyGate.js';
import { claimById, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
import {
  FPS,
  check,
  contactSheet,
  duration,
  loudnessChecked,
  openStudio,
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
} from '../studio.js';
import type { VersusRound } from '../../video/VersusShort.js';
import { copyRules, thud } from './shortKit.js';

interface Side {
  name: string;
  sub: string;
  value: number;
  color: string;
  fdc: number;
  fdc_name: string;
  quote: string;
}

export interface VsRound {
  id: string;
  question: string;
  unit: string;
  basis: string;
  left: Side;
  right: Side;
  say_q: string;
  say_a: string;
  why: string;
}

export interface VsSet {
  label: string;
  rounds: string[];
  tie: string;
  claims: string[];
  caption: string;
  tags: string[];
  photo?: string;
  /** Caption lead: a real question people search, hand-picked (keywords.ts rule). */
  search?: string;
}

interface VsFile {
  rounds: VsRound[];
  sets: Record<string, VsSet>;
  source: { name: string; short: string; url_template: string };
  verified: string;
}

export function loadVersus(file = path.join(REPO_ROOT, 'packages/marketing/facts/versus.yaml')): VsFile {
  const doc = yaml.load(readFileSync(file, 'utf8')) as VsFile;
  for (const r of doc.rounds) {
    for (const side of [r.left, r.right]) {
      if (!side.fdc || !side.quote) throw new Error(`${r.id}: ${side.name} needs an FDC id and the row as read`);
      // The number on screen must be the number in the row we read.
      const n = /([\d.]+)\s*[A-Z]+\s*$/.exec(side.quote)?.[1];
      if (Number(n) !== side.value) throw new Error(`${r.id}: ${side.name} value ${side.value} ≠ quoted ${n}`);
    }
    if (r.left.value === r.right.value) throw new Error(`${r.id}: a tie is not a round`);
  }
  for (const [k, s] of Object.entries(doc.sets)) {
    if (s.rounds.length !== 3) throw new Error(`set ${k}: 3 rounds`);
    for (const id of s.rounds) if (!doc.rounds.some((r) => r.id === id)) throw new Error(`set ${k}: unknown round ${id}`);
    if (s.tags.length < 3 || s.tags.length > 5 || !s.tags.includes('recipefix')) throw new Error(`set ${k}: 3–5 tags incl. recipefix`);
  }
  return doc;
}

const TIMER = 3 * FPS;

/** "2.4×" from the two numbers; one decimal under 3×, whole numbers above. */
export function ratioLabel(a: number, b: number): string {
  const r = Math.max(a, b) / Math.min(a, b);
  return `${r < 3 ? r.toFixed(1) : Math.round(r)}×`;
}

export async function makeVersus(setName: string, opts: { date?: string; voice?: boolean } = {}): Promise<StudioRecord> {
  const doc = loadVersus();
  const set = doc.sets[setName];
  if (!set) throw new Error(`unknown set ${setName}; known: ${Object.keys(doc.sets).join(', ')}`);
  const chosen = set.rounds.map((id) => doc.rounds.find((r) => r.id === id)!);
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const paused = productPostsPaused(pack);
  for (const c of set.claims) if (!isQuotable(claimById(pack, c))) throw new Error(`${c} is not quotable in the pack at ${pack.commit}`);
  const useVoice = opts.voice !== false;

  const s = openStudio('versus', setName, opts.date);
  const fx = sfx(s);
  const fxThud = thud(s);
  const sec = (x: number) => Math.ceil(x * FPS);
  const readSecs = (t: string) => Math.max(2.2, t.split(/\s+/).length / 4.8);

  const rounds: VersusRound[] = [];
  const spoken: string[] = [];
  let t = 0;
  for (const [i, r] of chosen.entries()) {
    const qv = useVoice ? await voice(s, r.say_q, `q${i + 1}`) : null;
    const av = useVoice ? await voice(s, r.say_a, `a${i + 1}`) : null;
    if (useVoice) spoken.push(r.say_q, r.say_a);
    const start = t;
    const countdownAt = start + Math.max(sec(1.3), 6 + sec(qv?.seconds ?? 1.6));
    const revealAt = countdownAt + TIMER;
    // The why card rises while the answer is still being said: the reader is already reading.
    const whyAt = revealAt + sec(0.6);
    const end = Math.max(whyAt + sec(readSecs(r.why)), revealAt + 8 + sec(av?.seconds ?? 0) + 6);
    rounds.push({
      question: r.question,
      unit: r.unit,
      basis: r.basis,
      left: { name: r.left.name, sub: r.left.sub, value: r.left.value, color: r.left.color },
      right: { name: r.right.name, sub: r.right.sub, value: r.right.value, color: r.right.color },
      winner: r.left.value > r.right.value ? 0 : 1,
      ratio: ratioLabel(r.left.value, r.right.value),
      why: r.why,
      source: doc.source.short,
      start,
      countdownAt,
      revealAt,
      whyAt,
      end,
      audio: { q: qv?.file ?? null, a: av?.file ?? null },
    });
    t = end;
  }
  // No brand close: the video ends on a recap the viewer can screenshot. The tie goes in the caption.
  const recapStart = t;
  const total = recapStart + sec(2.8);
  const recap = {
    start: recapStart,
    title: 'Per 100 g, the winners',
    rows: chosen.map((r, i) => {
      const w = rounds[i]!.winner === 0 ? r.left : r.right;
      const l = rounds[i]!.winner === 0 ? r.right : r.left;
      return { winner: w.name, loser: l.name, metric: r.question.replace(/^More /, '').replace(/\?$/, ''), wv: w.value, lv: l.value, unit: r.unit, color: w.color };
    }),
    source: doc.source.short,
  };
  const props = { label: set.label, rounds, recap, sfx: { ...fx, thud: fxThud } };
  writeJson(`${s.dir}/render-props.json`, props);
  const video = await renderVideo(s, 'VersusShort', props, total, s.id);
  contactSheet(video, `${s.dir}/contact.png`, 1.0);

  // ── Posts ──
  const tags = set.tags.map((x) => `#${x}`).join(' ');
  const media = [relRepo(video)];
  const answer = (r: VsRound, i: number) => {
    const w = rounds[i]!.winner === 0 ? r.left : r.right;
    const l = rounds[i]!.winner === 0 ? r.right : r.left;
    return `${r.question.replace(/\?$/, '')}: ${w.name} (${w.value} ${r.unit} vs ${l.value} ${r.unit} per 100 g)`;
  };
  const answers = chosen.map(answer).join('\n');
  // Search lead: a real question people type, hand-picked (keywords.ts rule).
  const body = set.search ? `${set.search} ${set.caption}` : set.caption;
  const urls = [...new Set(chosen.flatMap((r) => [r.left.fdc, r.right.fdc]))].map((id) => doc.source.url_template.replace('{fdc}', String(id)));
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `${body}\n\n${set.tie}\n\n${tags}`, ai_voice: useVoice, cover_ms: Math.round(((rounds[0]!.countdownAt - 6) / FPS) * 1000) },
    instagram_reel: { platform: 'instagram', kind: 'video', media, text: `${body}\n\nNumbers per 100 g: ${doc.source.name}.\n\n${set.tie}\n\n${tags}`, ai_voice: useVoice },
    youtube: {
      platform: 'youtube',
      kind: 'video',
      media,
      title: (() => {
        const t = chosen.map((r) => `${r.left.name} or ${r.right.name}`).join(', ').toLowerCase();
        return `${t[0]!.toUpperCase()}${t.slice(1)}? #shorts`.slice(0, 100);
      })(),
      text: `${body}\n\n${answers}\n\nNumbers per 100 g, ${doc.source.name}:\n${urls.join('\n')}\n\n${set.tie} https://recipefix.app`,
      ai_voice: useVoice,
    },
    x: { platform: 'x', kind: 'video', media, text: body, thread: [`${answers}\n\nPer 100 g, ${doc.source.name}.`] },
    threads: { platform: 'threads', kind: 'video', media, text: body, thread: [`${answers}\n\nPer 100 g, ${doc.source.name}.`, set.tie] },
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  // Paper grain that changed every frame once made a 40 s cut 95 MB; platforms and the repo want it small.
  const mb = statSync(video).size / 1e6;
  checks.push(check('video.size', mb <= 40, `${mb.toFixed(1)} MB (≤ 40 MB)`));
  checks.push(check('video.duration', d >= 18 && d <= 30, `${d.toFixed(1)} s (target 18–28 s for three rounds with a 3 s timer each)`));
  const loud = loudnessChecked(video);
  checks.push(check('audio.loudness', !useVoice || (Math.abs(loud.lufs + 14) <= 1.5 && loud.peak <= -0.5), `${loud.lufs} LUFS, peak ${loud.peak} dBFS`));
  if (useVoice) checks.push(transcriptCheck(s, video, spoken.join(' ')));
  // The copy must agree with the numbers: the narrated winner is the computed winner, and any "N times" is the ratio.
  const truth: string[] = [];
  for (const [i, r] of chosen.entries()) {
    const w = rounds[i]!.winner === 0 ? r.left : r.right;
    if (!r.say_a.toLowerCase().includes(w.name.split(' ').at(-1)!.toLowerCase())) truth.push(`${r.id}: say_a does not name the winner ${w.name}`);
    const ratio = Math.max(r.left.value, r.right.value) / Math.min(r.left.value, r.right.value);
    const m = /([\d.]+) times/.exec(r.why);
    if (m && Math.abs(Number(m[1]) - ratio) > 0.06) truth.push(`${r.id}: why says ${m[1]} times, numbers give ${ratio.toFixed(2)}`);
    if (/twice/.test(`${r.why} ${r.say_a}`) && (ratio < 1.85 || ratio > 2.6)) truth.push(`${r.id}: "twice" but ratio ${ratio.toFixed(2)}`);
    const pct = /(\d+)% more/.exec(r.why);
    if (pct && Math.abs(Number(pct[1]) / 100 + 1 - ratio) > 0.03) truth.push(`${r.id}: ${pct[1]}% more but ratio ${ratio.toFixed(2)}`);
  }
  checks.push(check('facts.agree', truth.length === 0, 'winner, ratio and wording computed from the FDC numbers', truth));
  for (const [i, r] of rounds.entries()) {
    const c = chosen[i]!;
    checks.push(...(await qaFrame(s, video, (r.countdownAt + 12) / FPS, `r${i + 1}-question`, [r.question, r.basis, c.left.name, c.right.name, `Round ${i + 1} of ${rounds.length}`])));
    const w = r.winner === 0 ? r.left : r.right;
    const l = r.winner === 0 ? r.right : r.left;
    checks.push(...(await qaFrame(s, video, (r.end - 12) / FPS, `r${i + 1}-answer`, [String(w.value), String(l.value), r.ratio, r.why, `Source: ${r.source}`])));
  }
  checks.push(...(await qaFrame(s, video, (total - 4) / FPS, 'recap', [recap.title, ...recap.rows.map((x) => x.winner)])));
  const screen = [set.label, set.tie, ...chosen.flatMap((r) => [r.question, r.basis, r.why, r.left.name, r.right.name, r.say_q, r.say_a])];
  checks.push(copyRules(pack, posts, screen));
  checks.push(check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? '?').slice(0, 8)} has a release receipt`));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'versus',
    summary: chosen.map((r) => `${r.question} ${r.left.name} vs ${r.right.name}`).join(' / '),
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video) },
    posts,
    sources: chosen.flatMap((r) => [r.left, r.right].map((x) => ({ name: `${doc.source.name}: ${x.fdc_name} (FDC ${x.fdc})`, url: doc.source.url_template.replace('{fdc}', String(x.fdc)), quote: x.quote }))),
    claims: set.claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: useVoice, tiktok_is_aigc: useVoice, photos: 'none: tiles are type and colour', knowledge_commit: pack.commit, verified: doc.verified },
  };
  writeJson(`${s.dir}/record.json`, record);
  writeStudioPreview(s, record);
  return record;
}
