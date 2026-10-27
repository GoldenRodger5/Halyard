/**
 * List videos (`mk list <id>`): a claim, then one sourced item every ~2.5 s.
 * Items come from facts/lists.yaml and must point at a fact in food-facts.yaml,
 * whose source is shown under the item. See video/ListShort.tsx for why this
 * format exists.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { hashtags, searchPhrase, seriesNumber } from '../keywords.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
import { FPS, check, contactSheet, duration, generatedPhoto, humanTextProblems, openStudio, qaFrame, relRepo, renderVideo, runCost, sfx, transcriptCheck, voice, writeJson, writeStudioPreview, type PlatformPost, type StudioRecord } from '../studio.js';
import { loadFacts } from './quiz.js';

interface ListItemSpec {
  fact: string;
  name: string;
  stamp: string;
  /** The words to mark in the source quote; defaults to the stamp. Must appear verbatim. */
  highlight?: string;
  line: string;
  image: string;
}
interface ListSpec {
  series: string;
  kind?: 'warnings' | 'swaps';
  /** The guess prompt before each stamp; defaults per kind. Set "" to turn the guess off. */
  guess?: string;
  /** Heading of the closing checklist; defaults to "Check the label" (warnings) or "The swaps". */
  close_title?: string;
  topic: string;
  hook: string;
  hook_sub?: string;
  hook_image: string;
  save: string;
  /** The question the video ends on (comments beat saves for reach). */
  ask?: string;
  /** A small line under the checklist (an allergy list's "ingredients vary" caveat). */
  note?: string;
  tie: string;
  search?: string[];
  caption: string;
  tags: string[];
  claims: string[];
  items: ListItemSpec[];
  twist?: ListItemSpec;
}

/**
 * The part of a source quote shown on screen: a window around the highlighted words,
 * cut at word boundaries. Throws when the words are not in the quote, so a marker can
 * never land on text the source does not say.
 */
/** On-screen reading pace (words a second) and the time a beat's text takes to arrive. */
/** CREATIVE_STRATEGY.md §2: 2.5 words/s for sentences, 0.3 s a word for short display text, 0.8 s per new photo. */
export const READ_WPS = Number(process.env.MK_READ_WPS || 2.5);
const DISPLAY_S_PER_WORD = 0.3;
const ENTRANCE_S = 0.8;

export function quoteExcerpt(quote: string, hl: string, before = 22, after = 28): { text: string; at: number; len: number } {
  const i = quote.toLowerCase().indexOf(hl.toLowerCase());
  if (i < 0) throw new Error(`highlight "${hl}" is not in the source quote "${quote.slice(0, 80)}…"`);
  let a = Math.max(0, i - before);
  let b = Math.min(quote.length, i + hl.length + after);
  if (a > 0) a = quote.indexOf(' ', a) + 1 || a;
  if (b < quote.length) b = quote.lastIndexOf(' ', b) > i + hl.length ? quote.lastIndexOf(' ', b) : b;
  const pre = a > 0 ? '…' : '';
  const text = `${pre}${quote.slice(a, b).trim()}${b < quote.length ? '…' : ''}`;
  return { text, at: pre.length + (i - a), len: hl.length };
}

export function loadLists(): Record<string, ListSpec> {
  return (yaml.load(readFileSync(path.join(REPO_ROOT, 'packages/marketing/facts/lists.yaml'), 'utf8')) as { lists: Record<string, ListSpec> }).lists;
}

