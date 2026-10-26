#!/usr/bin/env tsx
/* eslint-disable no-console -- a CLI: stdout is its interface */
/**
 * `pnpm mk <command>` — the lean marketing lane. Local, file-based, never publishes.
 *
 *   pnpm mk brief                     print the assembled brief and the pack's state
 *   pnpm mk plan                      list ideas, check every cited claim against the pack
 *   pnpm mk make <idea-id> [--copy f] render + QA one idea (model copy, or a reviewed copy file)
 *   pnpm mk ledger                    the spend ledger and the cap
 *
 * Paid calls (copy, voice) go through the ledger and stop before the cap.
 */
import path from 'node:path';
import { loadIdeas, LEDGER_FILE, openRun, SPEND_CAP_USD } from './runContext.js';
import { claimById, isQuotable, loadKnowledgePack, productPostsPaused } from './knowledge.js';
import { Ledger } from './ledger.js';

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

  if (cmd === 'ledger') {
    const ledger = new Ledger(LEDGER_FILE, SPEND_CAP_USD);
    for (const e of ledger.entries()) console.log(`${e.at} ${e.run.padEnd(16)} ${e.provider}/${e.model} ${e.purpose} $${e.usd.toFixed(4)}`);
    console.log(`total $${ledger.spent().toFixed(4)} of $${ledger.capUsd.toFixed(2)}`);
    return;
  }

  console.log('usage: pnpm mk <brief|plan|make|ledger>');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
