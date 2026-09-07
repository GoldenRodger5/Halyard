/**
 * §536. The channel that could be chosen and never rendered.
 *
 * `story` is a declared post type: it resolves from `poll` and `behind`, it
 * writes a caption, and it declares `media: 'image'`. The only image path in
 * the generate handler is gated on the still being *about the product*, and
 * neither story format is — so a poll produced a caption, queued no render at
 * all, and left an Instagram story with nothing to show.
 *
 * A whole channel, selectable and unpublishable. §478 and §508's shape one
 * level up: not a branch nothing reached, a *surface* nothing reached.
 */
import { describe, expect, it } from 'vitest';

import { storyCard, TEMPLATE_REQUIRED_PROPS, TEMPLATE_REGISTRY } from './templates.js';
import { resolveBrand } from '../brand.js';
import { CANVAS } from '../brand.js';

const brand = resolveBrand({ heading_font: 'Instrument Serif', body_font: 'Inter' });
const base = { brand, aspectRatio: '9:16' as const, question: 'Butter or oil in a dairy-free cake?' };

/** Every string drawn anywhere in the tree. */
function texts(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') {
    if (typeof node === 'string') out.push(node);
    return out;
  }
  const el = node as { props?: { children?: unknown } };
  const kids = el.props?.children;
  if (Array.isArray(kids)) kids.forEach((k) => texts(k, out));
  else texts(kids, out);
  return out;
}

describe('§536 the story card', () => {
  it('is registered, so the pipeline can reach it at all', () => {
    expect(Object.keys(TEMPLATE_REGISTRY)).toContain('story_card');
    expect(TEMPLATE_REQUIRED_PROPS.story_card).toEqual(['question']);
  });

  it('draws both halves when the format is a poll', () => {
    const tree = storyCard({ ...base, optionA: 'Plant butter', optionB: 'Neutral oil' });
    const drawn = texts(tree);
    expect(drawn).toContain('Plant butter');
    expect(drawn).toContain('Neutral oil');
  });

  it('draws neither when only one side was written, because that is not a poll', () => {
    const tree = storyCard({ ...base, optionA: 'Plant butter' });
    expect(texts(tree)).not.toContain('Plant butter');
  });

  it('carries a note instead when the story is not asking anything', () => {
    const tree = storyCard({
      ...base,
      question: 'We threw out the first four loaves',
      note: 'Oven too low, not the dough.',
    });
    expect(texts(tree)).toContain('Oven too low, not the dough.');
  });

  it('shrinks the question rather than letting it wrap into a paragraph', () => {
    /* A story is read in a glance; a long question at the short size is prose. */
    const short = JSON.stringify(storyCard(base));
    const long = JSON.stringify(
      storyCard({ ...base, question: 'Would you rather have a cake that holds its shape or one that stays tender for three days?' }),
    );
    const sizeOf = (s: string): number => Number(/"fontSize":(\d+)/.exec(s)?.[1] ?? 0);
    expect(sizeOf(long)).toBeLessThan(sizeOf(short));
  });

  it('renders on the vertical canvas the platform actually shows', () => {
    expect(CANVAS['9:16']).toEqual({ width: 1080, height: 1920 });
  });
});

describe('§536 the generate handler queues it', () => {
  it('queues a story card for a story-channel piece', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.resolve(__dirname, '../../../../apps/worker/src/handlers/generate.ts'),
      'utf8',
    );
    expect(source).toMatch(/resolvedType\.postType\.channel === 'story'/);
    expect(source).toMatch(/'story_card', 'satori'/);
    /* Both sides or neither, matching the template's own rule. */
    expect(source).toMatch(/optionA && optionB \? \{ optionA, optionB \}/);
  });
});
