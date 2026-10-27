/**
 * Non-video post types: swipe carousels (Instagram 4:5), TikTok photo-mode
 * slideshows (9:16), single feed images, and X text posts.
 *
 *   pnpm mk slides quiz <set>        quiz as a carousel: cover → questions → answer key → close
 *   pnpm mk slides swaps <topic>     swap guide from a stored real RecipeFix result
 *   pnpm mk image <fact-id>          one 4:5 image (question only) + X text variant; answer in the caption / reply
 *
 * Nothing here calls a model. Questions, answers, whys and sources come from
 * facts/food-facts.yaml unchanged; swap guides quote the stored result and
 * every quote is checked to be a verbatim substring of the field it names;
 * hooks and captions are written by a person in facts/slides.yaml.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import sharp from 'sharp';
import { loadLocalAsset, loadStoredOutput, sha256 } from '../assets.js';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused, type KnowledgePack } from '../knowledge.js';
import { loadIdeas, REPO_ROOT, RUNS_DIR } from '../runContext.js';
import {
  check,
  gitBytes,
  humanTextProblems,
  openStudio,
  qaFrame,
  RECIPEFIX_REF,
  RECIPEFIX_REPO,
  relRepo,
  renderStills,
  runCost,
  writeJson,
  writeStudioPreview,
  type PlatformPost,
  type Studio,
  type StudioRecord,
} from '../studio.js';
import { loadFacts, loadSets, type Fact } from './quiz.js';
import { CANVAS, CHAR_EM, FACT, QUIZ, SWAP, TEXT_SAFE, wrapLines, type Canvas } from '../../video/slideLayout.js';
import type { QuizSlide, SwapSlide } from '../../video/Slides.js';

const SLIDES_FILE = path.join(REPO_ROOT, 'packages/marketing/facts/slides.yaml');
const CAPTURES = path.join(RUNS_DIR, '2026-10-26/captures-v2');
const LETTERS = ['A', 'B', 'C', 'D'];
const QUESTION_GROUNDS = ['#2A9D8F', '#C8553D', '#5B8E3E', '#3B6EA8'];
const COVER_GROUND = '#C1714F';
const CLOSE_GROUND = '#A65336';
const TOPIC: Record<string, { label: string; color: string }> = {
  'gluten-free': { label: 'Gluten-free quiz', color: '#E07A3F' },
  allergies: { label: 'Food label quiz', color: '#2A9D8F' },
  vegan: { label: 'Vegan quiz', color: '#5B8E3E' },
  vegetarian: { label: 'Vegetarian quiz', color: '#C8553D' },
  'cooking-myths': { label: 'Myth or fact', color: '#3B6EA8' },
  'kitchen-math': { label: 'Kitchen math', color: '#E07A3F' },
  'food-history': { label: 'Food history', color: '#C8553D' },
  labels: { label: 'Label detective', color: '#2A9D8F' },
};
const LIMITS: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500 };

interface QuizDeckCopy {
  kicker: string;
  cover: string;
  photo: string;
  caption: string;
  title: string;
  save: string;
}
interface ProofRef {
  path: string;
  quote?: string;
}
interface SwapGuide {
  proof: { file: string; export: string; captured: string };
  kicker: string;
  cover: string;
  cover_sub: string;
  photo: string;
  photo_focus?: { left?: number; top?: number };
  photo_label: string;
  dish: string;
  starting_recipe: string;
  proof_shots: Array<{ file: string; crop: { left: number; top: number; width: number; height: number } }>;
  swaps: Array<{ from: string; to: string; label?: string; steps_label?: string; as_written: ProofRef; adapted: ProofRef; why: ProofRef; steps: ProofRef[] }>;
  expect: { title: string; lines: ProofRef[] };
  tie: string;
  claims: string[];
  caption: string;
  title: string;
  tags: string[];
}
interface SlidesFile {
  quiz_decks: Record<string, QuizDeckCopy>;
  image_hooks: Record<string, string>;
  swap_guides: Record<string, SwapGuide>;
}

export function loadSlidesFile(): SlidesFile {
  return yaml.load(readFileSync(SLIDES_FILE, 'utf8')) as SlidesFile;
}

/** One slide: what is on it, and the lines QA must read back from the exported file. */
interface Planned<T> {
  slide: T;
  name: string;
  intended: Array<string | { text: string; min?: number }>;
}

