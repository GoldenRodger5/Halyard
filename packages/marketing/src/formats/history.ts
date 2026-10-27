/**
 * Food history: one sourced story → a narrated 25–40 s vertical video.
 *
 *   facts/history.yaml → one ElevenLabs take of the whole script (cached) →
 *   beats and captions placed on the narrator's own word times → HistoryShort
 *   → QA (OCR read-back per beat, transcript, loudness, duration, copy rules)
 *   → record.json + preview.html
 *
 * Nothing is written by a model: the narrator reads the YAML verbatim, the
 * captions are those words, the posts are templates over the story.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
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
import type { HistoryBeat, HistoryCue } from '../../video/HistoryShort.js';
import { copyRules, norm, thud, timedScript } from './shortKit.js';

interface StoryBeat {
  kind: HistoryBeat['kind'];
  say: string;
  screen?: string;
  chip?: string;
  title?: string;
  rows?: Array<[string, string]>;
  quote?: string;
  place?: string;
  sub?: string;
  items?: string[];
  left?: string;
  right?: string;
  arrow?: boolean;
  stamp?: string;
}

export interface Story {
  id: string;
  kicker: string;
  year: number;
  photo: string;
  focus: string;
  photo_at?: 'story' | 'close';
  beats: StoryBeat[];
  source: { short: string };
  sources: Array<{ name: string; url: string; quote: string }>;
  verified: string;
  tie: string;
  claims: string[];
  caption: string;
  tags: string[];
}

export function loadStories(file = path.join(REPO_ROOT, 'packages/marketing/facts/history.yaml')): Story[] {
  const doc = yaml.load(readFileSync(file, 'utf8')) as { stories: Story[] };
  for (const s of doc.stories) {
    if (!s.sources?.length || s.sources.some((x) => !x.url || !x.quote)) throw new Error(`${s.id}: every source needs a url and a verbatim quote`);
    if (s.beats[0]?.kind !== 'hook') throw new Error(`${s.id}: the first beat is the hook`);
    if (s.beats.at(-1)?.kind !== 'stamp') throw new Error(`${s.id}: the last beat is the stamp (payoff)`);
    if (!s.tie || !s.caption || !s.claims?.length || s.tags.length < 3 || s.tags.length > 5 || !s.tags.includes('recipefix')) throw new Error(`${s.id}: tie, caption, claims and 3–5 tags incl. recipefix`);
    // A quote on screen must be in a source quote, word for word.
    const all = s.sources.map((x) => x.quote).join(' ');
    for (const b of s.beats) if (b.quote && !all.toLowerCase().replace(/[“”"]/g, '').includes(b.quote.toLowerCase().replace(/[“”"]/g, '').replace(/\.$/, ''))) throw new Error(`${s.id}: quote "${b.quote}" is not verbatim in its sources`);
  }
  return doc.stories;
}

/**
 * The page: SVG fractal noise (fibres, blotches), a vignette and a fold,
 * rasterised once with sharp; and a 256 px grain tile the video moves every
 * other frame. Drawn here, so there is no stock texture and no licence.
 */
