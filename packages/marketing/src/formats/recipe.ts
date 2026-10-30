/**
 * Recipe format: a RecipeFix Original → a ~30 s vertical video + posts.
 *
 * The recipe is the snapshot in data/originals.json (RecipeFix a82f8bb9). The
 * ingredient list is shown as written (display-shortened: fractions as glyphs,
 * tsp/tbsp, parentheticals dropped). A model condenses each method SECTION to
 * one spoken line; the gate refuses any number that section does not contain,
 * so it can shorten a step and cannot invent one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OpenAiLlmClient } from '@halyard/core/generation';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { systemPrompt, writeCopy } from '../copywriter.js';
import { assembleBrief, claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
import {
  FPS,
  check,
  contactSheet,
  duration,
  loudnessChecked,
  openStudio,
  originalPhoto,
  qaFrame,
  relRepo,
  renderStills,
  renderVideo,
  runCost,
  transcriptCheck,
  humanTextProblems,
  voice,
  writeJson,
  writeStudioPreview,
  type PlatformPost,
  type StudioRecord,
} from '../studio.js';

interface Original {
  id: string;
  title: string;
  servings: number;
  totalMinutes: number;
  mealType: string;
  diets: string[];
  ingredientGroups: Array<{ title: string | null; items: string[] }>;
  methodSections: Array<{ title: string | null; steps: string[] }>;
}

export function loadOriginals(): { commit: string; originals: Original[] } {
  const doc = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/marketing/data/originals.json'), 'utf8')) as { source: { commit: string }; originals: Original[] };
  return { commit: doc.source.commit, originals: doc.originals };
}

const FRAC: Record<string, string> = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/8': '⅛' };
/** Display shortening only: what the item IS never changes. */
export function displayItem(s: string): string {
  let t = s.replace(/\s*\([^)]*\)/g, '');
  t = t.replace(/\b(\d+) (\d\/\d)\b/g, (_, w: string, f: string) => `${w}${FRAC[f] ?? ` ${f}`}`).replace(/\b(\d\/\d)\b/g, (f: string) => FRAC[f] ?? f);
  t = t.replace(/\btablespoons?\b/g, 'tbsp').replace(/\bteaspoons?\b/g, 'tsp');
  if (t.length > 34) t = t.replace(/,\s*(?:finely |thinly |roughly )?(?:minced|chopped|sliced|diced|drained|grated|divided|peeled|halved|crushed|beaten|melted|softened|at room temperature|to taste|plus more[^,]*|drained and sliced)$/i, '');
  return t.trim();
}

/** Numbers as written in a text, fractions and ranges normalised: "5 to 6" → 5, 6; "165°F" → 165. */
export function numbersOf(text: string): string[] {
  return (text.match(/\d+(?:[./]\d+)?/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ''));
}

/** What the narrator says for a line shown on screen: one unit, said as words. */
export const speakable = (t: string) => t.replace(/\s*\([^)]*°C\)/g, '').replace(/(\d+)°F/g, '$1 degrees');

const PRODUCT_LINE = 'RecipeFix rewrites the cooking steps, not just the ingredient list.';
/** content.originals, without its em dash (owner rule: no em dashes anywhere). */
const ORIGINALS_LINE = 'A RecipeFix Original at recipefix.app';
const CLAIMS = ['core.rewrites_steps', 'content.originals'];

interface StepCopy {
  lines: Array<{ section: string; line: string }>;
}