// ─────────────────────────────── shared ───────────────────────────────

/**
 * An Original's licensed 1600² master, cropped to exactly the aspect of the
 * box it is drawn in and downscaled to it (never upscaled). Returns the file
 * and a check that proves the aspect matches, so nothing can be squashed.
 */
async function photoFor(s: Studio, originalId: string, w: number, h: number, focus: { left?: number; top?: number } = {}): Promise<{ file: string; check: GateCheck }> {
  const out = `photo-${originalId}-${w}x${h}.jpg`;
  const src = `public/images/originals/${originalId}-1x1.webp`;
  const bytes = gitBytes(src);
  const meta = await sharp(bytes).metadata();
  const sw = meta.width!;
  const sh = meta.height!;
  const target = w / h;
  let cw = sw;
  let ch = Math.round(sw / target);
  if (ch > sh) {
    ch = sh;
    cw = Math.round(sh * target);
  }
  const left = Math.max(0, Math.min(sw - cw, focus.left ?? Math.round((sw - cw) / 2)));
  const top = Math.max(0, Math.min(sh - ch, focus.top ?? Math.round((sh - ch) / 2)));
  const file = path.join(s.pub, out);
  if (!existsSync(file)) {
    await sharp(bytes).extract({ left, top, width: cw, height: ch }).resize(w, h, { fit: 'fill' }).jpeg({ quality: 92 }).toFile(file);
    s.assets.push({
      id: out,
      provenance: `recipe-fix ${RECIPEFIX_REF.slice(0, 8)}:${src}, crop ${cw}×${ch}+${left}+${top} → ${w}×${h}`,
      licence: 'Licensed stock (Unsplash/Pexels) per RecipeFix docs/RECIPEFIX_ORIGINALS.md; never "our photo"',
      sha256: sha256(bytes),
    });
  }
  const drift = Math.abs(cw / ch - target) / target;
  const upscale = cw < w || ch < h;
  return { file: out, check: check(`photo.aspect:${out}`, drift <= 0.005 && !upscale, `crop ${cw}×${ch} (aspect ${(cw / ch).toFixed(4)}) drawn at ${w}×${h} (${target.toFixed(4)}); ${upscale ? 'UPSCALED' : 'downscale only'}`) };
}

/** Render a deck at one canvas, QA every exported JPEG, return files and checks. */
async function renderDeck<T>(s: Studio, composition: string, canvas: Canvas, props: Record<string, unknown>, plan: Array<Planned<T>>, prefix: string): Promise<{ files: string[]; checks: GateCheck[] }> {
  const dir = path.join(s.dir, 'slides');
  mkdirSync(dir, { recursive: true });
  const files = await renderStills(s, composition, props, plan.map((_, i) => i), path.join('slides', prefix));
  const named: string[] = [];
  const checks: GateCheck[] = [];
  for (const [i, f] of files.entries()) {
    const name = path.join(dir, `${prefix}-${String(i + 1).padStart(2, '0')}-${plan[i]!.name}.jpg`);
    rmSync(name, { force: true });
    writeFileSync(name, readFileSync(f));
    rmSync(f, { force: true });
    rmSync(f.replace(/\.jpg$/, '.png'), { force: true });
    named.push(name);
    const meta = await sharp(name).metadata();
    checks.push(check(`${prefix}-${i + 1}:file`, meta.format === 'jpeg' && meta.width === CANVAS[canvas].width && meta.height === CANVAS[canvas].height, `${meta.format} ${meta.width}×${meta.height}`));
    checks.push(...(await qaFrame(s, name, 0, `${prefix}-${i + 1}-${plan[i]!.name}`, plan[i]!.intended, CANVAS[canvas], TEXT_SAFE[canvas])));
  }
  return { files: named, checks };
}

