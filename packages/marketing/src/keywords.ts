/**
 * Search words, hashtags and series numbers (PLAYBOOK §7, build plan P2).
 *
 * Discovery on TikTok, Instagram, YouTube and Pinterest is now mostly search:
 * the caption's first ~50 characters, the on-screen hook and the title are
 * indexed. So each post gets ONE target phrase that real people type, taken
 * from public autocomplete (Google and YouTube suggest endpoints, no key, no
 * cost), cached for a week. Hashtags are labels: 3–5, tiered, rotated.
 *
 * Deterministic given the cache; no model involved.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUNS_DIR } from './runContext.js';

const CACHE = path.join(RUNS_DIR, '_cache', 'keywords');
const WEEK = 7 * 86400_000;

/** Autocomplete suggestions for a seed. `yt` uses YouTube's search suggest. */
export async function suggest(seed: string, source: 'google' | 'yt' = 'google'): Promise<string[]> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${source}-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}.json`);
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as { at: number; s: string[] };
    if (Date.now() - c.at < WEEK) return c.s;
  }
  const url = `https://suggestqueries.google.com/complete/search?client=firefox${source === 'yt' ? '&ds=yt' : ''}&hl=en&gl=us&q=${encodeURIComponent(seed)}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const j = (await r.json()) as [string, string[]];
    const s = Array.isArray(j?.[1]) ? j[1] : [];
    writeFileSync(file, JSON.stringify({ at: Date.now(), s }));
    return s;
  } catch {
    return [];
  }
}

const STOP = new Set('a an the of in on is are was to for and or with what which how does do it its this that be by from at as your you one'.split(' '));
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

/** Topic words people search with, per fact topic. */
const TOPIC_WORDS: Record<string, string> = {
  'gluten-free': 'gluten free',
  allergies: 'allergens',
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  'cooking-myths': 'cooking',
  'kitchen-math': 'how many tablespoons',
  'food-history': 'history',
  labels: 'ingredients',
};

/**
 * The best real search phrase for a fact: autocomplete for seeds built from
 * the answer and the topic, scored by overlap with the fact's own words.
 * Falls back to a plain seed so a caption is never empty.
 */
export async function searchPhrase(f: { topic: string; question: string; options: string[]; correct: number; why: string; search?: string[] }): Promise<string> {
  const answer = f.options[f.correct] ?? '';
  const topicWord = TOPIC_WORDS[f.topic] ?? '';
  const factWords = new Set(words(`${f.question} ${answer} ${f.why} ${topicWord}`));
  const yesNo = /^(myth|fact|yes|no)$/i.test(answer);
  const qWords = new Set(words(f.question).filter((x) => x.length > 3));
  const subject = yesNo ? words(f.question).slice(0, 3).join(' ') : answer.toLowerCase();
  // Question-form seeds first: that is how people search a doubt.
  const seeds = f.search?.length
    ? f.search
    : [`is ${subject} ${topicWord}`, `does ${subject}`, `${subject} ${topicWord}`, words(f.question).slice(0, 5).join(' ')].map((x) => x.replace(/\s+/g, ' ').trim());
  let best = { p: `${subject} ${topicWord}`.trim(), score: -Infinity };
  for (const [k, seed] of seeds.entries()) {
    for (const src of ['google', 'yt'] as const) {
      for (const sug of await suggest(seed, src)) {
        const w = words(sug);
        if (w.length < 2 || w.length > 7 || sug.length > 48) continue;
        const overlap = w.filter((x) => factWords.has(x)).length;
        const novel = w.length - overlap;
        const question = /^(is|are|does|do|how|can|why|what|which)\b/i.test(sug) ? 0.6 : 0;
        const score = overlap - 0.8 * novel + question - 0.1 * k;
        // It must be about the question itself, not just share topic words with the explanation.
        const aboutQuestion = w.some((x) => qWords.has(x));
        if (overlap >= 2 && aboutQuestion && score > best.score) best = { p: sug, score };
      }
    }
  }
  // Autocomplete drops the slash in fractions ("1 3 cup"); put it back.
  return best.p.replace(/\b(\d) (\d) (cup|teaspoon|tablespoon)/g, '$1/$2 $3');
}

