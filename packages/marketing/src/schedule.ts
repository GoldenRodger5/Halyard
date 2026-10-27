/**
 * The posting schedule: what to make each day, so the feed stays varied.
 *
 *   pnpm mk plan-week [--start 2026-10-28] [--per-day 2]   write runs/schedule/<start>.json
 *   pnpm mk run-plan <plan.json> [--live]                  make → QA → viewer review → queue
 *
 * Rules (owner, 2026-10-26: "it makes what it should and stays interesting"):
 * - never the same format twice in a row; rotate through every format that exists
 * - never a fact (or a set containing it) posted in the last 30 days
 * - topics rotate so two days never share one
 * - one RecipeFix intro (real app) a week, at most; the rest earn attention first
 * - every item must pass QA AND the viewer review before it is queued; a "revise"
 *   verdict is re-made once with the reviewer's fixes noted, then skipped
 * - queuing is a Blotato scheduledTime, only with --live and connected accounts
 *
 * Deterministic: no model picks topics. The fact bank and history decide.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { REPO_ROOT, RUNS_DIR } from './runContext.js';

export interface PlanItem {
  day: string;
  slot: string;
  /** e.g. "quiz set:kitchen-math", "quiz honey-vegan", "recipe creamy-tuscan-chicken", "app" */
  command: string;
  format: string;
  topic: string;
  facts: string[];
  /** Posts from the record to queue (record.posts keys). */
  posts: string[];
}

interface FactRow {
  id: string;
  topic: string;
  format?: string;
}

function factBank(): { facts: FactRow[]; sets: Record<string, { facts: string[]; label: string }> } {
  return yaml.load(readFileSync(path.join(REPO_ROOT, 'packages/marketing/facts/food-facts.yaml'), 'utf8')) as never;
}