/** Contact sheet of a deck at 360 px wide, for the viewer review. */
async function contact(files: string[], out: string): Promise<void> {
  const w = 360;
  const tiles = await Promise.all(files.map((f) => sharp(f).resize({ width: w }).toBuffer({ resolveWithObject: true })));
  const h = Math.max(...tiles.map((t) => t.info.height));
  const cols = Math.min(4, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const gap = 12;
  await sharp({ create: { width: cols * w + (cols + 1) * gap, height: rows * h + (rows + 1) * gap, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((t, i) => ({ input: t.data, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) })))
    .jpeg({ quality: 85 })
    .toFile(out);
}

const hashtags = (tags: string[], n: number) => {
  const t = [...new Set(tags.map((x) => x.replace(/^#/, '')))].filter((x) => x !== 'recipefix').slice(0, n - 1);
  return [...t, 'recipefix'].map((x) => `#${x}`).join(' ');
};

function copyChecks(pack: KnowledgePack, posts: Record<string, PlatformPost>, onScreen: string[], extra: string[] = []): GateCheck[] {
  const problems: string[] = [...extra];
  const everything = [...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? '']), ...onScreen];
  for (const [k, p] of Object.entries(posts)) {
    for (const part of [p.text, ...(p.thread ?? [])]) if (part.length > LIMITS[p.platform]!) problems.push(`${k}: ${part.length} chars > ${LIMITS[p.platform]}`);
    if (p.platform === 'x' && /https?:\/\/|\b[a-z0-9-]+\.(app|com|org)\b/i.test(p.text)) problems.push(`${k}: no links in the main X post`);
    if (p.title && p.title.length > 90) problems.push(`${k}: title ${p.title.length} chars > 90`);
    const tags: string[] = p.text.match(/#\w+/g) ?? [];
    if (tags.length < 3 || tags.length > 5 || !tags.includes('#recipefix')) problems.push(`${k}: ${tags.length} hashtags (want 3 to 5 incl. #recipefix)`);
  }
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}): "${ex}" in "${txt.slice(0, 60)}"`);
  if (/comment below|follow for|like if|tag a friend|smash that/i.test(everything.join(' '))) problems.push('engagement bait wording');
  problems.push(...humanTextProblems(everything));
  return [check('copy.platform_rules', problems.length === 0, 'lengths, X titles, no link in the X post, 3–5 hashtags incl. #recipefix, no forbidden claims, no bait, reads human', problems)];
}

function packFor(claims: string[]): { pack: KnowledgePack; checks: GateCheck[] } {
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const bad = claims.filter((id) => !isQuotable(claimById(pack, id)));
  if (bad.length) throw new Error(`not quotable in the pack at ${pack.commit}: ${bad.join(', ')}`);
  const paused = productPostsPaused(pack);
  return { pack, checks: [check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? '?').slice(0, 8)} has a release receipt`)] };
}

function finish(s: Studio, r: Omit<StudioRecord, 'schema' | 'id' | 'made_at' | 'assets' | 'cost_usd'>): StudioRecord {
  const record: StudioRecord = { schema: 1, id: s.id, made_at: new Date().toISOString(), assets: s.assets, cost_usd: runCost(s), ...r };
  writeJson(path.join(s.dir, 'record.json'), record);
  writeStudioPreview(s, record);
  rmSync(path.join(s.dir, 'qa-frames'), { recursive: true, force: true });
  return record;
}

const answerLabel = (f: Fact) => (f.format === 'myth' ? f.options[f.correct]!.toUpperCase() : `${LETTERS[f.correct]}) ${f.options[f.correct]}`);
const answerReply = (f: Fact) => `Answer: ${f.format === 'myth' ? f.options[f.correct]! : `${LETTERS[f.correct]}) ${f.options[f.correct]}`}\n\n${f.why}\n\nSource: ${f.source.short}`;

// ─────────────────────────────── quiz carousel ───────────────────────────────

function answerPages(facts: Fact[], canvas: Canvas): Fact[][] {
  // Photo mode: one reveal per swipe, with the question repeated, at a size a phone reads at arm's length.
  if (canvas === 'tall') return facts.map((f) => [f]);
  const L = QUIZ[canvas];
  const textW = L.answers.w - 92 - 48;
  const need = (f: Fact) => 64 + 12 + wrapLines(f.why, 32, textW, CHAR_EM.inter) * 41 + 10 + wrapLines(`Source: ${f.source.short}`, 28, textW, CHAR_EM.inter) * 35 + 48;
  const gap = canvas === 'feed' ? 30 : 24;
  const pages: Fact[][] = [];
  let used = 0;
  for (const f of facts) {
    const n = need(f);
    const cur = pages.at(-1);
    if (cur && used + gap + n <= L.answers.h) {
      cur.push(f);
      used += gap + n;
    } else {
      pages.push([f]);
      used = n;
    }
  }
  return pages;
}