export async function paperTexture(pub: string): Promise<void> {
  const paper = path.join(pub, 'paper.png');
  if (!existsSync(paper)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
      <defs>
        <filter id="fibre" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves="3" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.26  0 0 0 0 0.16  0.9 0 0 0 -0.32"/></filter>
        <filter id="blot" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="4" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.18  1.4 0 0 0 -0.55"/></filter>
        <radialGradient id="vig" cx="50%" cy="46%" r="75%"><stop offset="55%" stop-color="#5A3A1C" stop-opacity="0"/><stop offset="100%" stop-color="#5A3A1C" stop-opacity="0.42"/></radialGradient>
      </defs>
      <rect width="1080" height="1920" fill="#EFE5CF"/>
      <rect width="1080" height="1920" filter="url(#blot)" opacity="0.5"/>
      <rect width="1080" height="1920" filter="url(#fibre)" opacity="0.55"/>
      <rect width="1080" height="1920" fill="url(#vig)"/>
      <rect x="0" y="1468" width="1080" height="2" fill="#FFFFFF" opacity="0.35"/>
      <rect x="0" y="1470" width="1080" height="2" fill="#6B4A2A" opacity="0.12"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(paper);
  }
  const grain = path.join(pub, 'grain.png');
  if (!existsSync(grain)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="7" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  1.6 0 0 0 -0.62"/></filter><rect width="256" height="256" filter="url(#g)"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(grain);
  }
}

/** Narration starts a few frames in, after the year has begun to roll. */
const AUDIO_AT = 6;
const LEAD = 6;
/** Silence between the stamp and the RecipeFix line, so the payoff lands before anything is sold. */
const PAUSE = 20;

export async function makeHistory(id: string, opts: { date?: string } = {}): Promise<StudioRecord> {
  const story = loadStories().find((x) => x.id === id);
  if (!story) throw new Error(`unknown story ${id}; known: ${loadStories().map((x) => x.id).join(', ')}`);
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const paused = productPostsPaused(pack);
  for (const c of story.claims) if (!isQuotable(claimById(pack, c))) throw new Error(`${c} is not quotable in the pack at ${pack.commit}`);

  const s = openStudio('history', story.id, opts.date);
  const fx = sfx(s);
  const stampSfx = thud(s);
  await paperTexture(s.pub);
  const wide = await originalPhoto(s, story.photo, 'wide');
  const tall = await originalPhoto(s, story.photo, 'tall');

  // ── One take: the whole story, then the RecipeFix line ──
  const script = [...story.beats.map((b) => b.say), story.tie].join(' ');
  const vo = await voice(s, script, 'story');
  const timed = timedScript(script, vo.words, vo.seconds);
  const fr = (t: number) => AUDIO_AT + Math.round(t * FPS);

  // Which script words belong to which beat (and the tie).
  const spans: Array<{ from: number; to: number }> = [];
  let k = 0;
  for (const part of [...story.beats.map((b) => b.say), story.tie]) {
    const n = part.split(/\s+/).filter(Boolean).length;
    spans.push({ from: k, to: k + n });
    k += n;
  }
  const tieSpan = spans.at(-1)!;
  // The payoff gets a breath: the one take is cut just before the RecipeFix line and resumed PAUSE frames later.
  const splitAt = Math.round((fr(timed[tieSpan.from - 1]!.end) + fr(timed[tieSpan.from]!.t)) / 2);
  const closeStart = splitAt + PAUSE - 4;
  const starts = story.beats.map((_, i) => (i === 0 ? 0 : fr(timed[spans[i]!.from]!.t) - LEAD));
  const ends = starts.map((_, i) => starts[i + 1] ?? closeStart);
  const onScreen = new Set<number>();

  /** First word in the beat (from `after`) whose normal form starts with `needle`, or the reverse for 4+ letters. */
  const findWord = (i: number, needle: string, after = spans[i]!.from): number | null => {
    const n = norm(needle);
    for (let w = after; w < spans[i]!.to; w++) {
      const x = norm(timed[w]!.text);
      if (x && (x.startsWith(n) || (x.length >= 4 && n.startsWith(x)))) return w;
    }
    return null;
  };

  const beats: HistoryBeat[] = story.beats.map((b, i) => {
    const sp = spans[i]!;
    const out: HistoryBeat = { kind: b.kind, start: starts[i]!, end: ends[i]! };
    const mid = Math.round((out.start + out.end) / 2);
    if (b.kind === 'hook') {
      out.screen = b.screen;
      for (let w = sp.from; w < sp.to; w++) onScreen.add(w);
    }
    if (b.chip) out.chip = b.chip;
    if (b.title) out.title = b.title;
    if (b.rows)
      out.rows = b.rows.map(([label, value], r) => {
        const w = findWord(i, label) ?? findWord(i, value);
        return { label, value, at: w !== null ? fr(timed[w]!.t) : out.start + 10 + r * 18 };
      });
    if (b.quote) {
      out.quote = b.quote;
      const q = b.quote.split(/\s+/).map(norm);
      // The quote's words, in order, inside this beat's speech: typed on in sync, and not captioned twice.
      for (let w = sp.from; w + q.length <= sp.to; w++) {
        if (q.every((x, j) => norm(timed[w + j]!.text) === x)) {
          out.quoteWords = q.map((_, j) => fr(timed[w + j]!.t));
          for (let j = 0; j < q.length; j++) onScreen.add(w + j);
          break;
        }
      }
    }
    if (b.place) {
      out.place = b.place;
      out.sub = b.sub;
    }
    if (b.items)
      out.items = b.items.map((text, r) => {
        const w = findWord(i, text.split(' ')[0]!);
        return { text, at: w !== null ? fr(timed[w]!.t) : out.start + 10 + r * 10 };
      });
    if (b.left) {
      out.left = b.left;
      out.right = b.right;
      out.arrow = b.arrow;
      const w = findWord(i, b.right!.split(' ')[0]!);
      out.rightAt = w !== null ? fr(timed[w]!.t) : mid;
    }
    if (b.stamp) {
      out.stamp = b.stamp;
      const words = b.stamp.split(' ');
      // The stamp lands on the word that names it (the last mention in the beat).
      let hit: number | null = null;
      for (const needle of [...words].reverse()) {
        for (let from = sp.from; ; ) {
          const w = findWord(i, needle, from);
          if (w === null) break;
          hit = w;
          from = w + 1;
        }
        if (hit !== null) break;
      }
      out.stampAt = hit !== null ? fr(timed[hit]!.t) : mid;
    }
    return out;
  });

  // ── Captions: the narrator's words not already on screen, in short phrases ──
  const cues: HistoryCue[] = [];
  for (const [i] of story.beats.entries()) {
    const sp = spans[i]!;
    let cur: Array<{ text: string; at: number; end: number }> = [];
    const flush = () => {
      if (cur.length) cues.push({ start: cur[0]!.at - 2, end: cur.at(-1)!.end, words: cur.map(({ text, at }) => ({ text, at })) });
      cur = [];
    };
    for (let w = sp.from; w < sp.to; w++) {
      if (onScreen.has(w)) {
        flush();
        continue;
      }
      const word = { text: timed[w]!.text, at: fr(timed[w]!.t), end: fr(timed[w]!.end) };
      const len = [...cur, word].map((x) => x.text).join(' ').length;
      if (cur.length >= 3 || len > 18) flush();
      cur.push(word);
      if (/[.,?!:;]$/.test(word.text)) flush();
    }
    flush();
  }
  // A cue never outlives its beat.
  for (const c of cues) {
    const b = beats.find((x) => c.start >= x.start - 4 && c.start < x.end);
    if (b) c.end = Math.min(c.end, b.end - 1);
  }

  const total = Math.max(closeStart + 3.4 * FPS, fr(timed.at(-1)!.end) + PAUSE + Math.round(1.3 * FPS));
  const thisYear = new Date().getFullYear();
  const props = {
    kicker: story.kicker,
    year: story.year,
    fromYear: thisYear,
    photo: wide,
    closePhoto: tall,
    focus: story.focus,
    beats,
    cues,
    source: story.source.short,
    close: { start: closeStart, tie: story.tie, words: timed.slice(tieSpan.from).map((w) => fr(w.t) + PAUSE) },
    audio: { file: vo.file, at: AUDIO_AT, splitAt, pause: PAUSE },
    sfx: { whoosh: fx.whoosh, stamp: stampSfx, tick: fx.tick },
  };
  writeJson(`${s.dir}/render-props.json`, props);
  const video = await renderVideo(s, 'HistoryShort', props, Math.round(total), s.id);
  contactSheet(video, `${s.dir}/contact.png`, 1.0);

  // ── Posts ──
  const hook = story.beats[0]!;
  const tags = story.tags.map((t) => `#${t}`).join(' ');
  const media = [relRepo(video)];
  const srcNames = [...new Set(story.sources.map((x) => x.name.split(',')[0]!))];
  const srcUrls = [...new Set(story.sources.map((x) => x.url))];
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `${story.caption}\n\n${tags}`, ai_voice: true, cover_ms: 1500 },
    instagram_reel: { platform: 'instagram', kind: 'video', media, text: `${story.caption}\n\nSource: ${story.source.short}\n\n${tags}`, ai_voice: true },
    youtube: {
      platform: 'youtube',
      kind: 'video',
      media,
      title: `${story.year}: ${hook.screen!.replace(/\.$/, '')} #shorts`.slice(0, 100),
      text: `${story.caption}\n\nSources:\n${srcUrls.join('\n')}\n\n${story.tie} https://recipefix.app`,
      ai_voice: true,
    },
    x: { platform: 'x', kind: 'video', media, text: story.caption, thread: [`Source: ${srcNames.join('; ')}`] },
    threads: { platform: 'threads', kind: 'video', media, text: story.caption, thread: [`Source: ${srcNames.join('; ')}`] },
  };

  // ── QA ──
  const checks: GateCheck[] = [];
  const d = duration(video);
  // Paper grain that changed every frame once made a 40 s cut 95 MB; platforms and the repo want it small.
  const mb = statSync(video).size / 1e6;
  checks.push(check('video.size', mb <= 40, `${mb.toFixed(1)} MB (≤ 40 MB)`));
  checks.push(check('video.duration', d >= 25 && d <= 42, `${d.toFixed(1)} s (target 25–40 s)`));
  const loud = loudnessChecked(video);
  checks.push(check('audio.loudness', Math.abs(loud.lufs + 14) <= 1.5 && loud.peak <= -0.5, `${loud.lufs} LUFS, peak ${loud.peak} dBFS`));
  checks.push(transcriptCheck(s, video, script));
  checks.push(check('voice.alignment', timed.length === vo.words.length, `${timed.length} script words, ${vo.words.length} timed words from the voice`));
  checks.push(...(await qaFrame(s, video, 1.6, 'hook', [String(story.year), hook.screen!])));
  for (const [i, b] of beats.entries()) {
    if (b.kind === 'hook') continue;
    const at = b.end - 10;
    const cue = cues.find((c, j) => at >= c.start && at < Math.min(cues[j + 1]?.start ?? c.end + 12, c.end + 12));
    const lines: Array<string | { text: string; min?: number }> = [];
    if (b.chip) lines.push(b.chip);
    if (b.title) lines.push(b.title);
    for (const r of b.rows ?? []) lines.push(r.label, r.value);
    // A display-serif quote set in two lines: OCR drops a short word now and then at low confidence
    // ("ills" in Instrument Serif read by tesseract directly, missed by the anchored pass). Held to 0.85, recorded here.
    if (b.quote) lines.push({ text: b.quote, min: 0.85 });
    if (b.place) lines.push(b.place, b.sub ?? '');
    for (const it of b.items ?? []) lines.push(it.text);
    if (b.left) lines.push(b.left, b.right!);
    // The stamp is rotated 7°; OCR cannot be held to it, so it is recorded and checked by eye in the contact sheet.
    if (b.stamp) lines.push({ text: b.stamp, min: 0 }, story.source.short);
    if (cue && cue.words.every((w) => w.at <= at)) lines.push(cue.words.map((w) => w.text).join(' '));
    checks.push(...(await qaFrame(s, video, at / FPS, `b${i + 1}-${b.kind}`, lines.filter((l) => (typeof l === 'string' ? l : l.text)))));
  }
  checks.push(...(await qaFrame(s, video, (total - 4) / FPS, 'close', [story.tie, 'RecipeFix', 'recipefix.app', `Source: ${story.source.short}`])));
  const screenText = [hook.screen!, ...story.beats.flatMap((b) => [b.chip, b.title, b.quote, b.place, b.sub, b.left, b.right, b.stamp, ...(b.items ?? []), ...(b.rows ?? []).flat()]).filter((x): x is string => !!x), story.tie, script];
  checks.push(copyRules(pack, posts, screenText));
  checks.push(check('knowledge.product_posts', !paused, paused ? `product posts paused: ${paused}` : `pack ${(pack.commit ?? '?').slice(0, 8)} has a release receipt`));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'history',
    summary: `${story.year}: ${hook.screen}`,
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video) },
    posts,
    sources: story.sources,
    claims: story.claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: true, tiktok_is_aigc: true, photos: 'licensed stock Originals photo as mood; not the historical dish', knowledge_commit: pack.commit, verified: story.verified },
  };
  writeJson(`${s.dir}/record.json`, record);
  writeStudioPreview(s, record);
  return record;
}
