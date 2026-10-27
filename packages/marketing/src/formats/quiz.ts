/**
 * Quiz and myth-or-fact: one or more sourced facts → a vertical video with a
 * 3-second timer, the answer, why, the source, then RecipeFix. Posted as video
 * everywhere (TikTok, Reels, Shorts, X, Threads); no swipe carousels.
 *
 * Nothing here is written by a model. Question, options, answer, why and source
 * come from `facts/food-facts.yaml`; captions are templates over them. A quiz
 * is only worth posting if its answer is right, and the cheapest way to keep it
 * right is to never let anything paraphrase it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
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
} from '../studio.js';

export interface Fact {
  id: string;
  /** `choice` (2–4 options) or `myth` (a statement; options Myth / Fact). */
  format?: 'choice' | 'myth';
  topic: string;
  question: string;
  options: string[];
  correct: number;
  why: string;
  source: { name: string; short: string; url: string; quote: string };
  verified: string;
  photo: string;
  /** The RecipeFix line, tied to this fact; product claims it relies on. */
  tie: string;
  claims: string[];
  /** Written by a person for the post; hashtags without #. */
  caption: string;
  tags: string[];
}

export function loadFacts(file = path.join(REPO_ROOT, 'packages/marketing/facts/food-facts.yaml')): Fact[] {
  const doc = yaml.load(readFileSync(file, 'utf8')) as { facts: Fact[] };
  for (const f of doc.facts) {
    if (f.format === 'myth') f.options = ['Myth', 'Fact'];
    if (f.correct < 0 || f.correct >= f.options.length) throw new Error(`${f.id}: correct index out of range`);
    if (f.options.length < 2 || f.options.length > 4) throw new Error(`${f.id}: 2–4 options`);
    if (!f.source?.url || !f.source.quote) throw new Error(`${f.id}: every fact needs a source url and quote`);
    if (!f.tie || !f.caption || !f.tags?.length || !f.claims?.length) throw new Error(`${f.id}: needs tie, caption, tags and claims`);
  }
  return doc.facts;
}

const TOPIC: Record<string, { label: string; tags: string[]; close: string }> = {
  'gluten-free': { label: 'Gluten-free quiz', tags: ['glutenfree', 'foodlabels', 'foodfacts', 'cookingtips'], close: 'Save this for your next grocery run.' },
  allergies: { label: 'Food label quiz', tags: ['foodallergies', 'foodlabels', 'foodfacts'], close: 'Save this for your next grocery run.' },
  vegan: { label: 'Vegan quiz', tags: ['vegan', 'veganfood', 'foodfacts'], close: 'Save this for your next grocery run.' },
  vegetarian: { label: 'Vegetarian quiz', tags: ['vegetarian', 'cheese', 'foodfacts'], close: 'Save this for your next cheese run.' },
  'cooking-myths': { label: 'Myth or fact', tags: ['cookingtips', 'foodscience', 'kitchenmyths'], close: 'Save this before you cook with wine again.' },
};

/** Long enough to commit to an answer (research: 3–7 s is the norm). */
const TIMER_SECONDS = 5;
const LETTERS = ['A', 'B', 'C', 'D'];
const spokenAnswer = (opt: string) => (/^(yes|no|myth|fact)$/i.test(opt) ? `${opt}.` : `It's ${opt.replace(/^About/, 'about').replace(/^Under/, 'under')}.`);

export interface QuizSet {
  label: string;
  facts: string[];
  caption: string;
  tie: string;
  tags: string[];
  claims: string[];
}

export function loadSets(file = path.join(REPO_ROOT, 'packages/marketing/facts/food-facts.yaml')): Record<string, QuizSet> {
  return ((yaml.load(readFileSync(file, 'utf8')) as { sets?: Record<string, QuizSet> }).sets ?? {}) as Record<string, QuizSet>;
}