async function quizPlan(s: Studio, deck: QuizDeckCopy, facts: Fact[], tie: string, canvas: Canvas, photoChecks: GateCheck[]): Promise<Array<Planned<QuizSlide>>> {
  const L = QUIZ[canvas];
  const card = async (id: string, b: { w: number; h: number }) => {
    const p = await photoFor(s, id, b.w - 20, b.h - 20);
    photoChecks.push(p.check);
    return p.file;
  };
  if (facts.some((f) => f.photo === deck.photo)) throw new Error(`cover photo ${deck.photo} repeats a question photo`);
  const plan: Array<Planned<QuizSlide>> = [];
  const count = facts.length;
  plan.push({
    name: 'cover',
    slide: { kind: 'cover', kicker: deck.kicker, headline: deck.cover, photo: await card(deck.photo, L.coverPhoto), count, color: COVER_GROUND },
    intended: [deck.kicker, deck.cover, `${count} questions, answers at the end`, 'Swipe'],
  });
  for (const [i, f] of facts.entries()) {
    const myth = f.format === 'myth';
    const banner = `${deck.kicker}: ${i + 1} of ${count}`;
    plan.push({
      name: `q${i + 1}`,
      slide: { kind: 'question', n: i + 1, total: count, kicker: deck.kicker, question: f.question, options: f.options, myth, photo: await card(f.photo, L.qPhoto), color: QUESTION_GROUNDS[i % QUESTION_GROUNDS.length]! },
      // A one-character option ("3") is checked by eye: OCR cannot read a lone glyph and would steal it from "5 and 1/3".
      intended: [banner, f.question, ...(myth ? ['MYTH', 'FACT'] : f.options.filter((o) => o.replace(/\W/g, '').length > 2)), i + 1 === count ? 'Lock it in, then swipe for the answers' : 'Lock it in, then swipe'],
    });
  }
  const pages = answerPages(facts, canvas);
  for (const [p, page] of pages.entries()) {
    const title = pages.length > 1 ? `Answers ${p + 1}/${pages.length}` : 'Answers';
    plan.push({
      name: `answers${pages.length > 1 ? p + 1 : ''}`,
      slide: {
        kind: 'answers',
        title,
        items: page.map((f) => ({ n: facts.indexOf(f) + 1, question: f.question, answer: answerLabel(f), myth: f.format === 'myth', correctIsMyth: /myth/i.test(f.options[f.correct]!), why: f.why, source: f.source.short })),
      },
      intended: [title.replace(/\d\/\d/, '').trim(), ...page.flatMap((f) => [...(page.length === 1 ? [f.question] : []), answerLabel(f), f.why, `Source: ${f.source.short}`])],
    });
  }
  plan.push({ name: 'close', slide: { kind: 'close', tie, save: deck.save, color: CLOSE_GROUND }, intended: [deck.save, tie, 'recipefix.app'] });
  return plan;
}

