/**
 * §310. Build preview props through `videoForFormat`, not beside it.
 *
 * A preview assembled by hand previews a second implementation of the same
 * idea, and the one most likely to disagree with production is the hand-made
 * one. This runs the real builder over real slot text and writes exactly what
 * it produced — props and the timed narration together.
 *
 *   pnpm exec tsx scripts/make-preview-props.ts quiz > .../props.json
 */
import { videoForFormat } from '../packages/render/src/video/formatVideo.js';
import type { SlotValue } from '../packages/render/src/image/formatSlides.js';

const SLOTS: Record<string, SlotValue[]> = {
  quiz: [
    { key: 'title', index: 0, text: 'How well do you know gluten?', citation: null },
    { key: 'question', index: 0, text: 'What year was gluten first identified?', citation: 'Beccari, De Frumento (1728)' },
    { key: 'options', index: 0, text: '1728|1928|1608', citation: null },
    { key: 'answer', index: 0, text: '1728. Beccari separated wheat into starch and a stretchy residue.', citation: null },
    { key: 'question', index: 1, text: 'Xanthan gum is made by fermenting sugar with bacteria.', citation: 'FDA 21 CFR 172.695' },
    { key: 'options', index: 1, text: 'True|False', citation: null },
    { key: 'answer', index: 1, text: 'True. It is grown on sugar by Xanthomonas campestris.', citation: null },
    { key: 'question', index: 2, text: 'Which flour needs the most extra liquid?', citation: null },
    { key: 'options', index: 2, text: 'Coconut flour|Almond flour|Oat flour|Rice flour', citation: null },
    { key: 'answer', index: 2, text: 'Coconut flour. It absorbs about four times its weight.', citation: null },
    { key: 'close', index: 0, text: 'How many did you get?', citation: null },
  ],
  history: [
    { key: 'hook', index: 0, text: 'Bread was an accident.', citation: null },
    { key: 'setup', index: 0, text: 'Flour and water left out long enough catches wild yeast from the air.', citation: null },
    { key: 'turn', index: 0, text: 'Somebody baked it anyway.', citation: null },
    { key: 'why_it_matters', index: 0, text: 'Every loaf since is that same accident, repeated on purpose.', citation: null },
    { key: 'source', index: 0, text: 'Wikipedia: History of bread', citation: null },
  ],
};

const format = process.argv[2] ?? 'quiz';
const slots = SLOTS[format];
if (!slots) throw new Error(`No preview slots written for '${format}'.`);

const built = videoForFormat(format, slots);
if (!built) throw new Error(`videoForFormat refused '${format}'.`);

process.stderr.write(`${format} → ${built.compositionId}, ${built.narration.length} lines\n`);
process.stdout.write(
  JSON.stringify({ ...built.props, wordmark: 'RecipeFix', narration: built.narration }, null, 2),
);