/** `set:<name>` expands to that set's facts; plain ids are facts. */
export async function makeQuiz(args: string[], opts: { voice: boolean; date?: string }): Promise<StudioRecord> {
  const facts = loadFacts();
  const setName = args.length === 1 && args[0]!.startsWith('set:') ? args[0]!.slice(4) : null;
  const set = setName ? loadSets()[setName] : null;
  if (setName && !set) throw new Error(`unknown set ${setName}; known: ${Object.keys(loadSets()).join(', ')}`);
  const factIds = set ? set.facts : args;
  const chosen = factIds.map((id) => {
    const f = facts.find((x) => x.id === id);
    if (!f) throw new Error(`unknown fact ${id}; known: ${facts.map((x) => x.id).join(', ')}`);
    return f;
  });
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const paused = productPostsPaused(pack);
  for (const id of new Set([...chosen.flatMap((f) => f.claims), ...(set?.claims ?? [])])) if (!isQuotable(claimById(pack, id))) throw new Error(`${id} is not quotable in the pack at ${pack.commit}`);

  const s = openStudio('quiz', setName ?? chosen.map((f) => f.id).join('+'), opts.date);
  const topic = TOPIC[chosen[0]!.topic] ?? { label: 'Food quiz', tags: ['foodfacts', 'cookingtips'], close: 'Save this one for later.' };
  const one = chosen.length === 1;
  const label = set?.label ?? (one ? topic.label : 'Food quiz');
  const fx = sfx(s);

  // ── Timeline: the narrator's clock, or reading time when silent ──
  const sec = (x: number) => Math.ceil(x * FPS);
  const read = (t: string, wps: number, min: number) => Math.max(min, t.split(/\s+/).length / wps);
  let t = 0;
  const questions = [];
  for (const [i, f] of chosen.entries()) {
    const qv = opts.voice ? await voice(s, f.question, `q${i + 1}`) : null;
    const av = opts.voice ? await voice(s, spokenAnswer(f.options[f.correct]!), `a${i + 1}`) : null;
    const wv = opts.voice ? await voice(s, f.why, `why${i + 1}`) : null;
    const start = t;
    const countdownAt = start + Math.max(sec(1.6), 6 + sec(qv?.seconds ?? read(`${f.question} ${f.options.join(' ')}`, 3.2, 2.2)) + 8);
    const revealAt = countdownAt + TIMER_SECONDS * FPS;
    const whyAt = revealAt + Math.max(sec(1.1), 6 + sec(av?.seconds ?? 0) + 4);
    const end = whyAt + sec(wv?.seconds ?? read(f.why, 3.4, 2.8)) + sec(1.0);
    questions.push({
      question: f.question,
      options: f.options,
      correct: f.correct,
      why: f.why,
      source: f.source.short,
      photo: await originalPhoto(s, f.photo, 'wide'),
      start,
      countdownAt,
      revealAt,
      whyAt,
      end,
      audio: { question: qv?.file ?? null, answer: av?.file ?? null, why: wv?.file ?? null },
    });
    t = end;
  }
  const tie = set?.tie ?? chosen[0]!.tie;
  const cv = opts.voice ? await voice(s, tie, 'close') : null;
  const closeStart = t;
  const total = closeStart + Math.max(sec(3.4), 4 + sec(cv?.seconds ?? 0) + 30);
  const props = {
    label,
    questions,
    close: { start: closeStart, tie, audio: cv?.file ?? null, photo: questions[0]!.photo },
    sfx: fx,
  };
  writeJson(`${s.dir}/render-props.json`, props);

  const video = await renderVideo(s, 'QuizShort', props, total, s.id);
  contactSheet(video, `${s.dir}/contact.png`, 1.0);

  // ── Posts: the video everywhere; captions are templates over the fact ──
  const tags = (set?.tags ?? [...new Set(chosen.flatMap((f) => f.tags))].slice(0, 5)).map((x) => `#${x}`).join(' ');
  const f0 = chosen[0]!;
  const answerLine = (f: Fact) => (f.format === 'myth' ? f.options[f.correct]! : `${LETTERS[f.correct]}) ${f.options[f.correct]}`);
  const sourceLine = (f: Fact) => `Source: ${f.source.short}`;
  const hook = set?.caption ?? (one ? f0.caption : `${chosen.length} questions, 5 seconds each. Keep score.`);
  const media = [relRepo(video)];
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `${hook}\n\n${tags}`, ai_voice: opts.voice, cover_ms: Math.round(((questions[0]!.countdownAt + 10) / FPS) * 1000) },
    instagram_reel: {
      platform: 'instagram',
      kind: 'video',
      media,
      text: `${hook}\n\n${chosen.map((f) => `Answer: ${f.options[f.correct]}. ${f.why}\n${sourceLine(f)}`).join('\n\n')}\n\n${topic.close}\n\n${tags}`,
      ai_voice: opts.voice,
    },
    youtube: {
      platform: 'youtube',
      kind: 'video',
      media,
      title: `${f0.question} #shorts`.slice(0, 100),
      text: `${chosen.map((f) => `Answer: ${f.options[f.correct]}. ${f.why}\n${sourceLine(f)} (${f.source.url})`).join('\n\n')}\n\n${tie} https://recipefix.app`,
      ai_voice: opts.voice,
    },
    x: { platform: 'x', kind: 'video', media, text: hook, thread: chosen.map((f) => `Answer: ${answerLine(f)}\n\n${f.why}\n\n${sourceLine(f)}`) },
    threads: { platform: 'threads', kind: 'video', media, text: hook, thread: chosen.map((f) => `Answer: ${answerLine(f)}\n\n${f.why}\n\n${sourceLine(f)}`) },
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  const target = one ? [8, 25] : [20, 70];
  checks.push(check('video.duration', d >= target[0]! && d <= target[1]!, `${d.toFixed(1)} s (target ${target.join('–')} s)`));
  const loud = loudnessChecked(video);
  checks.push(check('audio.loudness', !opts.voice || (Math.abs(loud.lufs + 14) <= 1.5 && loud.peak <= -0.5), `${loud.lufs} LUFS, peak ${loud.peak} dBFS${opts.voice ? '' : ' (silent cut: ticks and chime only, not held to −14)'}`));
  if (opts.voice) checks.push(transcriptCheck(s, video, [...chosen.flatMap((f) => [f.question, spokenAnswer(f.options[f.correct]!), f.why]), tie].join(' ')));
  for (const [i, q] of questions.entries()) {
    const f = chosen[i]!;
    checks.push(...(await qaFrame(s, video, (q.countdownAt + 20) / FPS, `q${i + 1}-question`, [...(f.question.toLowerCase().includes(label.toLowerCase().split(' ')[0]!) ? [] : [label]), f.question, ...(f.format === 'myth' ? [] : f.options)])));
    // The right option's words often recur in the why ("Soy sauce"): read each word once, so check the option only when it is not repeated.
    const answerLines = [f.question, f.why, sourceLine(f)];
    // A myth/fact verdict is a rotated stamp: OCR cannot read it reliably, so the stamp is checked by eye in the contact sheet.
    if (f.format !== 'myth' && !f.why.toLowerCase().includes(f.options[f.correct]!.toLowerCase())) answerLines.splice(1, 0, f.options[f.correct]!);
    checks.push(...(await qaFrame(s, video, (q.end - 3) / FPS, `q${i + 1}-answer`, answerLines)));
  }
  checks.push(...(await qaFrame(s, video, (total - 3) / FPS, 'close', [tie, 'recipefix.app'])));

  const limits: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500, youtube: 5000 };
  const problems: string[] = [];
  const onScreen = [label, ...chosen.flatMap((f) => [f.question, f.why, sourceLine(f), ...f.options]), tie];
  const everything = [...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? '']), ...onScreen];
  for (const [k, p] of Object.entries(posts)) {
    for (const part of [p.text, ...(p.thread ?? [])]) if (part.length > limits[p.platform]!) problems.push(`${k}: ${part.length} chars > ${limits[p.platform]}`);
    if (p.platform === 'x' && /https?:\/\//.test([p.text, ...(p.thread ?? [])].join(' '))) problems.push(`${k}: no links on X quiz posts`);
  }
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}): "${ex}" in "${txt.slice(0, 60)}"`);
  if (/comment below|follow for|like if|tag a friend/i.test(everything.join(' '))) problems.push('engagement bait wording');
  problems.push(...humanTextProblems(everything));
  checks.push(check('copy.platform_rules', problems.length === 0, 'caption lengths, no X links, no forbidden claims, no bait, reads human (no em dashes, no stock AI phrasing)', problems));
  checks.push(check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? '?').slice(0, 8)} has a release receipt`));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'quiz',
    summary: chosen.map((f) => f.question).join(' / '),
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video) },
    posts,
    sources: chosen.map((f) => ({ name: f.source.name, url: f.source.url, quote: f.source.quote })),
    claims: [...new Set([...chosen.flatMap((f) => f.claims), ...(set?.claims ?? [])])],
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: opts.voice, tiktok_is_aigc: opts.voice, photos: 'licensed stock behind the card; not the dish discussed', knowledge_commit: pack.commit },
  };
  writeJson(`${s.dir}/record.json`, record);
  writeStudioPreview(s, record);
  return record;
}
