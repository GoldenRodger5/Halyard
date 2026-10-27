#!/usr/bin/env tsx
/* eslint-disable no-console -- a CLI: stdout is its interface */
/**
 * `pnpm mk <command>` — the lean marketing lane. Local and file-based; posts only with `publish --live`.
 *
 *   pnpm mk brief                     print the assembled brief and the pack's state
 *   pnpm mk plan                      list ideas, check every cited claim against the pack
 *   pnpm mk make <idea-id> [--copy f] render + QA one idea (model copy, or a reviewed copy file)
 *   pnpm mk gate <drafts.json>        copy-gate platform variants that reuse a QA-passed asset
 *   pnpm mk quiz [fact-id…] [--voice]  list facts, or make a quiz video + posts (silent unless --voice)
 *   pnpm mk recipe [original-id] [--voice]  list Originals, or make a recipe video + posts
 *   pnpm mk app                       RecipeFix intro video from real screen recordings
 *   pnpm mk transform [id] [--voice]  list transforms, or make a before/after video from a stored real result
 *   pnpm mk critique <run>            viewer review (vision model): stop/stay/engage/human scores; publish needs "post"
 *   pnpm mk plan-week [--start D] [--per-day N]  7-day varied slate → runs/schedule/D.json
 *   pnpm mk run-plan <plan> [--live]  make, QA, review, queue (scheduled) the items that pass
 *   pnpm mk accounts                  Blotato accounts the lane posts to (read-only)
 *   pnpm mk publish <run> [--only a,b] [--live] [--at ISO]  dry run by default; --live posts via Blotato
 *   pnpm mk status <run>              re-check submitted posts
 *   pnpm mk ledger                    the spend ledger and the cap
 *
 * Paid calls (copy, voice) go through the ledger and stop before the cap.
 */
import path from 'node:path';
import { loadIdeas, LEDGER_FILE, openRun, SPEND_CAP_USD } from './runContext.js';
import { claimById, isQuotable, loadKnowledgePack, productPostsPaused } from './knowledge.js';
import { Ledger } from './ledger.js';