export async function makeQuizSlides(setName: string, opts: { date?: string } = {}): Promise<StudioRecord> {
  const sets = loadSets();
  const set = sets[setName];
  const decks = loadSlidesFile().quiz_decks;
  const deck = decks[setName];
  if (!set || !deck) throw new Error(`unknown quiz set ${setName}; with slide copy: ${Object.keys(decks).join(', ')}`);
  const all = loadFacts();
  const facts = set.facts.map((id) => all.find((f) => f.id === id) ?? (() => { throw new Error(`unknown fact ${id}`); })());
  const { pack, checks: packChecks } = packFor([...new Set([...set.claims, ...facts.flatMap((f) => f.claims)])]);
  const s = openStudio('slides-quiz', setName, opts.date);
  rmSync(path.join(s.dir, 'slides'), { recursive: true, force: true });
  const photoChecks: GateCheck[] = [];
  const feedPlan = await quizPlan(s, deck, facts, set.tie, 'feed', photoChecks);
  const tallPlan = await quizPlan(s, deck, facts, set.tie, 'tall', photoChecks);
  writeJson(path.join(s.dir, 'render-props.json'), { feed: feedPlan.map((p) => p.slide), tall: tallPlan.map((p) => p.slide) });
  const ig = await renderDeck(s, 'QuizDeckFeed', 'feed', { canvas: 'feed', slides: feedPlan.map((p) => p.slide) }, feedPlan, 'ig');
  const tt = await renderDeck(s, 'QuizDeckTall', 'tall', { canvas: 'tall', slides: tallPlan.map((p) => p.slide) }, tallPlan, 'tiktok');
  mkdirSync(path.join(s.dir, 'review'), { recursive: true });
  await contact(ig.files, path.join(s.dir, 'review/contact-ig.jpg'));
  await contact(tt.files, path.join(s.dir, 'review/contact-tiktok.jpg'));

  const igTags = hashtags(set.tags.filter((t) => t !== 'foodtok'), 5);
  const ttTags = hashtags(set.tags, 5);
  const shortTags = hashtags(set.tags.filter((t) => t !== 'foodtok'), 3);
  const questionSlides = ig.files.filter((_, i) => feedPlan[i]!.slide.kind === 'question').slice(0, 4).map(relRepo);
  const xText = `${deck.cover}\n\n${facts.length} questions. Answers in the reply, no peeking.\n\n${shortTags}`;
  const replies = [...facts.map(answerReply), set.tie];
  const posts: Record<string, PlatformPost> = {
    instagram_carousel: { platform: 'instagram', kind: 'carousel', media: ig.files.map(relRepo), text: `${deck.caption}\n\n${set.tie}\n\n${igTags}` },
    tiktok_photos: { platform: 'tiktok', kind: 'carousel', media: tt.files.map(relRepo), title: deck.title, text: `${deck.caption}\n\n${ttTags}` },
    x: { platform: 'x', kind: 'image', media: questionSlides, text: xText, thread: replies },
    threads: { platform: 'threads', kind: 'image', media: questionSlides, text: xText, thread: replies },
  };
  const onScreen = [...feedPlan, ...tallPlan].flatMap((p) => p.intended.map((l) => (typeof l === 'string' ? l : l.text)));
  const checks: GateCheck[] = [
    ...ig.checks,
    ...tt.checks,
    ...photoChecks,
    check('payload.counts', ig.files.length >= 2 && ig.files.length <= 20 && tt.files.length <= 35 && questionSlides.length <= 4, `${ig.files.length} Instagram slides (2–20), ${tt.files.length} TikTok photos (≤35), ${questionSlides.length} X images (≤4)`),
    ...copyChecks(pack, posts, onScreen),
    ...packChecks,
  ];
  return finish(s, {
    format: 'slides-quiz',
    summary: `${deck.kicker}: ${facts.map((f) => f.question).join(' / ')}`,
    outputs: { slides: ig.files.map(relRepo), tiktok_slides: tt.files.map(relRepo) },
    posts,
    sources: facts.map((f) => ({ name: f.source.name, url: f.source.url, quote: f.source.quote })),
    claims: [...new Set([...set.claims, ...facts.flatMap((f) => f.claims)])],
    qa: { passed: checks.every((c) => c.passed), checks },
    disclosures: { ai_voice: false, tiktok_is_aigc: false, photos: 'licensed stock RecipeFix Originals photos as mood; not the dish discussed', knowledge_commit: pack.commit },
  });
}

// ─────────────────────────────── swap guide ───────────────────────────────