export async function makeRecipe(originalId: string, opts: { voice: boolean; date?: string }): Promise<StudioRecord> {
  const { commit, originals } = loadOriginals();
  const r = originals.find((o) => o.id === originalId);
  if (!r) throw new Error(`unknown Original ${originalId}; known: ${originals.map((o) => o.id).join(', ')}`);
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  for (const id of CLAIMS) if (!isQuotable(claimById(pack, id))) throw new Error(`${id} not quotable at ${pack.commit}`);
  const paused = productPostsPaused(pack);
  const s = openStudio('recipe', r.id, opts.date);
  const forbidden = forbiddenClaims(pack).flatMap((c) => (c.examples ?? []).map((ex) => ({ id: c.id, ex })));

  // ── One spoken line per method section (model, gated) ──
  const sections = r.methodSections.map((m, i) => ({ title: m.title ?? `Step ${i + 1}`, text: m.steps.join(' ') }));
  const copyFile = path.join(s.dir, 'step-lines.json');
  let lines: StepCopy['lines'];
  const gate = (c: StepCopy): string[] => {
    const p: string[] = [];
    if (!Array.isArray(c.lines) || c.lines.length !== sections.length) return [`need exactly ${sections.length} lines, one per section, in order`];
    c.lines.forEach((l, i) => {
      const sec = sections[i]!;
      if (l.section !== sec.title) p.push(`line ${i + 1}: section must be "${sec.title}"`);
      const words = l.line.trim().split(/\s+/).length;
      if (words > 15 || words < 5) p.push(`line ${i + 1}: ${words} words (5–15)`);
      const allowed = new Set(numbersOf(sec.text));
      for (const n of numbersOf(l.line)) if (!allowed.has(n)) p.push(`line ${i + 1}: number ${n} is not in this section of the recipe`);
      if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty)\b/i.test(l.line)) p.push(`line ${i + 1}: write numbers as digits`);
      if (!/[.!]$/.test(l.line.trim())) p.push(`line ${i + 1}: end with a full stop`);
      for (const f of forbidden) if (forbiddenMatches(l.line, f.ex)) p.push(`line ${i + 1}: forbidden "${f.ex}"`);
      if (/recipefix/i.test(l.line)) p.push(`line ${i + 1}: no product mention in a method line`);
    });
    return p;
  };
  try {
    lines = (JSON.parse(readFileSync(copyFile, 'utf8')) as StepCopy).lines;
    const again = gate({ lines });
    if (again.length) throw new Error(again.join('; '));
  } catch {
    const res = await writeCopy<StepCopy>(new OpenAiLlmClient(), s.ledger, {
      run: s.id,
      system: systemPrompt(assembleBrief(pack), 'You condense recipe method sections into one spoken line each for a short cooking video.'),
      user: [
        `RECIPE: ${r.title} (serves ${r.servings}, ${r.totalMinutes} min).`,
        'For EACH method section below, write ONE line a cook would say out loud: imperative, concrete, 6–14 words.',
        'Keep the single most useful cue (a time, a heat level, or a visual doneness sign). Use only numbers that appear in that section, as digits.',
        'No product names, no adjectives like "perfect" or "delicious", no new ingredients.',
        ...sections.map((x, i) => `SECTION ${i + 1} "${x.title}": ${x.text}`),
        `Return JSON: {"lines":[{"section":"<exact section title>","line":"..."}]} with ${sections.length} entries in order.`,
      ].join('\n'),
      gate,
      estimateUsd: 0.06,
      promptVersion: 'mk.recipe.steps.v1',
    });
    writeJson(path.join(s.dir, 'step-lines.attempts.json'), res.attempts);
    if (!res.accepted) throw new Error(`no step lines passed the gate in ${res.attempts.length} attempts`);
    lines = res.accepted.lines;
    writeJson(copyFile, { lines });
  }

  // ── Timeline from the narrator ──
  const meta = `${r.totalMinutes} min · Serves ${r.servings}`;
  const want = ['Dairy-Free', 'Gluten-Free', 'Vegan'].filter((d) => !r.diets.includes(d));
  const diet = want[0] ?? 'Low-FODMAP';
  const ask = `Need it ${diet.toLowerCase()}?`;
  const script = {
    hook: `${r.title}. ${r.totalMinutes} minutes, serves ${r.servings}.`,
    ingredients: "Here's what you need.",
    steps: lines.map((l) => speakable(`${l.section}. ${l.line}`)),
    twist: `${ask} ${PRODUCT_LINE}`,
    close: 'Save it for dinner this week.',
  };
  const sec = (x: number) => Math.ceil(x * FPS);
  const v = async (text: string, name: string, fallback: number) => (opts.voice ? await voice(s, text, name) : { file: null as string | null, seconds: fallback });
  const nItems = r.ingredientGroups.reduce((a, g) => a + g.items.length, 0);
  let t = 0;
  const beat = (seconds: number, min: number) => {
    const start = t;
    t += Math.max(sec(min), sec(seconds) + 14);
    return { start, end: t };
  };
  const hv = await v(script.hook, 'hook', 2.6);
  const hook = { ...beat(hv.seconds, 3.0), audio: hv.file };
  const iv = await v(script.ingredients, 'ingredients', 1.2);
  const ingredients = { ...beat(iv.seconds, 2.0 + nItems * 0.22), audio: iv.file, groups: r.ingredientGroups.map((g) => ({ title: g.title, items: g.items.map(displayItem) })) };
  const steps = [];
  for (const [i, l] of lines.entries()) {
    const sv = await v(script.steps[i]!, `step${i + 1}`, 3.2);
    steps.push({ ...beat(sv.seconds, 3.0), audio: sv.file, n: i + 1, total: lines.length, title: l.section, line: l.line });
  }
  const tv = await v(script.twist, 'twist', 4.0);
  const twist = { ...beat(tv.seconds, 4.0), audio: tv.file, ask, line: PRODUCT_LINE, diets: [diet, ...want.slice(1)] };
  const cv = await v(script.close, 'close', 1.4);
  const close = { ...beat(cv.seconds + 1.2, 3.0), audio: cv.file, headline: 'Save it for dinner this week.', product: ORIGINALS_LINE };
  const props = {
    title: r.title,
    meta,
    kicker: 'RecipeFix Original',
    photo: await originalPhoto(s, r.id),
    photoLabel: 'Photo: licensed stock',
    hook,
    ingredients,
    steps,
    twist,
    close,
  };
  writeJson(path.join(s.dir, 'render-props.json'), props);
  const total = close.end;
  const video = await renderVideo(s, 'RecipeShort', props, total, s.id);
  contactSheet(video, path.join(s.dir, 'contact.png'), 1.5);
  const cover = await renderStills(s, 'RecipeShort', props, [hook.start + 40], 'cover');

  // ── Posts ──
  const tags = ['easyrecipes', r.mealType === 'dinner' ? 'dinnerideas' : `${r.mealType}ideas`, 'homecooking', 'recipefix'].map((x) => `#${x}`).join(' ');
  const list = r.ingredientGroups.map((g) => `${g.title ? `${g.title}:\n` : ''}${g.items.map((i) => `• ${displayItem(i)}`).join('\n')}`).join('\n\n');
  const method = lines.map((l, i) => `${i + 1}. ${l.section}: ${l.line}`).join('\n');
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media: [relRepo(video)], text: `${r.title}, ${r.totalMinutes} minutes, serves ${r.servings}. Ingredients and steps in the video.\n\n${ask} ${PRODUCT_LINE}\n\n${tags}`, ai_voice: opts.voice },
    instagram_reel: { platform: 'instagram', kind: 'video', media: [relRepo(video)], text: `${r.title} · ${meta}\n\n${list}\n\n${method}\n\n${ask} ${PRODUCT_LINE}\n\n${tags}`, ai_voice: opts.voice },
    youtube: { platform: 'youtube', kind: 'video', media: [relRepo(video)], title: `${r.title} in ${r.totalMinutes} minutes #shorts`, text: `${list}\n\n${method}\n\nFull recipe: https://recipefix.app/original-recipes/${r.id}\nRecipeFix Originals are recipes written by RecipeFix.`, ai_voice: opts.voice },
    x: { platform: 'x', kind: 'video', media: [relRepo(video)], text: `${r.title}: ${r.totalMinutes} minutes, serves ${r.servings}.\n\n${ask} ${PRODUCT_LINE}` },
    threads: { platform: 'threads', kind: 'video', media: [relRepo(video)], text: `${r.title}: ${r.totalMinutes} minutes, serves ${r.servings}.\n\n${method}\n\n${ask} ${PRODUCT_LINE}` },
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  checks.push(check('video.duration', d >= 18 && d <= 45, `${d.toFixed(1)} s (target 18–45 s)`));
  if (opts.voice) {
    const loud = loudnessChecked(video);
    checks.push(check('audio.loudness', Math.abs(loud.lufs + 14) <= 1.5 && loud.peak <= -0.5, `${loud.lufs} LUFS, peak ${loud.peak} dBFS`));
    checks.push(transcriptCheck(s, video, [script.hook, script.ingredients, ...script.steps, script.twist, script.close].join(' ')));
  }
  checks.push(...(await qaFrame(s, video, (hook.end - 4) / FPS, 'hook', [r.title, meta])));
  const allItems = ingredients.groups.flatMap((g) => g.items);
  checks.push(...(await qaFrame(s, video, (ingredients.end - 4) / FPS, 'ingredients', ['What you need', ...allItems.map((text) => ({ text, min: 0.9 }))])));
  for (const st of steps) checks.push(...(await qaFrame(s, video, (st.end - 4) / FPS, `step${st.n}`, [st.title, st.line])));
  checks.push(...(await qaFrame(s, video, (twist.end - 4) / FPS, 'twist', [ask, PRODUCT_LINE])));
  checks.push(...(await qaFrame(s, video, (total - 3) / FPS, 'close', [close.headline, ORIGINALS_LINE])));
  const limits: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500, youtube: 5000 };
  const problems: string[] = [];
  for (const [k, p] of Object.entries(posts)) if (p.text.length > limits[p.platform]!) problems.push(`${k}: ${p.text.length} > ${limits[p.platform]}`);
  const everything = [...Object.values(posts).map((p) => p.text), ...lines.map((l) => l.line), script.twist];
  for (const f of forbidden) for (const txt of everything) if (forbiddenMatches(txt, f.ex)) problems.push(`forbidden (${f.id}) "${f.ex}"`);
  problems.push(...humanTextProblems([...everything, ORIGINALS_LINE, ask, r.title, meta]));
  checks.push(check('copy.platform_rules', problems.length === 0, 'caption lengths, no forbidden claims', problems));
  checks.push(check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? "?").slice(0, 8)} has a release receipt`));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'recipe',
    summary: `${r.title} (RecipeFix Original, ${commit.slice(0, 8)})`,
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video), slides: cover.map(relRepo) },
    posts,
    sources: [{ name: 'RecipeFix Originals', url: `https://recipefix.app/original-recipes/${r.id}`, quote: `recipe-fix ${commit.slice(0, 8)} src/data/recipefixOriginals.ts` }],
    claims: CLAIMS,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: opts.voice, tiktok_is_aigc: s.assets.some((a) => a.provenance.startsWith('OpenAI ')) || opts.voice, photo: 'licensed stock, labelled on screen', originals: 'written by RecipeFix, not kitchen-tested; never say tested', knowledge_commit: pack.commit },
  };
  writeJson(path.join(s.dir, 'record.json'), record);
  writeStudioPreview(s, record);
  return record;
}