function report(r: { id: string; qa: { passed: boolean; checks: Array<{ id: string; passed: boolean; detail: string; problems: string[] }> }; cost_usd: number; outputs: unknown }): void {
  console.log(`${r.id}: ${r.qa.passed ? 'QA PASS' : 'QA FAIL'} · $${r.cost_usd.toFixed(3)} · runs/…/${r.id}/preview.html`);
  for (const c of r.qa.checks) if (!c.passed) console.log(`  FAIL ${c.id}: ${c.detail} | ${c.problems.join(' | ')}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'brief') {
    const ideas = loadIdeas();
    const id = rest[0] ?? ideas.ideas[0]!.id;
    const ctx = openRun(id);
    console.log(ctx.brief);
    console.log(`\n---\nknowledge commit ${ctx.pack.commit}; product posts paused: ${ctx.paused ?? 'no'}`);
    return;
  }

  if (cmd === 'plan') {
    const ideas = loadIdeas();
    const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
    console.log(`Knowledge ${pack.commit} · product posts paused: ${productPostsPaused(pack) ?? 'no'}`);
    for (const idea of ideas.ideas) {
      const bad = idea.claim_ids.filter((id) => !isQuotable(claimById(pack, id)));
      console.log(
        `${idea.id.padEnd(4)} ${idea.format.padEnd(12)} ${idea.pillar.padEnd(15)} ${bad.length ? `BLOCKED (not quotable: ${bad.join(', ')})` : 'ok'}  ${idea.question}`,
      );
    }
    return;
  }

  if (cmd === 'make') {
    const id = rest[0];
    if (!id) throw new Error('usage: pnpm mk make <idea-id> [--copy <reviewed copy.json>]');
    const idea = loadIdeas().ideas.find((i) => i.id === id);
    if (!idea) throw new Error(`unknown idea ${id}`);
    const copyFile = flag('--copy') ? path.resolve(flag('--copy')!) : undefined;
    if (idea.format === 'ig_carousel') {
      const { makeCarousel } = await import('./makeCarousel.js');
      await makeCarousel(id, { copyFile, date: flag('--date') });
    } else {
      const { makeShort } = await import('./makeShort.js');
      await makeShort(id, { copyFile, date: flag('--date'), voice: !rest.includes('--no-voice') });
    }
    return;
  }

  if (cmd === 'quiz') {
    const ids = rest.filter((r) => !r.startsWith('--') && r !== flag('--date'));
    const { makeQuiz, loadFacts } = await import('./formats/quiz.js');
    if (!ids.length) {
      for (const f of loadFacts()) console.log(`${f.id.padEnd(22)} ${f.topic.padEnd(14)} ${f.question}`);
      const { loadSets } = await import('./formats/quiz.js');
      for (const [k, v] of Object.entries(loadSets())) console.log(`set:${k.padEnd(18)} ${v.label}: ${v.facts.join(', ')}`);
      return;
    }
    const r = await makeQuiz(ids, { voice: rest.includes('--voice'), date: flag('--date') });
    report(r);
    return;
  }

  if (cmd === 'recipe') {
    const id = rest.find((r) => !r.startsWith('--') && r !== flag('--date'));
    const { makeRecipe, loadOriginals } = await import('./formats/recipe.js');
    if (!id) {
      for (const o of loadOriginals().originals) console.log(`${o.id.padEnd(32)} ${o.totalMinutes} min · serves ${o.servings}`);
      return;
    }
    report(await makeRecipe(id, { voice: rest.includes('--voice'), date: flag('--date') }));
    return;
  }

  if (cmd === 'app') {
    const { makeApp } = await import('./formats/app.js');
    report(await makeApp({ date: flag('--date'), voice: rest.includes('--voice') }));
    return;
  }

  if (cmd === 'transform') {
    const id = rest.find((r) => !r.startsWith('--') && r !== flag('--date'));
    const { makeTransform, loadTransforms } = await import('./formats/transform.js');
    if (!id) {
      for (const t of loadTransforms()) console.log(`${t.id.padEnd(24)} Recipe Fixed #${t.number}  ${t.keyword}`);
      return;
    }
    report(await makeTransform(id, { voice: rest.includes('--voice'), date: flag('--date') }));
    return;
  }

  if (cmd === 'critique') {
    const dir = rest[0];
    if (!dir) throw new Error('usage: pnpm mk critique <run-dir>');
    const { critique } = await import('./critique.js');
    const c = await critique(dir);
    console.log(`${c.verdict.toUpperCase()}  stop ${c.scores.stop} · stay ${c.scores.stay} · engage ${c.scores.engage} · human ${c.scores.human}  ($${c.cost_usd})`);
    console.log(`first impression: ${c.first_impression}\nwould leave at: ${c.would_leave_at}`);
    for (const p of c.problems) console.log(`  - ${p}`);
    for (const f of c.fixes) console.log(`  → ${f}`);
    return;
  }

  if (cmd === 'plan-week') {
    const { planWeek } = await import('./schedule.js');
    const start = flag('--start') ?? new Date(Date.now() + 86400_000).toLocaleDateString('en-CA');
    const items = planWeek({ start, perDay: Number(flag('--per-day') ?? 2) });
    for (const it of items) console.log(`${it.day} ${it.slot}  ${it.format.padEnd(9)} ${it.command}`);
    console.log(`→ runs/schedule/${start}.json`);
    return;
  }

  if (cmd === 'run-plan') {
    // make → QA → viewer review → (with --live) queue in Blotato at the planned time.
    const file = rest.find((r) => !r.startsWith('--'));
    if (!file) throw new Error('usage: pnpm mk run-plan <runs/schedule/DATE.json> [--live] [--tz -04:00]');
    const { readFileSync, existsSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const { critique } = await import('./critique.js');
    const { publishRun } = await import('./publish.js');
    const items = JSON.parse(readFileSync(file, 'utf8')) as Array<{ day: string; slot: string; command: string; posts: string[] }>;
    const tz = flag('--tz') ?? '-04:00';
    for (const it of items) {
      const args = it.command.split(' ');
      const out = execFileSync('npx', ['tsx', path.join(path.dirname(new URL(import.meta.url).pathname), 'cli.ts'), ...args], { encoding: 'utf8' });
      const m = /^(\S+): QA (PASS|FAIL)/m.exec(out);
      if (!m) throw new Error(`could not read the result of "${it.command}":\n${out.slice(-400)}`);
      const today = new Date().toLocaleDateString('en-CA');
      const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../../runs', today, m[1]!);
      if (m[2] !== 'PASS' || !existsSync(dir)) { console.log(`${it.day} ${it.command}: QA FAIL, skipped`); continue; }
      const c = await critique(dir);
      console.log(`${it.day} ${it.slot} ${it.command}: ${c.verdict} ${JSON.stringify(c.scores)}`);
      if (c.verdict !== 'post') continue;
      await publishRun(dir, { live: rest.includes('--live'), only: it.posts, at: `${it.day}T${it.slot}:00${tz}` });
    }
    return;
  }

  if (cmd === 'accounts') {
    const { listAccounts, accountFor } = await import('./publish.js');
    const all = await listAccounts();
    for (const a of all) console.log(`${a.platform.padEnd(10)} ${a.id.padEnd(8)} ${a.username ?? a.fullname ?? ''}`);
    for (const p of ['tiktok', 'instagram', 'x', 'threads', 'youtube', 'pinterest'] as const) {
      const id = accountFor(p);
      const ok = all.some((a) => a.id === id);
      console.log(`  mk uses ${p.padEnd(9)} → ${id ?? '(none)'} ${ok ? 'ok' : 'NOT CONNECTED'}`);
    }
    return;
  }

  if (cmd === 'publish') {
    const dir = rest.find((r) => !r.startsWith('--') && r !== flag('--only') && r !== flag('--at'));
    if (!dir) throw new Error('usage: pnpm mk publish <run-dir> [--only tiktok,x] [--live] [--at 2026-10-27T17:00:00-04:00]');
    const { publishRun } = await import('./publish.js');
    await publishRun(dir, { live: rest.includes('--live'), only: flag('--only')?.split(','), at: flag('--at') });
    return;
  }

  if (cmd === 'status') {
    const dir = rest[0];
    if (!dir) throw new Error('usage: pnpm mk status <run-dir>');
    const { pollAll } = await import('./publish.js');
    await pollAll(path.join(path.resolve(dir), 'publish.json'), 0);
    return;
  }

  if (cmd === 'gate') {
    const file = rest[0];
    if (!file) throw new Error('usage: pnpm mk gate <drafts.json>');
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { runCopyGate } = await import('./copyGate.js');
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      drafts: Array<{ id: string; idea: string; platform: 'x' | 'instagram' | 'tiktok'; text: string; hashtags: string[]; claim_ids: string[]; fact_ids: string[]; media: string }>;
    };
    const ideas = loadIdeas();
    const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
    const results = doc.drafts.map((d) => {
      const idea = ideas.ideas.find((i) => i.id === d.idea)!;
      const ctx = openRun(d.idea);
      const g = runCopyGate({
        pack,
        lines: [],
        caption: { text: d.text, hashtags: d.hashtags, platform: d.platform, claimIds: d.claim_ids, factIds: d.fact_ids },
        proofText: JSON.stringify(ctx.proof),
        factSources: idea.fact_sources,
        productTerms: ideas.product_terms,
      });
      const media = idea ? d.media : null;
      console.log(`${d.id}: ${g.passed ? 'GATE PASS' : 'GATE FAIL'}${g.checks.filter((c) => c.problems.length).map((c) => `\n  ${c.passed ? 'warn' : 'FAIL'} ${c.id}: ${c.problems.join(' | ')}`).join('')}`);
      return { id: d.id, media, passed: g.passed, checks: g.checks, knowledge_commit: pack.commit, product_posts_paused: productPostsPaused(pack) };
    });
    writeFileSync(file.replace(/\.json$/, '.gate.json'), `${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  if (cmd === 'ledger') {
    const ledger = new Ledger(LEDGER_FILE, SPEND_CAP_USD);
    for (const e of ledger.entries()) console.log(`${e.at} ${e.run.padEnd(16)} ${e.provider}/${e.model} ${e.purpose} $${e.usd.toFixed(4)}`);
    console.log(`total $${ledger.spent().toFixed(4)} of $${ledger.capUsd.toFixed(2)}`);
    return;
  }

  console.log('usage: pnpm mk <brief|plan|make|gate|ledger>');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