function resolvePath(obj: unknown, p: string): unknown {
  return p
    .split(/\.|\[|\]/)
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

/** The proof's own words: the whole field, or a quote that is a verbatim substring of it. */
function quote(proof: Record<string, unknown>, ref: ProofRef, problems: string[]): string {
  const v = resolvePath(proof, ref.path);
  if (typeof v !== 'string') {
    problems.push(`${ref.path} is not a string in the proof`);
    return '';
  }
  if (!ref.quote) return v;
  if (!v.includes(ref.quote)) problems.push(`"${ref.quote.slice(0, 50)}…" is not verbatim in ${ref.path}`);
  // A fragment is shown as a sentence: capitalised, and closed with a period when it stops mid-sentence.
  const q = ref.quote.charAt(0).toUpperCase() + ref.quote.slice(1);
  return /[.!?]$/.test(q) ? q : `${q}.`;
}

const prettyDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function makeSwapSlides(topic: string, opts: { date?: string } = {}): Promise<StudioRecord> {
  const guides = loadSlidesFile().swap_guides;
  const g = guides[topic];
  if (!g) throw new Error(`unknown swap guide ${topic}; known: ${Object.keys(guides).join(', ')}`);
  const { pack, checks: packChecks } = packFor(g.claims);
  const ref = { repo: RECIPEFIX_REPO, commit: RECIPEFIX_REF };
  const stored = loadStoredOutput(ref, g.proof.file, g.proof.export);
  const proof = stored.data;
  if (stored.capturedOn !== g.proof.captured) throw new Error(`proof captured ${stored.capturedOn}, guide says ${g.proof.captured}`);
  const proofProblems: string[] = [];
  const servesFrom = Number(proof.originalServings);
  const servesTo = Number(proof.servings);
  const s = openStudio('slides-swaps', topic, opts.date);
  s.assets.push({ id: stored.record.id, provenance: `${stored.record.location}: ${stored.record.provenance}`, licence: stored.record.licence, sha256: stored.record.sha256 });
  rmSync(path.join(s.dir, 'slides'), { recursive: true, force: true });
  const footer = `Real RecipeFix result, captured ${prettyDate(g.proof.captured)}`;
  const swaps = g.swaps.map((w) => ({
    from: w.from,
    to: w.to,
    label: w.label,
    stepsLabel: w.steps_label,
    asWritten: quote(proof, w.as_written, proofProblems),
    adapted: quote(proof, w.adapted, proofProblems),
    why: quote(proof, w.why, proofProblems),
    steps: w.steps.map((r) => quote(proof, r, proofProblems)),
  }));
  const expectLines = g.expect.lines.map((r) => quote(proof, r, proofProblems));

  // Real app screens, cropped from the v2 captures (exact DOM boxes) and scaled to the slide column.
  const shotsFor = async (width: number) => {
    const out: Array<{ src: string; w: number; h: number }> = [];
    for (const sh of g.proof_shots) {
      const a = loadLocalAsset(path.join(CAPTURES, sh.file), 'product_capture', 'RecipeFix UI at commit e68b1404 (the live tree on 2026-10-26), local production build with a simulated backend; the adaptation shown is the verbatim stored production result captured 2026-10-21 (runs/2026-10-26/captures-v2/capture.json)', 'first-party capture');
      const h = Math.round((sh.crop.height / sh.crop.width) * width);
      const name = `shot-${sh.file.replace(/\.png$/, '')}-${width}.png`;
      await sharp(a.bytes).extract(sh.crop).resize(width, h).png().toFile(path.join(s.pub, name));
      if (!s.assets.some((x) => x.id === name)) s.assets.push({ id: name, provenance: `${a.record.provenance}; crop ${JSON.stringify(sh.crop)} → ${width}×${h}`, licence: a.record.licence, sha256: a.record.sha256 });
      out.push({ src: name, w: width, h });
    }
    return out;
  };

  const photoChecks: GateCheck[] = [];
  const plan = async (canvas: Canvas): Promise<Array<Planned<SwapSlide>>> => {
    const L = SWAP[canvas];
    const cover = await photoFor(s, g.photo, L.coverPhoto.w, L.coverPhoto.h, g.photo_focus);
    const ph = canvas === 'feed' ? 360 - 16 : 300 - 16;
    const round = await photoFor(s, g.photo, ph, ph, g.photo_focus);
    photoChecks.push(cover.check, round.check);
    const total = swaps.length;
    const out: Array<Planned<SwapSlide>> = [
      { name: 'cover', slide: { kind: 'cover', kicker: g.kicker, headline: g.cover, sub: g.cover_sub, photo: cover.file, photoLabel: g.photo_label }, intended: [g.photo_label, g.kicker, g.cover, g.cover_sub, 'Swipe'] },
      { name: 'proof', slide: { kind: 'proof', kicker: 'The real result', headline: g.dish, shots: await shotsFor(SWAP[canvas].shotW), lines: [footer, g.starting_recipe] }, intended: ['The real result', g.dish, footer, g.starting_recipe] },
      ...swaps.map((w, i) => ({
        name: `swap${i + 1}`,
        slide: { kind: 'swap' as const, n: i + 1, total, label: w.label, stepsLabel: w.stepsLabel, from: w.from, to: w.to, asWritten: w.asWritten, adapted: w.adapted, servesFrom, servesTo, why: w.why, steps: w.steps },
        intended: [
          `Swap ${i + 1} of ${total}`,
          ...(w.label ? [w.label] : []),
          { text: w.from, min: 0.5 },
          w.to,
          `Serves ${servesFrom}`,
          w.asWritten,
          `Serves ${servesTo}`,
          w.adapted,
          w.stepsLabel ?? 'What changes in the steps',
          ...w.steps,
          `Why: ${w.why}`,
          footer,
        ],
      })),
      { name: 'expect', slide: { kind: 'expect', title: g.expect.title, lines: expectLines }, intended: [g.expect.title, ...expectLines, footer] },
      { name: 'close', slide: { kind: 'close', tie: g.tie, save: 'Save this guide', photo: round.file }, intended: [g.tie, 'recipefix.app', 'Save this guide'] },
    ];
    return out;
  };
  const feedPlan = await plan('feed');
  const tallPlan = await plan('tall');
  writeJson(path.join(s.dir, 'render-props.json'), { feed: feedPlan.map((p) => p.slide), tall: tallPlan.map((p) => p.slide) });
  const band = await photoFor(s, g.photo, 1080, 630, { left: 0, top: 9999 });
  photoChecks.push(band.check);
  const ig = await renderDeck(s, 'SwapDeckFeed', 'feed', { canvas: 'feed', footer, slides: feedPlan.map((p) => p.slide) }, feedPlan, 'ig');
  const tt = await renderDeck(s, 'SwapDeckTall', 'tall', { canvas: 'tall', footer, band: band.file, slides: tallPlan.map((p) => p.slide) }, tallPlan, 'tiktok');
  mkdirSync(path.join(s.dir, 'review'), { recursive: true });
  await contact(ig.files, path.join(s.dir, 'review/contact-ig.jpg'));
  await contact(tt.files, path.join(s.dir, 'review/contact-tiktok.jpg'));

  const xMedia = [0, 2, 3, 4].map((i) => relRepo(ig.files[i]!));
  const xText = `The dairy-free swaps were the easy part. What matters is what each one changes in the steps.\n\nFrom a real RecipeFix result, a tikka masala scaled 4 to 6 servings.\n\n${hashtags(['dairyfree', 'cookingtips'], 3)}`;
  const replies = [
    ...swaps.map((w) => `${w.to} for ${w.from.toLowerCase()}: ${w.steps.join(' ')}`.slice(0, 280)),
    `${g.starting_recipe}. ${footer}.`,
  ];
  const posts: Record<string, PlatformPost> = {
    instagram_carousel: { platform: 'instagram', kind: 'carousel', media: ig.files.map(relRepo), text: `${g.caption}\n\n${hashtags(g.tags, 5)}` },
    tiktok_photos: { platform: 'tiktok', kind: 'carousel', media: tt.files.map(relRepo), title: g.title, text: `${g.caption}\n\n${hashtags(g.tags, 5)}` },
    x: { platform: 'x', kind: 'image', media: xMedia, text: xText, thread: replies },
    threads: { platform: 'threads', kind: 'image', media: xMedia, text: xText, thread: replies },
  };

  const neverShow = ['1½ (14.5-oz) can crushed tomatoes'];
  const onScreen = [...feedPlan, ...tallPlan].flatMap((p) => p.intended.map((l) => (typeof l === 'string' ? l : l.text)));
  const all = [...onScreen, ...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? [])])];
  const extra: string[] = [];
  for (const n of neverShow) if (all.some((t) => t.includes(n))) extra.push(`never-show line present: ${n}`);
  const mustKeep = claimById(pack, 'proof.tikka_method_changes')?.must_keep ?? [];
  for (const m of mustKeep) if (!posts.instagram_carousel!.text.includes(m)) extra.push(`instagram caption lacks must_keep "${m}" (proof.tikka_method_changes)`);
  const checks: GateCheck[] = [
    check('proof.verbatim', proofProblems.length === 0, `every quote is a verbatim substring of the stored result (${g.proof.file} @ ${RECIPEFIX_REF.slice(0, 8)}, captured ${stored.capturedOn})`, proofProblems),
    ...ig.checks,
    ...tt.checks,
    ...photoChecks,
    check('payload.counts', ig.files.length <= 20 && tt.files.length <= 35 && xMedia.length <= 4, `${ig.files.length} Instagram slides, ${tt.files.length} TikTok photos, ${xMedia.length} X images`),
    ...copyChecks(pack, posts, onScreen, extra),
    ...packChecks,
  ];
  return finish(s, {
    format: 'slides-swaps',
    summary: `${g.kicker}: ${swaps.map((w) => `${w.from} → ${w.to}`).join(', ')}`,
    outputs: { slides: ig.files.map(relRepo), tiktok_slides: tt.files.map(relRepo) },
    posts,
    sources: [{ name: `Stored real RecipeFix result (${g.proof.export}), captured ${stored.capturedOn}`, url: `git:recipe-fix@${RECIPEFIX_REF.slice(0, 8)}:${g.proof.file}`, quote: swaps.flatMap((w) => w.steps).join(' | ') }],
    claims: g.claims,
    qa: { passed: checks.every((c) => c.passed), checks },
    disclosures: { ai_voice: false, tiktok_is_aigc: false, photos: g.photo_label, starting_recipe: g.starting_recipe, proof: stored.record.disclosure, knowledge_commit: pack.commit },
  });
}