/** Facts that went out (or were queued) in the last `days`, from every run's publish.json. */
export function recentlyPosted(days = 30, now = new Date()): Set<string> {
  const out = new Set<string>();
  if (!existsSync(RUNS_DIR)) return out;
  const cutoff = now.getTime() - days * 86400_000;
  for (const date of readdirSync(RUNS_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    for (const run of readdirSync(path.join(RUNS_DIR, date))) {
      const pub = path.join(RUNS_DIR, date, run, 'publish.json');
      const rec = path.join(RUNS_DIR, date, run, 'record.json');
      if (!existsSync(pub) || !existsSync(rec)) continue;
      const subs = JSON.parse(readFileSync(pub, 'utf8')) as Array<{ status: string; submittedAt: string }>;
      if (!subs.some((x) => x.status !== 'failed' && new Date(x.submittedAt).getTime() >= cutoff)) continue;
      const record = JSON.parse(readFileSync(rec, 'utf8')) as { sources?: unknown; id: string; facts?: string[] };
      for (const f of record.facts ?? run.replace(/^quiz-/, '').split('+')) out.add(f);
    }
  }
  return out;
}

const SLOTS = ['12:30', '17:00'];
const VIDEO_POSTS = ['tiktok', 'instagram_reel', 'youtube', 'x', 'threads'];

/** Which record.posts each format queues (its natural platforms). */
const POSTS_BY_FORMAT: Record<string, string[]> = {
  'quiz-set': VIDEO_POSTS,
  myth: VIDEO_POSTS,
  quiz: VIDEO_POSTS,
  recipe: VIDEO_POSTS,
  app: VIDEO_POSTS,
  transform: VIDEO_POSTS,
  history: VIDEO_POSTS,
  versus: VIDEO_POSTS,
  list: VIDEO_POSTS,
  'list-photos': ['tiktok_photos'],
  carousel: ['instagram_carousel', 'tiktok_photos'],
  image: ['x', 'threads'],
};

const inSeason = (season: { from: string; to: string } | undefined, day: string) => !season || (day.slice(5) >= season.from && day.slice(5) <= season.to);

/** Ids from an optional YAML list file (formats on branches not merged yet simply contribute nothing). */
function idsFrom(file: string, key: string): string[] {
  const f = path.join(REPO_ROOT, 'packages/marketing', file);
  if (!existsSync(f)) return [];
  const doc = yaml.load(readFileSync(f, 'utf8')) as Record<string, Array<{ id: string }> | Record<string, unknown>>;
  const v = doc?.[key];
  return Array.isArray(v) ? v.map((x) => x.id) : v ? Object.keys(v) : [];
}

export function planWeek(opts: { start: string; perDay: number; extraFormats?: string[] }): PlanItem[] {
  const { facts, sets } = factBank() as unknown as { facts: FactRow[]; sets: Record<string, { facts: string[]; label: string; season?: { from: string; to: string } }> };
  const used = recentlyPosted();
  const freshSet = (name: string) => sets[name]!.facts.every((f) => !used.has(f));
  const startDay = opts.start;
  // In-season sets jump the queue (PLAYBOOK §7 seasonality); out-of-season ones wait.
  const setNames = Object.keys(sets)
    .filter(freshSet)
    .filter((k) => inSeason(sets[k]!.season, startDay))
    .sort((a, b) => Number(Boolean(sets[b]!.season)) - Number(Boolean(sets[a]!.season)));
  const pools: Record<string, Array<{ command: string; topic: string; facts: string[] }>> = {
    'quiz-set': setNames.map((k) => ({ command: `quiz set:${k}`, topic: k, facts: sets[k]!.facts })),
    myth: facts.filter((f) => f.format === 'myth' && !used.has(f.id)).map((f) => ({ command: `quiz ${f.id}`, topic: f.topic, facts: [f.id] })),
    quiz: facts.filter((f) => f.format !== 'myth' && !used.has(f.id)).map((f) => ({ command: `quiz ${f.id}`, topic: f.topic, facts: [f.id] })),
    recipe: ['creamy-tuscan-chicken', 'lemon-herb-roast-chicken', 'garlic-shrimp-spaghetti', 'salmon-cucumber-salsa', 'sweet-potato-black-bean-tacos', 'roasted-butternut-squash-soup'].map((id) => ({ command: `recipe ${id}`, topic: 'recipe', facts: [] })),
    app: [{ command: 'app --voice', topic: 'product', facts: [] }],
    transform: idsFrom('data/transforms.yaml', 'transforms').map((id) => ({ command: `transform ${id}`, topic: 'transform', facts: [] })),
    history: idsFrom('facts/history.yaml', 'stories').map((id) => ({ command: `history ${id} --voice`, topic: 'food-history', facts: [] })),
    versus: idsFrom('facts/versus.yaml', 'games').map((id) => ({ command: `versus ${id}`, topic: 'versus', facts: [] })),
    list: idsFrom('facts/lists.yaml', 'lists').map((id) => ({ command: `list ${id}`, topic: `list-${id}`, facts: [] })),
    // The same list as a photo carousel (saves), from the same render.
    'list-photos': idsFrom('facts/lists.yaml', 'lists').map((id) => ({ command: `list ${id}`, topic: `list-photos-${id}`, facts: [] })),
    carousel: setNames.map((k) => ({ command: `slides quiz ${k}`, topic: k, facts: [] })),
    image: facts.filter((f) => !used.has(f.id)).map((f) => ({ command: `image ${f.id}`, topic: f.topic, facts: [f.id] })),
  };
  for (const f of opts.extraFormats ?? []) pools[f] ??= [];
  // PLAYBOOK §2 phase 1 mix: mostly diet-niche games, some recipes, a little product.
  // Weighted by viewer-review evidence (2026-10-27): list videos reach the score bar; quiz VIDEOS
  // (single, set, myth) stall at stay 4-6 / engage 3-5 in every theme, so they are out of the
  // rotation until redesigned. The same facts still ship as carousels and image posts.
  // History and this-or-that videos plateau at engage 3 (2026-10-27, five rounds each), so they wait too.
  const order = ['list', 'carousel', 'transform', 'list-photos', 'list', 'image', 'recipe', 'list', 'list-photos', 'carousel', 'recipe', 'app'];
  const items: PlanItem[] = [];
  const takenFacts = new Set<string>();
  let lastFormat = '';
  let lastTopic = '';
  let appUsed = false;
  let k = 0;
  // UTC noon: adding whole days never lands twice on one date across a DST change.
  const start = new Date(`${opts.start}T12:00:00Z`);
  for (let d = 0; d < 7; d++) {
    const day = new Date(start.getTime() + d * 86400_000).toISOString().slice(0, 10);
    for (let slot = 0; slot < opts.perDay; slot++) {
      let picked: PlanItem | null = null;
      for (let tries = 0; tries < order.length && !picked; tries++) {
        const format = order[(k + tries) % order.length]!;
        if (format === lastFormat || (format === 'app' && appUsed)) continue;
        const cand = (pools[format] ?? []).find((c) => c.topic !== lastTopic && c.facts.every((f) => !takenFacts.has(f)));
        if (!cand) continue;
        pools[format] = pools[format]!.filter((c) => c !== cand);
        picked = { day, slot: SLOTS[slot % SLOTS.length]!, command: cand.command, format, topic: cand.topic, facts: cand.facts, posts: POSTS_BY_FORMAT[format] ?? VIDEO_POSTS };
        for (const f of cand.facts) takenFacts.add(f);
        if (format === 'app') appUsed = true;
      }
      k++;
      if (!picked) continue;
      items.push(picked);
      lastFormat = picked.format;
      lastTopic = picked.topic;
    }
  }
  const dir = path.join(RUNS_DIR, 'schedule');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${opts.start}.json`), `${JSON.stringify(items, null, 2)}\n`);
  return items;
}
