/**
 * §408. Every format, written for real and then built into both surfaces.
 *
 * The tests assert that a builder exists and produces something from a
 * synthetic draft. This asks the harder question: does a *model*, given the
 * real brief, produce a draft those builders can turn into a video and a deck?
 * §404 was invisible to every test in the repo and obvious the first time this
 * was run.
 *
 *   pnpm exec tsx scripts/format-smoke.ts [formatId] [propsOut.json]
 *
 * Costs one model call per format. Not in CI for that reason — it is the check
 * you run before believing the pipeline works.
 */
import { writeFileSync } from 'node:fs';
import { briefFor, POST_FORMATS, POST_FORMAT_CATALOG, createLlmClient, parseDraft, repairDraft, checkDraft } from '@halyard/core';
import { videoForFormat } from '../packages/render/src/video/index.js';
import { slidesForFormat } from '../packages/render/src/image/formatSlides.js';

const SUBJECT: Record<string, string> = {
  quiz: 'How well do you know gluten?',
  history: 'Where did sourdough come from?',
  tips: 'Getting gluten-free bread to rise',
  recipe: 'A gluten-free chocolate chip cookie',
  myth_fact: 'Does gluten-free mean healthier?',
  comparison: 'Almond flour versus rice flour',
  origin: 'Where baking powder came from',
  poll: 'Butter or oil in gluten-free cake?',
  behind: 'How we test an adapted recipe',
  walkthrough: 'Adapting a lasagne to be dairy-free',
  transformation: 'A wheat brownie made gluten-free',
};

async function main() {
  const llm = createLlmClient(process.env as never);
  const only = process.argv[2];
  for (const id of POST_FORMATS) {
    if (only && id !== only) continue;
    const format = POST_FORMAT_CATALOG[id];
    const r = await llm.complete({
      system: briefFor(format, { platform: 'tiktok', subject: SUBJECT[id], audience: 'home cooks' } as never),
      messages: [{ role: 'user', content: `Write it now, about: ${SUBJECT[id]}` }],
      maxTokens: 1400, promptVersion: 'diag',
    });
    const s = r.text.indexOf('{'), e = r.text.lastIndexOf('}');
    const draft = repairDraft(format, parseDraft(JSON.parse(r.text.slice(s, e + 1)), format)).draft;
    const slots = draft.slots.map((sl) => ({ key: sl.key, index: sl.index, text: sl.text, citation: sl.citation ?? null }));
    const incomplete = checkDraft(format, draft).problems.some((p) => p.rule === 'format.incomplete');
    const vid = videoForFormat(id, slots);
    const deck = slidesForFormat(id, slots);
    const beats = (vid?.props as { beats?: unknown[] })?.beats?.length ?? 0;
    console.log(
      `${id.padEnd(15)} write=${incomplete ? 'INCOMPLETE' : 'ok'.padEnd(10)} ` +
      `video=${vid ? `${vid.compositionId}(${beats} beats)`.padEnd(22) : '—'.padEnd(22)} deck=${deck.length} slides`,
    );
    if (only && vid) writeFileSync(process.argv[3], JSON.stringify(vid.props, null, 2));
  }
}
main();
