/**
 * Render every image template to disk, so somebody can look at them.
 *
 *   pnpm render-templates [outDir]
 *
 * The gates measure contrast, aspect ratio and whether the claimed thing is
 * shown. None of that answers "does this look like something a person would
 * stop scrolling for", and nothing else in the repo puts the actual pixels
 * where a human can see them without running the whole pipeline first.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderTemplate } from '../packages/render/src/index.js';

const OUT = process.argv[2] ?? '.render-output/templates';
mkdirSync(OUT, { recursive: true });

const artifact = {
  headline: "Sally's Artisan Bread, gluten-free",
  swaps: [
    {
      before: '3 1/4 cups bread flour',
      after: '3 1/4 cups gluten-free bread blend',
      reason: 'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable.',
    },
  ],
};

const cases: Array<[string, string, Record<string, unknown>]> = [
  ['transformation_diff_4x5', '4:5', {
    headline: artifact.headline,
    before: artifact.swaps[0]!.before,
    after: artifact.swaps[0]!.after,
    reason: artifact.swaps[0]!.reason,
    alternative: null,
  }],
  ['transformation_diff_1x1', '1:1', {
    headline: artifact.headline,
    before: artifact.swaps[0]!.before,
    after: artifact.swaps[0]!.after,
    reason: artifact.swaps[0]!.reason,
    alternative: null,
  }],
  ['chef_note_quote', '1:1', {
    quote: 'The vinegar is doing structural work, not flavour work.',
    attribution: artifact.headline,
  }],
  ['substitution_ratio', '1:1', {
    ingredient: 'bread flour',
    substitute: 'gluten-free blend',
    ratio: 'Same volume, more water',
    failureMode: 'Skip the extra water and the crumb reads dry before it finishes setting.',
  }],
  ['pinterest_tall', '2:3', {
    title: artifact.headline,
    subtitle: 'One swap, and why it works.',
    bullets: [
      'Use a 1:1 gluten-free blend with xanthan gum.',
      'Add a little more water than the original calls for.',
      'Rest the dough longer before shaping.',
    ],
  }],
  ['carousel_6', '4:5', {
    index: 1,
    total: 6,
    kicker: 'One change',
    headline: 'Swap the flour',
    bodyLines: ['A 1:1 blend with xanthan gum keeps the dough workable.'],
  }],
  ['scaling_math', '1:1', {
    fromServings: 8,
    toServings: 2,
    rows: [
      { label: 'Salt', linear: '1/2 tsp', actual: '3/4 tsp' },
      { label: 'Yeast', linear: '1/2 tsp', actual: '3/4 tsp' },
    ],
    note: 'Salt and yeast scale to roughly 85 percent of linear.',
  }],
];

async function main(): Promise<void> {
for (const [templateId, aspectRatio, props] of cases) {
  try {
    const r = await renderTemplate({
      templateId: templateId as never,
      props,
      brandTokens: null,
      aspectRatio,
      quality: 'final',
      wordmark: 'recipefix',
    });
    writeFileSync(`${OUT}/${templateId}.png`, r.png);
    console.log(`ok   ${templateId}  ${r.width}x${r.height}`);
  } catch (err) {
    console.log(`FAIL ${templateId}: ${(err as Error).message.slice(0, 120)}`);
  }
}
}

void main();
