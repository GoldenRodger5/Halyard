/**
 * App intro: RecipeFix shown working, from real screen recordings, full frame.
 *
 * Recordings: runs/2026-10-26/captures-v2 (RecipeFix web UI at e68b1404 driven
 * by real taps; the result on screen is the stored production adaptation of
 * the Chicken Tikka Masala Original, Dairy-Free, 4 → 6, captured 2026-10-21).
 * Clip 4 predates the Cook Mode numbering fix (#252): its header reads
 * "Step 2 of 8" over step 1, so it is only ever framed BELOW the header (the
 * running timer). Every line maps to a live claim in the knowledge pack.
 */
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { claimById, forbiddenClaims, isQuotable, loadKnowledgePack, productPostsPaused } from '../knowledge.js';
import { loadIdeas, REPO_ROOT } from '../runContext.js';
import { FPS, check, contactSheet, duration, humanTextProblems, openStudio, originalPhoto, qaFrame, relRepo, renderVideo, runCost, sfx, writeJson, writeStudioPreview, type PlatformPost, type StudioRecord } from '../studio.js';

const CAPTURES = path.join(REPO_ROOT, 'runs/2026-10-26/captures-v2');

const BEATS = [
  { kind: 'photo' as const, seconds: 2.8, text: "Dairy-free? Swapping the yogurt isn't the hard part.", claims: [] as string[] },
  { kind: 'clip' as const, src: 'recipefix-v2-clip1-result-swapped-yogurt.mp4', from: 3.0, seconds: 5.6, focus: [1000, 1060] as [number, number], zoom: [1.22, 1.32] as [number, number], text: 'RecipeFix swaps it and tells you why.', claims: ['core.reasons'] },
  { kind: 'clip' as const, src: 'recipefix-v2-clip2-method-step-notes.mp4', from: 0.5, seconds: 5.2, focus: [1350, 1420] as [number, number], zoom: [1.2, 1.3] as [number, number], text: 'Then it rewrites the steps the swap changes.', claims: ['core.rewrites_steps', 'proof.tikka_method_changes'] },
  { kind: 'clip' as const, src: 'recipefix-v2-clip4-cook-mode-timer.mp4', from: 5.6, seconds: 4.2, focus: [1950, 1950] as [number, number], zoom: [1.5, 1.6] as [number, number], text: 'And walks you through it, timers included.', claims: ['loop.cook_mode'] },
];
const TIE = 'Paste a recipe link, paste the text, or snap a photo.';
const NOTE = 'Real RecipeFix result, screen-recorded';

export async function makeApp(opts: { date?: string }): Promise<StudioRecord> {
  const ideas = loadIdeas();
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const claims = [...new Set(['core.intake', ...BEATS.flatMap((b) => b.claims)])];
  for (const id of claims) if (!isQuotable(claimById(pack, id))) throw new Error(`${id} not quotable at ${pack.commit}`);
  const paused = productPostsPaused(pack);
  const s = openStudio('app', 'dairy-free-tikka', opts.date);
  const fx = sfx(s);
  const photo = await originalPhoto(s, 'chicken-tikka-masala');
  let t = 0;
  const shots = BEATS.map((b) => {
    const start = t;
    t += Math.round(b.seconds * FPS);
    if (b.kind === 'clip') {
      copyFileSync(path.join(CAPTURES, b.src), path.join(s.pub, b.src));
      s.assets.push({ id: b.src, provenance: `runs/2026-10-26/captures-v2/${b.src} (RecipeFix e68b1404 UI, real taps, stored production result)`, licence: 'first-party capture', sha256: '' });
      return { kind: b.kind, src: b.src, from: b.from, focus: b.focus, zoom: b.zoom, text: b.text, start, end: t };
    }
    return { kind: b.kind, src: photo, text: b.text, start, end: t };
  });
  const closeStart = t;
  const total = closeStart + Math.round(3.4 * FPS);
  const props = { shots, close: { start: closeStart, tie: TIE, photo }, note: NOTE, sfx: { whoosh: fx.whoosh } };
  writeJson(path.join(s.dir, 'render-props.json'), props);
  const video = await renderVideo(s, 'AppShort', props, total, s.id);
  contactSheet(video, path.join(s.dir, 'contact.png'), 1.0);

  const tags = '#dairyfree #cookingtips #foodtok #recipefix';
  const media = [relRepo(video)];
  const posts: Record<string, PlatformPost> = {
    tiktok: { platform: 'tiktok', kind: 'video', media, text: `Swapping the yogurt is easy. The marinade, the broil and the sauce changing with it is the part a recipe never tells you.\n\n${tags}` },
    instagram_reel: { platform: 'instagram', kind: 'video', media, text: `Swapping the yogurt is easy. The steps that change with it are the hard part.\n\nRecipeFix swaps it, tells you why, and rewrites the steps. ${TIE}\n\n${tags}` },
    youtube: { platform: 'youtube', kind: 'video', media, title: 'Making a recipe dairy-free without breaking it #shorts', text: `RecipeFix swaps the ingredient, tells you why, and rewrites the steps.\n${TIE}\nhttps://recipefix.app` },
    x: { platform: 'x', kind: 'video', media, text: 'Swapping the yogurt is easy. The steps that change with it are the hard part.' },
    threads: { platform: 'threads', kind: 'video', media, text: 'Swapping the yogurt is easy. The steps that change with it are the hard part. RecipeFix rewrites them.' },
  };

  const checks: GateCheck[] = [];
  const d = duration(video);
  checks.push(check('video.duration', d >= 15 && d <= 30, `${d.toFixed(1)} s (target 15–30 s)`));
  for (const [i, sh] of shots.entries()) checks.push(...(await qaFrame(s, video, (sh.end - 6) / FPS, `beat${i + 1}`, [sh.text])));
  checks.push(...(await qaFrame(s, video, (total - 3) / FPS, 'close', [TIE, 'recipefix.app'])));
  const everything = [...shots.map((x) => x.text), TIE, NOTE, ...Object.values(posts).flatMap((p) => [p.text, p.title ?? ''])];
  const problems = humanTextProblems(everything);
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}) "${ex}"`);
  for (const [k, p] of Object.entries(posts)) if (p.text.length > ({ x: 280, threads: 500 } as Record<string, number>)[p.platform]!) problems.push(`${k} too long`);
  checks.push(check('copy.platform_rules', problems.length === 0, 'reads human, no forbidden claims, lengths', problems));
  checks.push(check('knowledge.product_posts', !paused, paused ? `paused: ${paused}` : 'release receipt present'));

  const record: StudioRecord = {
    schema: 1,
    id: s.id,
    format: 'app',
    summary: 'RecipeFix intro: dairy-free tikka masala, real screens',
    made_at: new Date().toISOString(),
    outputs: { video: relRepo(video) },
    posts,
    sources: [{ name: 'Stored production result', url: 'https://recipefix.app/original-recipes/chicken-tikka-masala', quote: 'src/data/landingRealResult.ts (captured 2026-10-21)' }],
    claims,
    assets: s.assets,
    qa: { passed: checks.every((c) => c.passed), checks },
    cost_usd: runCost(s),
    disclosures: { ai_voice: false, screens: 'real RecipeFix UI (e68b1404) showing the stored production result; backend simulated by the capture harness', knowledge_commit: pack.commit },
  };
  writeJson(path.join(s.dir, 'record.json'), record);
  writeStudioPreview(s, record);
  return record;
}
