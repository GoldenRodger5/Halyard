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
  source?: { quote?: string };
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

function listFacts(): Record<string, string[]> {
  const f = path.join(REPO_ROOT, 'packages/marketing/facts/lists.yaml');
  if (!existsSync(f)) return {};
  const doc = yaml.load(readFileSync(f, 'utf8')) as { lists: Record<string, { items: Array<{ fact: string }>; twist?: { fact: string } }> };
  return Object.fromEntries(Object.entries(doc.lists).map(([id, l]) => [id, [...l.items, ...(l.twist ? [l.twist] : [])].map((i) => i.fact)]));
}

export function planWeek(opts: { start: string; perDay?: number; days?: number; extraFormats?: string[] }): PlanItem[] {
  const { facts, sets } = factBank() as unknown as { facts: FactRow[]; sets: Record<string, { facts: string[]; label: string; season?: { from: string; to: string } }> };
  const used = recentlyPosted();
  const freshSet = (name: string) => sets[name]!.facts.every((f) => !used.has(f));
  const startDay = opts.start;
  // In-season sets jump the queue (PLAYBOOK §7 seasonality); out-of-season ones wait.
  const setNames = Object.keys(sets)
    .filter(freshSet)
    .filter((k) => inSeason(sets[k]!.season, startDay))
    .sort((a, b) => Number(Boolean(sets[b]!.season)) - Number(Boolean(sets[a]!.season)));
  const inLists = new Set(Object.values(listFacts()).flat());
  // The same claim can live under two ids (a quiz fact and a myth fact quoting one source); a
  // fact whose quote a list already uses counts as that list's too.
  const listQuotes = new Set(facts.filter((f) => inLists.has(f.id)).map((f) => f.source?.quote ?? '').filter(Boolean));
  for (const f of facts) if (f.source?.quote && listQuotes.has(f.source.quote)) inLists.add(f.id);
  // Image posts: one per source quote, so two ids for one claim never both run.
  const seenQuote = new Set<string>();
  const oneClaim = (f: FactRow) => {
    const q = f.source?.quote ?? f.id;
    if (seenQuote.has(q)) return false;
    seenQuote.add(q);
    return true;
  };
  const pools: Record<string, Array<{ command: string; topic: string; facts: string[] }>> = {
    'quiz-set': setNames.map((k) => ({ command: `quiz set:${k}`, topic: k, facts: sets[k]!.facts })),
    myth: facts.filter((f) => f.format === 'myth' && !used.has(f.id)).map((f) => ({ command: `quiz ${f.id}`, topic: f.topic, facts: [f.id] })),
    quiz: facts.filter((f) => f.format !== 'myth' && !used.has(f.id)).map((f) => ({ command: `quiz ${f.id}`, topic: f.topic, facts: [f.id] })),
    recipe: ['creamy-tuscan-chicken', 'lemon-herb-roast-chicken', 'garlic-shrimp-spaghetti', 'salmon-cucumber-salsa', 'sweet-potato-black-bean-tacos', 'roasted-butternut-squash-soup'].map((id) => ({ command: `recipe ${id}`, topic: 'recipe', facts: [] })),
    app: [{ command: 'app --voice', topic: 'product', facts: [] }],
    transform: idsFrom('data/transforms.yaml', 'transforms').map((id) => ({ command: `transform ${id}`, topic: 'transform', facts: [] })),
    history: idsFrom('facts/history.yaml', 'stories').map((id) => ({ command: `history ${id} --voice`, topic: 'food-history', facts: [] })),
    versus: idsFrom('facts/versus.yaml', 'games').map((id) => ({ command: `versus ${id}`, topic: 'versus', facts: [] })),
    // A list's facts count as used, so no image post repeats one of its items within the plan.
    list: Object.entries(listFacts()).map(([id, f]) => ({ command: `list ${id}`, topic: `list-${id}`, facts: f })),
    // The same list as a photo carousel (saves), from the same render.
    'list-photos': idsFrom('facts/lists.yaml', 'lists').map((id) => ({ command: `list ${id}`, topic: `list-photos-${id}`, facts: [] })),
    carousel: setNames.map((k) => ({ command: `slides quiz ${k}`, topic: k, facts: [] })),
    // Facts that belong to a list are the list's; image posts use the rest.
    image: facts.filter((f) => !used.has(f.id) && !inLists.has(f.id)).filter(oneClaim).map((f) => ({ command: `image ${f.id}`, topic: f.topic, facts: [f.id] })),
  };
  for (const f of opts.extraFormats ?? []) pools[f] ??= [];
  // The week, as agreed in PLAYBOOK §2–3 (phase 1: ~70% diet-niche games, ~20% recipes, ~10%
  // transformations; no app intro yet) and the per-platform cadence: TikTok 5 videos + 2 photo
  // carousels, Instagram 4 Reels + 2 carousels, Shorts 4, X ~1–2 a day, Threads mirrors X.
  // One video slot and one static slot a day, so two posts of the same look never sit together.
  // Quiz, history and this-or-that VIDEOS stay out (review evidence); their facts ship as statics.
  const ALL = ['tiktok', 'instagram_reel', 'youtube', 'x', 'threads'];
  const WEEK: Array<Array<{ format: string; posts: string[] } | null>> = [
    [{ format: 'list', posts: ALL }, { format: 'carousel', posts: ['instagram_carousel', 'x', 'threads'] }],
    [{ format: 'recipe', posts: ['tiktok', 'youtube'] }, { format: 'image', posts: ['x', 'threads'] }],
    [{ format: 'list', posts: ALL }, { format: 'list-photos', posts: ['tiktok_photos'] }],
    [{ format: 'transform', posts: ALL }, { format: 'image', posts: ['x', 'threads'] }],
    [{ format: 'list', posts: ALL }, { format: 'carousel', posts: ['instagram_carousel', 'x', 'threads'] }],
    [{ format: 'recipe', posts: ['youtube'] }, { format: 'list-photos', posts: ['tiktok_photos'] }],
    [null, { format: 'image', posts: ['x', 'threads'] }],
  ];
  // A list's photo carousel should not follow its own video: start that pool half a cycle later.
  const lp = pools['list-photos'] ?? [];
  pools['list-photos'] = [...lp.slice(Math.ceil(lp.length / 2)), ...lp.slice(0, Math.ceil(lp.length / 2))];
  const items: PlanItem[] = [];
  const takenFacts = new Set<string>();
  const start = new Date(`${opts.start}T12:00:00Z`);
  for (let d = 0; d < (opts.days ?? 7); d++) {
    const day = new Date(start.getTime() + d * 86400_000).toISOString().slice(0, 10);
    for (const [slot, want] of WEEK[d % 7]!.entries()) {
      if (!want) continue;
      // A list's photo carousel never lands within 3 days of its own video, either way round.
      const near = (cmd: string) => items.some((x) => x.command === cmd && Math.abs(Date.parse(x.day) - Date.parse(day)) < 4 * 86400_000);
      const cand = (pools[want.format] ?? []).find((c) => c.facts.every((f) => !takenFacts.has(f)) && !((want.format === 'list' || want.format === 'list-photos') && near(c.command)));
      if (!cand) {
        // A format that has run dry hands its slot to a neighbour rather than leaving a hole
        // (a second transform needs a second real RecipeFix result, which does not exist yet).
        const FALLBACK: Record<string, string> = { transform: 'recipe', list: 'carousel', 'list-photos': 'image', recipe: 'image', carousel: 'image' };
        const fb = FALLBACK[want.format];
        const alt = fb ? (pools[fb] ?? []).find((c) => c.facts.every((f) => !takenFacts.has(f))) : undefined;
        if (!alt || !fb) {
          items.push({ day, slot: SLOTS[slot]!, command: `(nothing left: write more ${want.format})`, format: want.format, topic: '', facts: [], posts: want.posts });
          continue;
        }
        pools[fb] = pools[fb]!.filter((c) => c !== alt);
        for (const f of alt.facts) takenFacts.add(f);
        items.push({ day, slot: SLOTS[slot]!, command: alt.command, format: fb, topic: alt.topic, facts: alt.facts, posts: want.posts });
        continue;
      }
      pools[want.format] = pools[want.format]!.filter((c) => c !== cand);
      for (const f of cand.facts) takenFacts.add(f);
      items.push({ day, slot: SLOTS[slot]!, command: cand.command, format: want.format, topic: cand.topic, facts: cand.facts, posts: want.posts });
    }
  }
  const dir = path.join(RUNS_DIR, 'schedule');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${opts.start}.json`), `${JSON.stringify(items, null, 2)}\n`);
  return items;
}