export async function makeList(id: string, opts: { voice: boolean; date?: string; look?: 'sticker' | 'editorial' | 'magazine' }): Promise<StudioRecord> {
  const spec = loadLists()[id];
  if (!spec) throw new Error(`unknown list ${id}; known: ${Object.keys(loadLists()).join(', ')}`);
  const facts = new Map(loadFacts().map((f) => [f.id, f]));
  const all = [...spec.items, ...(spec.twist ? [spec.twist] : [])];
  for (const it of all) if (!facts.has(it.fact)) throw new Error(`${id}: item "${it.name}" points at unknown fact ${it.fact}`);

  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  for (const c of spec.claims) if (!isQuotable(claimById(pack, c))) throw new Error(`${c} not quotable at ${pack.commit}`);
  const paused = productPostsPaused(pack);
  const s = openStudio('list', opts.look && opts.look !== 'editorial' ? `${id}-${opts.look}` : id, opts.date);
  const fx = sfx(s);

  const guessText = spec.guess ?? (spec.kind === 'swaps' ? 'Swap it for…' : "What's hiding in it?");
  // ── Timeline: reading pace, or the narrator's clock when voiced ──
  // The owner found ~2.2 s an item too fast to read (2026-10-27): each beat now holds for its
  // entrance plus the line at READ_WPS words a second.
  const sec = (x: number) => Math.ceil(x * FPS);
  const words = (x: string) => x.split(/\s+/).filter(Boolean).length;
  const readFor = (x: string, min: number, max: number, display = '') => Math.min(max, Math.max(min, ENTRANCE_S + words(x) / READ_WPS + words(display) * DISPLAY_S_PER_WORD));
  const hookVo = opts.voice ? await voice(s, spec.hook, 'hook') : null;
  const hookEnd = Math.max(sec(readFor(`${spec.hook} ${spec.hook_sub ?? ''}`, 2.2, 2.6)), sec((hookVo?.seconds ?? 0) + 0.3));
  let t = hookEnd;
  const items: Array<{ n: number; name: string; stamp: string; line: string; quote: string; source: string; photo: string; start: number; end: number; [k: string]: unknown }> = [];
  for (const [i, it] of all.entries()) {
    const twist = spec.twist === it || spec.kind === 'swaps';
    const vo = opts.voice ? await voice(s, `${it.name}. ${it.stamp}. ${it.line}`, `item${i + 1}`) : null;
    const start = t;
    t += Math.max(sec(1.8 + readFor(it.line, 3.0, 4.2) + 0.6 + (i === 0 && guessText ? 0.4 : 0)), sec((vo?.seconds ?? 0) + 0.5));
    const src = facts.get(it.fact)!.source;
    const q = quoteExcerpt(src.quote, it.highlight ?? it.stamp, 50, 70);
    items.push({ n: i + 1, name: it.name, guess: i === 0 ? guessText || undefined : undefined, stamp: it.stamp, line: it.line, quote: q.text, hlAt: q.at, hlLen: q.len, source: src.short.split(',')[0]!.trim(), photo: await generatedPhoto(s, it.image, `${id}-${i + 1}`, 'tall'), start, end: t, twist, audio: vo?.file ?? null });
  }
  const closeStart = t;
  const closeTitle = spec.close_title ?? (spec.kind === 'swaps' ? 'The swaps' : 'Check the label');
  const total = closeStart + sec(readFor('', 4.0, 5.0, all.map((it) => `${it.name} ${it.stamp}`).join(' ')));
  const props = {
    kind: spec.kind ?? 'warnings',
    look: opts.look ?? 'editorial',
    label: spec.series,
    hook: { text: spec.hook, sub: spec.hook_sub, photo: await generatedPhoto(s, spec.hook_image, `${id}-hook`, 'tall'), start: 0, end: hookEnd, audio: hookVo?.file ?? null },
    items,
    close: { start: closeStart, title: closeTitle, tips: all.map((it) => ({ name: it.name, stamp: it.stamp, ok: spec.twist === it || spec.kind === 'swaps', photo: items[all.indexOf(it)]!.photo })), save: spec.ask ?? '', note: spec.note ?? '', photo: items[items.length - 1]!.photo },
    // No whoosh/stamp effects: the owner found them grating (2026-10-27). Music beds come next.
    sfx: null as null | { whoosh: string; reveal: string },
    _fx: fx.whoosh,
  };
  writeJson(path.join(s.dir, 'render-props.json'), props);
  const video = await renderVideo(s, 'ListShort', props, total, s.id);
  contactSheet(video, path.join(s.dir, 'contact.png'), 1.0);
  // The same list as a photo carousel (TikTok photo mode): each beat at rest, plus the
  // checklist, taken before the loop seam. Carousels earn saves; video earns reach.
  mkdirSync(path.join(s.dir, 'photos'), { recursive: true });
  const stills = [
    { t: (hookEnd - 6) / FPS, name: '01-cover' },
    ...items.map((it, i) => ({ t: (it.end - 8) / FPS, name: `${String(i + 2).padStart(2, '0')}-item${it.n}` })),
    { t: (total - 16) / FPS, name: `${String(items.length + 2).padStart(2, '0')}-checklist` },
  ].map((x) => {
    const f = path.join(s.dir, 'photos', `${x.name}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', x.t.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '2', f]);
    return f;
  });

  // ── Posts ──
  // A list's search phrases are hand-picked real queries; autocomplete scoring once chose
  // "without gluten foods" over them (review 2026-10-27).
  const phrase = spec.search?.[0] ?? (await searchPhrase({ topic: spec.topic, question: spec.hook, options: [spec.items[0]!.name], correct: 0, why: spec.items.map((i) => i.line).join(' ') }));
  const lead = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${/^(is|are|does|do|how|can|why|what|which)\b/i.test(phrase) ? '?' : ':'}`;
  const series = { name: spec.series, n: seriesNumber(spec.series, s.id) };
  const tags = hashtags(spec.topic).map((x) => `#${x}`).join(' ');
  const body = `${lead} ${spec.caption}`;
  const sourcesText = all.map((it) => `${it.name}: ${facts.get(it.fact)!.source.short}`).join('\n');
  const media = [relRepo(video)];
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `${body}\n\nSources:\n${sourcesText}\n\n${tags}`, ai_voice: opts.voice, cover_ms: 400 },
    instagram_reel: { platform: 'instagram', kind: 'video', media, text: `${body}\n\n${sourcesText}\n\n${spec.tie} ${spec.save}\n\n${tags}`, ai_voice: opts.voice },
    youtube: { platform: 'youtube', kind: 'video', media, title: `${lead.replace(/:$/, '')} | ${series.name} #${series.n} #shorts`.slice(0, 100), text: `${spec.hook}.\n\n${sourcesText}\n\n${spec.tie} https://recipefix.app`, ai_voice: opts.voice },
    x: { platform: 'x', kind: 'video', media, text: `${spec.hook}. ${spec.caption}`.slice(0, 270), thread: [sourcesText.slice(0, 275)] },
    threads: { platform: 'threads', kind: 'video', media, text: `${spec.hook}. ${spec.caption}`, thread: [sourcesText] },
    tiktok_photos: { platform: 'tiktok', kind: 'carousel', media: stills.map(relRepo), title: spec.hook.slice(0, 90), text: `${body}\n\nSources:\n${sourcesText}\n\n${tags}` },
  };

  // The bridge (CREATIVE_STRATEGY §4): a pinned comment, never a pitch inside the video.
  const utm = (p: string) => `recipefix.app/?utm_source=${p}&utm_medium=social&utm_campaign=list-${id}`;
  for (const [k, p] of Object.entries(posts)) p.pinned_comment = `${spec.tie} ${utm(k.split('_')[0]!)}`;

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  checks.push(check('video.duration', d >= 22 && d <= 46, `${d.toFixed(1)} s (target 22–46 s: calm and readable, owner 2026-10-27)`));
  if (opts.voice) checks.push(transcriptCheck(s, video, [spec.hook, ...all.map((it) => `${it.name}. ${it.stamp}. ${it.line}`)].join(' ')));
  checks.push(...(await qaFrame(s, video, 1.2, 'hook', [spec.hook, ...(spec.hook_sub ? [spec.hook_sub] : [])])));
  for (const it of items) checks.push(...(await qaFrame(s, video, (it.end - 4) / FPS, `item${it.n}`, [it.name, it.stamp, it.line, `From ${it.source}`, { text: it.quote.replace(/…/g, ''), min: 0.8 }])));
  checks.push(...(await qaFrame(s, video, (total - 1.2 * FPS) / FPS, 'close', [closeTitle, ...all.map((it) => it.name.replace(/^"|"$/g, '')), ...(spec.ask ? [spec.ask] : []), ...(spec.note ? [spec.note] : [])])));
  const everything = [spec.hook, spec.hook_sub ?? '', spec.ask ?? '', spec.note ?? '', spec.caption, spec.save, spec.tie, ...all.flatMap((it) => [it.name, it.stamp, it.line]), ...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? '', p.pinned_comment ?? ''])];
  const problems = humanTextProblems(everything);
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}) "${ex}"`);
  const limits: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500, youtube: 5000 };
  for (const [k, p] of Object.entries(posts)) for (const part of [p.text, ...(p.thread ?? [])]) if (part.length > limits[p.platform]!) problems.push(`${k}: ${part.length} > ${limits[p.platform]}`);
  checks.push(check('copy.platform_rules', problems.length === 0, 'reads human, no forbidden claims, lengths', problems));
  checks.push(check('knowledge.product_posts', !paused, paused ? `paused: ${paused}` : 'release receipt present'));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'list',
    series,
    search_phrase: phrase,
    summary: spec.hook,
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video), tiktok_slides: stills.map(relRepo) },
    posts,
    sources: all.map((it) => ({ name: facts.get(it.fact)!.source.name, url: facts.get(it.fact)!.source.url, quote: facts.get(it.fact)!.source.quote })),
    claims: spec.claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: opts.voice, tiktok_is_aigc: s.assets.some((a) => a.provenance.startsWith('OpenAI ')) || opts.voice, images: 'generated ingredient stills (candid style), not photos of a specific product', knowledge_commit: pack.commit },
  };
  writeJson(path.join(s.dir, 'record.json'), record);
  writeStudioPreview(s, record);
  return record;
}