/** Hashtag tiers per topic: niche, rotating specifics, community; #recipefix is always last. */
const TAGS: Record<string, { niche: string; specific: string[]; community: string[] }> = {
  'gluten-free': { niche: 'glutenfree', specific: ['glutenfreetips', 'celiacfriendly', 'glutenfreecooking', 'glutenfreeliving'], community: ['foodtok', 'cookingtips'] },
  allergies: { niche: 'foodallergies', specific: ['allergenfree', 'foodlabels', 'allergymom'], community: ['foodtok', 'foodfacts'] },
  vegan: { niche: 'vegan', specific: ['veganswaps', 'vegantips', 'plantbased'], community: ['vegantok', 'foodtok'] },
  vegetarian: { niche: 'vegetarian', specific: ['vegetarianrecipes', 'meatless'], community: ['foodtok', 'foodfacts'] },
  'cooking-myths': { niche: 'cookingtips', specific: ['kitchenmyths', 'foodscience', 'cookingscience'], community: ['foodtok', 'learnontiktok'] },
  'kitchen-math': { niche: 'bakingtips', specific: ['kitchenhacks', 'measuringtips', 'bakingscience'], community: ['foodtok', 'cookingtips'] },
  'food-history': { niche: 'foodhistory', specific: ['foodfacts', 'trivia', 'didyouknow'], community: ['foodtok', 'learnontiktok'] },
  labels: { niche: 'foodlabels', specific: ['readthelabel', 'ingredientcheck', 'hiddeningredients'], community: ['foodtok', 'foodfacts'] },
};

/** Tags used by recent records, newest first (to rotate the specific tier). */
function recentTagSets(n = 7): string[][] {
  const out: Array<{ at: string; tags: string[] }> = [];
  if (!existsSync(RUNS_DIR)) return [];
  for (const d of readdirSync(RUNS_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const run of readdirSync(path.join(RUNS_DIR, d))) {
      const f = path.join(RUNS_DIR, d, run, 'record.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8')) as { made_at?: string; posts?: Record<string, { text: string }> };
      const t = r.posts?.tiktok?.text ?? '';
      out.push({ at: r.made_at ?? '', tags: [...t.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase()) });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, n).map((x) => x.tags);
}

/** 4–5 tags: niche + the least-recently-used specific + one community + recipefix. */
export function hashtags(topic: string, extra: string[] = []): string[] {
  const t = TAGS[topic] ?? { niche: 'foodfacts', specific: ['cookingtips'], community: ['foodtok'] };
  const recent = recentTagSets().flat();
  const lastUse = (tag: string) => {
    const i = recent.indexOf(tag);
    return i < 0 ? Infinity : i;
  };
  const specific = [...t.specific].sort((a, b) => lastUse(b) - lastUse(a))[0]!;
  const community = [...t.community].sort((a, b) => lastUse(b) - lastUse(a))[0]!;
  return [...new Set([t.niche, specific, ...extra, community, 'recipefix'])].slice(0, 5);
}

/** Next number in a named series ("Label Detective #3"), from records on disk. */
export function seriesNumber(series: string, runId?: string): number {
  let n = 0;
  if (!existsSync(RUNS_DIR)) return 1;
  for (const d of readdirSync(RUNS_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    for (const run of readdirSync(path.join(RUNS_DIR, d))) {
      const f = path.join(RUNS_DIR, d, run, 'record.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8')) as { series?: { name: string; n: number }; id?: string };
      // A re-render of the same run keeps its number.
      if (runId && r.id === runId && r.series?.name === series) return r.series.n;
      if (r.series?.name === series) n = Math.max(n, r.series.n);
    }
  }
  return n + 1;
}
