/**
 * List videos (`mk list <id>`): a claim, then one sourced item every ~2.5 s.
 * Items come from facts/lists.yaml and must point at a fact in food-facts.yaml,
 * whose source is shown under the item. See video/ListShort.tsx for why this
 * format exists.
 */
import { readFileSync } from 'node:fs';
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
  line: string;
  image: string;
}
interface ListSpec {
  series: string;
  kind?: 'warnings' | 'swaps';
  /** Heading of the closing checklist; defaults to "Check the label" (warnings) or "The swaps". */
  close_title?: string;
  topic: string;
  hook: string;
  hook_sub?: string;
  hook_image: string;
  save: string;
  tie: string;
  search?: string[];
  caption: string;
  tags: string[];
  claims: string[];
  items: ListItemSpec[];
  twist?: ListItemSpec;
}

export function loadLists(): Record<string, ListSpec> {
  return (yaml.load(readFileSync(path.join(REPO_ROOT, 'packages/marketing/facts/lists.yaml'), 'utf8')) as { lists: Record<string, ListSpec> }).lists;
}

export async function makeList(id: string, opts: { voice: boolean; date?: string; look?: 'sticker' | 'editorial' }): Promise<StudioRecord> {
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

  // ── Timeline: ~2.6 s an item, or the narrator's clock when voiced ──
  const sec = (x: number) => Math.ceil(x * FPS);
  const hookVo = opts.voice ? await voice(s, spec.hook, 'hook') : null;
  const hookEnd = Math.max(sec(1.8), sec((hookVo?.seconds ?? 0) + 0.3));
  let t = hookEnd;
  const items = [];
  for (const [i, it] of all.entries()) {
    const twist = spec.twist === it || spec.kind === 'swaps';
    const vo = opts.voice ? await voice(s, `${it.name}. ${it.stamp}. ${it.line}`, `item${i + 1}`) : null;
    const start = t;
    t += Math.max(sec(2.2), sec((vo?.seconds ?? 0) + 0.5));
    items.push({ n: i + 1, name: it.name, stamp: it.stamp, line: it.line, source: facts.get(it.fact)!.source.short.split(',')[0]!.trim(), photo: await generatedPhoto(s, it.image, `${id}-${i + 1}`, 'tall'), start, end: t, twist, audio: vo?.file ?? null });
  }
  const closeStart = t;
  const closeTitle = spec.close_title ?? (spec.kind === 'swaps' ? 'The swaps' : 'Check the label');
  const total = closeStart + sec(3.2);
  const props = {
    kind: spec.kind ?? 'warnings',
    look: opts.look ?? 'editorial',
    label: spec.series,
    hook: { text: spec.hook, sub: spec.hook_sub, photo: await generatedPhoto(s, spec.hook_image, `${id}-hook`, 'tall'), start: 0, end: hookEnd, audio: hookVo?.file ?? null },
    items,
    close: { start: closeStart, title: closeTitle, tips: all.map((it) => ({ name: it.name, stamp: it.stamp, ok: spec.twist === it || spec.kind === 'swaps' })), save: spec.save, photo: items[items.length - 1]!.photo },
    sfx: { whoosh: fx.whoosh, reveal: fx.reveal },
  };
  writeJson(path.join(s.dir, 'render-props.json'), props);
  const video = await renderVideo(s, 'ListShort', props, total, s.id);
  contactSheet(video, path.join(s.dir, 'contact.png'), 1.0);

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
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  checks.push(check('video.duration', d >= 12 && d <= 35, `${d.toFixed(1)} s (target 12–35 s)`));
  if (opts.voice) checks.push(transcriptCheck(s, video, [spec.hook, ...all.map((it) => `${it.name}. ${it.stamp}. ${it.line}`)].join(' ')));
  checks.push(...(await qaFrame(s, video, 1.2, 'hook', [spec.hook, ...(spec.hook_sub ? [spec.hook_sub] : [])])));
  for (const it of items) checks.push(...(await qaFrame(s, video, (it.end - 4) / FPS, `item${it.n}`, [it.name, it.stamp, it.line, `Source: ${it.source}`])));
  checks.push(...(await qaFrame(s, video, (total - 1.2 * FPS) / FPS, 'close', [closeTitle, ...all.map((it) => it.name), spec.save])));
  const everything = [spec.hook, spec.hook_sub ?? '', spec.caption, spec.save, spec.tie, ...all.flatMap((it) => [it.name, it.stamp, it.line]), ...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? ''])];
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
    outputs: { video: relRepo(video) },
    posts,
    sources: all.map((it) => ({ name: facts.get(it.fact)!.source.name, url: facts.get(it.fact)!.source.url, quote: facts.get(it.fact)!.source.quote })),
    claims: spec.claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: opts.voice, tiktok_is_aigc: opts.voice, images: 'generated ingredient stills (candid style), not photos of a specific product', knowledge_commit: pack.commit },
  };
  writeJson(path.join(s.dir, 'record.json'), record);
  writeStudioPreview(s, record);
  return record;
}
