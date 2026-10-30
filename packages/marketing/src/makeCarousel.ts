/* eslint-disable no-console -- a CLI step: stdout is its interface */
/**
 * `mk make <carousel idea>`: brief → copy (≤3 model attempts, or a reviewed
 * copy file) → render → QA on the exported PNGs → preview page → run record.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { OpenAiLlmClient } from '@halyard/core/generation';
import { runCopyGate, type GateCheck } from './copyGate.js';
import { systemPrompt, writeCopy, type Attempt } from './copywriter.js';
import { loadLocalAsset, loadProvenancedPhoto, sha256, type AssetRecord } from './assets.js';
import {
  CAROUSEL_SCHEMA,
  carouselLines,
  carouselShapeProblems,
  renderCarousel,
  SAFE_BOX,
  W,
  H,
  MX,
  type CarouselCopy,
} from './formats/carousel.js';
import { qaStill } from './qa/image.js';
import { openRun, proofExcerpts, readJsonIfExists, REPO_ROOT, writeJson, type RunContext } from './runContext.js';
import { writePreview } from './preview.js';

const CAPTURES_V2 = path.join(REPO_ROOT, 'runs/2026-10-26/captures-v2');

export async function makeCarousel(ideaId: string, opts: { copyFile?: string; date?: string }): Promise<void> {
  const ctx = openRun(ideaId, opts.date);
  const { idea } = ctx;
  writeBrief(ctx);
  if (idea.format !== 'ig_carousel') throw new Error(`${ideaId} is not a carousel idea`);
  const roles = (idea.slides ?? []).map((s) => s.role);
  const provenance = `Real RecipeFix result · ${formatDate(ctx.proofCapturedOn)}`;

  // ── Copy ──────────────────────────────────────────────────────────────────
  const gate = (copy: CarouselCopy): string[] => {
    const shape = carouselShapeProblems(copy, roles, ctx.proof, idea.never_show);
    if (shape.some((p) => p.startsWith('slide roles') || p === 'slides is not an array')) return shape;
    const g = runCopyGate({
      pack: ctx.pack,
      lines: carouselLines(copy),
      caption: { text: copy.caption, hashtags: copy.hashtags, platform: 'instagram', claimIds: copy.caption_claim_ids, factIds: copy.caption_fact_ids },
      proofText: JSON.stringify(ctx.proof),
      factSources: idea.fact_sources,
      productTerms: ctx.ideas.product_terms,
    });
    return [...shape, ...g.checks.filter((c) => !c.passed).flatMap((c) => c.problems.filter((p) => !p.startsWith('warning')).map((p) => `${c.id}: ${p}`))];
  };

  let copy: CarouselCopy | null;
  let attempts: Attempt<CarouselCopy>[];
  let modelCopy: CarouselCopy | null;
  let copySource: string;
  if (opts.copyFile) {
    copy = JSON.parse(readFileSync(opts.copyFile, 'utf8')) as CarouselCopy;
    copySource = `reviewed copy file ${path.relative(REPO_ROOT, opts.copyFile)}`;
    const model = readJsonIfExists<{ accepted: CarouselCopy; attempts: Attempt<CarouselCopy>[] }>(path.join(ctx.dir, 'copy-model.json'));
    modelCopy = model?.accepted ?? null;
    attempts = model?.attempts ?? [];
    if (modelCopy && diffCopy(modelCopy, copy).length === 0) {
      copySource = `model (${attempts.at(-1)?.model ?? 'unknown'}), accepted on attempt ${attempts.length}; re-rendered without a new call`;
    }
    const problems = gate(copy);
    if (problems.length) throw new Error(`Reviewed copy fails the gates:\n- ${problems.join('\n- ')}`);
  } else {
    const allPaths = [...new Set((idea.slides ?? []).flatMap((s) => s.sources ?? []))];
    const user = [
      `POST: ${idea.question}`,
      `Platform: Instagram carousel, ${roles.length} slides, 1080×1350. Pillar: ${idea.pillar}. Audience: ${idea.audience}.`,
      `Claim ids this post may cite: ${idea.claim_ids.join(', ')}.`,
      'SLIDES, in order (role: what it must do):',
      ...(idea.slides ?? []).map((s, i) => `${i + 1}. ${s.role}: ${s.must}${s.sources ? ` [proof: ${s.sources.join(', ')}]` : ''}`),
      `PROOF (the real stored RecipeFix result, ${ctx.proofRecord.disclosure}; quote faithfully, shorten only):`,
      proofExcerpts(ctx.proof, allPaths),
      'FACT SOURCES (id: statement):',
      ...idea.fact_sources.map((f) => `${f.id}: ${f.statement}`),
      `NEVER show or mention: ${idea.never_show.join('; ')}.`,
      `Link for the caption: ${idea.link ?? 'none'} (say "link in bio"; do not paste the URL).`,
      CAROUSEL_SCHEMA,
    ].join('\n');
    const llm = new OpenAiLlmClient();
    const result = await writeCopy<CarouselCopy>(llm, ctx.ledger, {
      run: ctx.runId,
      system: systemPrompt(ctx.brief, 'Write like a cook explaining to a friend. Short words. Concrete nouns. The method change is the point of every slide.'),
      user,
      gate,
      estimateUsd: 0.12,
      promptVersion: 'mk.carousel.v1',
    });
    attempts = result.attempts;
    writeJson(path.join(ctx.dir, 'copy-model.json'), { accepted: result.accepted, attempts: result.attempts });
    if (!result.accepted) {
      throw new Error(`No copy passed the gates in ${attempts.length} attempts. See ${path.relative(REPO_ROOT, path.join(ctx.dir, 'copy-model.json'))}`);
    }
    copy = result.accepted;
    modelCopy = copy;
    copySource = `model (${attempts.at(-1)!.model}), accepted on attempt ${attempts.length}`;
    writeJson(path.join(ctx.dir, 'copy.json'), copy);
  }

  // ── Assets (rights checked at load) ──────────────────────────────────────
  const photo = loadProvenancedPhoto(
    ctx.proofRef,
    'public/images/originals/chicken-tikka-masala-1x1.webp',
    'docs/RECIPEFIX_ORIGINALS.md',
    /\|\s*Chicken Tikka Masala\s*\|\s*1585937421612/,
    'Unsplash License (licensed stock, not owned); RecipeFix docs/RECIPEFIX_ORIGINALS.md',
    "Photo is the Original recipe's licensed stock photo, not the adapted dish",
  );
  const coverCrop = { left: 520, top: 0, width: W, height: H };
  const coverJpeg = await sharp(photo.bytes).extract(coverCrop).jpeg({ quality: 92 }).toBuffer();
  const assets: AssetRecord[] = [
    ctx.proofRecord,
    { ...photo.record, id: `${photo.record.id} crop ${JSON.stringify(coverCrop)} (source 1600×1600: no upscaling)` },
  ];
  // Real RecipeFix screens (owner: "use real pics of RecipeFix"), cropped from the v2 captures.
  const shotWidth = W - MX * 2;
  const shots: Record<number, Array<{ uri: string; width: number; height: number }>> = {};
  for (const [i, spec] of (idea.slides ?? []).entries()) {
    for (const shot of [spec.shot, spec.shot2, spec.shot3]) {
      if (!shot) continue;
      const asset = loadLocalAsset(
        path.join(CAPTURES_V2, shot.file),
        'product_capture',
        'RecipeFix UI at commit e68b1404 (the live tree on 2026-10-26), local production build driven by scripts/journey.mjs with a simulated backend; the adaptation shown is the verbatim stored production result captured 2026-10-21. runs/2026-10-26/captures-v2/capture.json',
        'first-party capture',
        'Real RecipeFix screen, local build of the live UI',
      );
      // Exact DOM boxes need no snapping; the old free-height crops did.
      const crop = shot.crop;
      const height = Math.round((crop.height / crop.width) * shotWidth);
      const png = await sharp(asset.bytes).extract(crop).resize(shotWidth, height).png().toBuffer();
      (shots[i] ??= []).push({ uri: `data:image/png;base64,${png.toString('base64')}`, width: shotWidth, height });
      assets.push({ ...asset.record, id: `${asset.record.id} crop ${JSON.stringify(crop)} → ${shotWidth}×${height} (downscale ${(shotWidth / shot.crop.width).toFixed(2)})` });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const slides = await renderCarousel(
    copy,
    {
      coverPhoto: `data:image/jpeg;base64,${coverJpeg.toString('base64')}`,
      shots,
    },
    provenance,
  );
  const slideDir = path.join(ctx.dir, 'slides');
  rmSync(slideDir, { recursive: true, force: true }); // a re-render with fewer slides must not leave stale ones
  mkdirSync(slideDir, { recursive: true });
  const files: string[] = [];
  for (const s of slides) {
    const f = path.join(slideDir, `${String(s.index).padStart(2, '0')}-${s.role}.png`);
    writeFileSync(f, s.png);
    // Instagram takes JPEG; keep the PNG as the QA'd master and export the upload file from it.
    await sharp(s.png).jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toFile(f.replace(/\.png$/, '.jpg'));
    files.push(f);
  }
  const caption = `${copy.caption}\n\n${copy.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`;
  writeFileSync(path.join(ctx.dir, 'caption.txt'), `${caption}\n`);

  // ── QA on the exported files ─────────────────────────────────────────────
  const copyGate = runCopyGate({
    pack: ctx.pack,
    lines: carouselLines(copy),
    caption: { text: copy.caption, hashtags: copy.hashtags, platform: 'instagram', claimIds: copy.caption_claim_ids, factIds: copy.caption_fact_ids },
    proofText: JSON.stringify(ctx.proof),
    factSources: idea.fact_sources,
    productTerms: ctx.ideas.product_terms,
  });
  const shape = carouselShapeProblems(copy, roles, ctx.proof, idea.never_show);
  const stillQa = [];
  for (const s of slides) {
    // 36px Inter renders word boxes ≈ 26–30px tall (cap + descender); 24 is the floor.
    const qa = await qaStill({ png: s.png, intended: s.intended, safeBox: SAFE_BOX, canvas: { width: W, height: H }, minWordHeight: 24, label: `slide ${s.index}` });
    stillQa.push({ slide: s.index, role: s.role, ...qa });
  }
  const checks: GateCheck[] = [
    ...copyGate.checks,
    { id: 'copy.shape', passed: shape.length === 0, detail: 'roles, lengths, proof support, never-show list', problems: shape },
    {
      id: 'payload.instagram',
      passed: copy.hashtags.length <= 5 && slides.length >= 2 && slides.length <= 20,
      detail: `${slides.length} slides, ${copy.hashtags.length} hashtags, JPEG exports at ${W}×${H}`,
      problems: [],
    },
  ];
  const passed = checks.every((c) => c.passed) && stillQa.every((q) => q.passed);
  const spent = ctx.ledger.entries().filter((e) => e.run === ctx.runId).reduce((s, e) => s + e.usd, 0);

  const record = buildRecord(ctx, {
    copySource,
    copy,
    modelCopy,
    attempts,
    assets,
    files,
    caption,
    checks,
    stillQa: stillQa.map((q) => ({ slide: q.slide, role: q.role, passed: q.passed, checks: q.checks })),
    passed,
    spent,
    extra: { safe_box: SAFE_BOX },
  });
  writeJson(path.join(ctx.dir, 'record.json'), record);
  writePreview(ctx.dir, record);
  console.log(`${ctx.runId}: ${passed ? 'QA PASS' : 'QA FAIL'} — ${path.relative(REPO_ROOT, path.join(ctx.dir, 'preview.html'))}`);
  for (const c of [...checks, ...stillQa.flatMap((q) => q.checks.map((c) => ({ ...c, id: `slide ${q.slide} ${c.id}` })))]) {
    if (!c.passed || c.problems.length) console.log(`  ${c.passed ? 'warn' : 'FAIL'} ${c.id}: ${c.problems.join(' | ')}`);
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'date unknown';
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function buildRecord(
  ctx: RunContext,
  r: {
    copySource: string;
    copy: unknown;
    modelCopy: unknown;
    attempts: Attempt<unknown>[];
    assets: AssetRecord[];
    files: string[];
    caption: string;
    checks: GateCheck[];
    stillQa?: unknown[];
    mediaQa?: unknown;
    passed: boolean;
    spent: number;
    extra?: Record<string, unknown>;
  },
) {
  return {
    schema: 1,
    post_id: ctx.runId,
    idea: ctx.idea,
    platform: ctx.idea.platform,
    status: r.passed ? 'qa_passed_unpublished' : 'qa_failed',
    publish_eligibility: {
      eligible: false,
      reasons: [
        'Lean lane never publishes. A separate per-post owner approval and POC 3 transport are required.',
        ...(ctx.paused ? [`Product post paused: ${ctx.paused}`] : []),
        'Knowledge pack is on an unmerged docs branch (pending owner review).',
      ],
    },
    knowledge: { repo: ctx.ideas.product_repo, ref: ctx.ideas.knowledge.ref, commit: ctx.pack.commit, path: ctx.ideas.knowledge.path, verified_against: ctx.pack.verifiedAgainst },
    proof_commit: ctx.ideas.proof_commit,
    claim_ids: [...new Set(ctx.idea.claim_ids)],
    claims: ctx.idea.claim_ids.map((id) => {
      const c = ctx.pack.claims.find((x) => x.id === id);
      return { id, status: c?.status ?? 'missing', phrasing: c?.phrasing ?? null };
    }),
    fact_sources: ctx.idea.fact_sources,
    copy_source: r.copySource,
    copy: r.copy,
    reviewer_edits: diffCopy(r.modelCopy, r.copy),
    model_attempts: r.attempts.map((a) => ({ n: a.n, model: a.model, costUsd: a.costUsd, problems: a.problems })),
    caption: r.caption,
    assets: r.assets,
    files: r.files.map((f) => path.relative(REPO_ROOT, f)),
    qa: { passed: r.passed, checks: r.checks, stills: r.stillQa, media: r.mediaQa },
    cost: { run_usd: Number(r.spent.toFixed(4)), ledger_total_usd: Number(ctx.ledger.spent().toFixed(4)), cap_usd: ctx.ledger.capUsd },
    brief_sha256: sha256(ctx.brief),
    made_at: new Date().toISOString(),
    ...(r.extra ?? {}),
  };
}

/** Field-level differences between the model's accepted copy and what was rendered. */
export function diffCopy(before: unknown, after: unknown, at = '$'): Array<{ path: string; model: unknown; reviewed: unknown }> {
  if (before === null || before === undefined) return [];
  if (typeof before !== 'object' || typeof after !== 'object' || before === null || after === null) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path: at, model: before, reviewed: after }];
  }
  const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
  return [...keys].flatMap((k) =>
    diffCopy((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], Array.isArray(before) ? `${at}[${k}]` : `${at}.${k}`),
  );
}

export function writeBrief(ctx: RunContext): void {
  const f = path.join(ctx.dir, 'brief.md');
  if (!existsSync(f)) writeFileSync(f, `${ctx.brief}\n`);
}