// ─────────────────────────────── single image ───────────────────────────────

export async function makeFactImage(factId: string, opts: { date?: string } = {}): Promise<StudioRecord> {
  const f = loadFacts().find((x) => x.id === factId);
  if (!f) throw new Error(`unknown fact ${factId}`);
  const { pack, checks: packChecks } = packFor(f.claims);
  const s = openStudio('image', factId, opts.date);
  rmSync(path.join(s.dir, 'slides'), { recursive: true, force: true });
  const myth = f.format === 'myth';
  const topic = TOPIC[f.topic] ?? { label: 'Food quiz', color: '#E07A3F' };
  const photo = await photoFor(s, f.photo, FACT.photo.w, FACT.photo.h);
  const foot = 'Guess first. Answer below.';
  const plan: Array<Planned<Record<string, unknown>>> = [
    {
      name: 'question',
      slide: { kicker: myth ? 'Myth or fact?' : topic.label, question: f.question, options: f.options, myth, photo: photo.file, color: topic.color, foot },
      intended: [myth ? 'Myth or fact?' : topic.label, f.question, ...(myth ? ['MYTH', 'FACT'] : f.options), foot],
    },
  ];
  const r = await renderDeck(s, 'FactCard', 'feed', plan[0]!.slide, plan, 'image');
  const img = relRepo(r.files[0]!);
  const hook = loadSlidesFile().image_hooks[f.id] ?? (/video|seconds/i.test(f.caption) ? 'Guess before you read on.' : f.caption);
  const tagsFull = hashtags(f.tags.filter((t) => t !== 'foodtok'), 4);
  const tagsShort = hashtags(f.tags.filter((t) => t !== 'foodtok'), 3);
  const question = myth ? `Myth or fact: "${f.question}"` : `${f.question}\n\n${f.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n')}`;
  const posts: Record<string, PlatformPost> = {
    instagram: {
      platform: 'instagram',
      kind: 'image',
      media: [img],
      text: `${hook}\nGuess first, the answer is below.\n\n\n${answerReply(f)}\n\n${f.tie}\n\n${tagsFull}`,
    },
    x: { platform: 'x', kind: 'image', media: [img], text: `${hook} Answer in the reply.\n\n${tagsShort}`, thread: [answerReply(f)] },
    threads: { platform: 'threads', kind: 'image', media: [img], text: `${hook} Answer in the reply.\n\n${tagsShort}`, thread: [answerReply(f), f.tie] },
    x_text: { platform: 'x', kind: 'text', media: [], text: `${question}\n\nAnswer in the reply.\n\n${tagsShort}`, thread: [answerReply(f)] },
  };
  const onScreen = plan[0]!.intended.map((l) => (typeof l === 'string' ? l : l.text));
  const extra: string[] = [];
  // The answer must never be on the image: it is in the caption or the reply.
  if (onScreen.some((t) => t.includes(f.why))) extra.push('the why is on the image');
  const checks: GateCheck[] = [...r.checks, photo.check, ...copyChecks(pack, posts, onScreen, extra), ...packChecks];
  return finish(s, {
    format: 'image',
    summary: f.question,
    outputs: { slides: [img] },
    posts,
    sources: [{ name: f.source.name, url: f.source.url, quote: f.source.quote }],
    claims: f.claims,
    qa: { passed: checks.every((c) => c.passed), checks },
    disclosures: { ai_voice: false, photos: 'licensed stock RecipeFix Originals photo as mood; not the dish discussed', knowledge_commit: pack.commit },
  });
}
