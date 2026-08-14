/**
 * Validate the coherence gate against real renders.
 *
 *   pnpm critic-check
 *
 * The acceptance test from docs/AGENTIC_PLAN.md phase 2: it must catch a
 * deliberately corrupted render — a post whose copy describes something the
 * footage does not show — and must report `skipped` rather than `passed` when
 * no frame could be sampled.
 *
 * This talks to a real model and a real file. It is the only way to know the
 * describer actually describes.
 */
import { readFileSync } from 'node:fs';
import { OpenAiVisionClient, runCoherenceQC, type CoherenceIntent } from '@halyard/core';
import { frameSampleTimes, probeVideo, sampleFrames } from '../apps/worker/src/video.js';

for (const line of readFileSync('apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}

const VIDEO = process.argv[2] ?? '.render-output/video/SubstitutionExplainer.mp4';

const TRUTHFUL: CoherenceIntent = {
  body: 'Swap butter for oil and the crumb changes. One substitution, a different loaf.',
  script: null,
  keyTerms: ['substitution'],
  format: 'video',
  brandTerms: ['RecipeFix'],
};

const CORRUPTED: CoherenceIntent = {
  body: 'Watch the sourdough starter bubble over three days in a glass jar.',
  script: 'The starter doubles, then collapses, then doubles again.',
  keyTerms: ['sourdough starter', 'glass jar'],
  format: 'video',
  brandTerms: ['RecipeFix'],
};

async function main(): Promise<void> {
  const probe = await probeVideo(VIDEO);
  const times = frameSampleTimes(probe.durationSeconds);
  console.log(`\n${VIDEO} — ${probe.durationSeconds.toFixed(1)}s, sampling at ${times.join(', ')}s`);

  const sampled = await sampleFrames(VIDEO, times);
  console.log(`extracted ${sampled.length} frames\n`);

  const vision = new OpenAiVisionClient();
  const started = Date.now();
  const frames = await vision.describeFrames(sampled);
  console.log(`described in ${((Date.now() - started) / 1000).toFixed(1)}s:\n`);
  for (const f of frames) {
    console.log(`  ${f.atSeconds.toFixed(1)}s  ${f.describes}`);
    if (f.visibleText.length) console.log(`        text: ${f.visibleText.join(' | ')}`);
  }

  for (const [label, intent] of [
    ['TRUTHFUL — a post that matches the footage', TRUTHFUL],
    ['CORRUPTED — a post about something else entirely', CORRUPTED],
  ] as Array<[string, CoherenceIntent]>) {
    const result = runCoherenceQC({ intent, frames });
    console.log(`\n=== ${label} ===`);
    console.log(`  passed: ${result.passed} | examined: ${result.examined}`);
    console.log(`  ${result.summary}`);
    for (const f of result.findings) console.log(`  [${f.severity}] ${f.rule}: ${f.message}`);
  }

  const empty = runCoherenceQC({ intent: TRUTHFUL, frames: [] });
  console.log(`\n=== NO FRAMES (must be examined:0, passed:false) ===`);
  console.log(`  passed: ${empty.passed} | examined: ${empty.examined} | ${empty.findings[0]?.rule}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
