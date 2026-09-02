/**
 * §519. A slide that is a label with nothing under it.
 *
 * The first pastry carousel published three slides, one of which read
 * `Chef notes / What to watch` and said nothing else — the slide was pushed
 * because a technique *existed*, and its body was built afterwards from
 * optional fields that filtered to empty. §482's fragment stack, one surface
 * along: a heading is not content.
 */
import { describe, expect, it } from 'vitest';
import { carouselProps } from './artifactProps.js';
import type { ProductArtifact } from '@halyard/core';

const artifact = (highlights: unknown[]): ProductArtifact =>
  ({
    kind: 'recipe_adaptation',
    raw: {},
    headline: 'Dairy Free Shortcrust Pastry',
    visualHints: [],
    highlights,
  }) as ProductArtifact;

const swap = { type: 'swap', before: 'butter', after: 'lard', reason: 'Fat with no water in it.' };

const chefNotes = (a: ProductArtifact) => carouselProps(a).find((s) => s.kicker === 'Chef notes');

describe('§519 a slide must carry content', () => {
  it('drops the chef-notes slide when every note is empty', () => {
    const slides = carouselProps(artifact([swap, { type: 'technique', note: '' }]));
    expect(slides.find((s) => s.kicker === 'Chef notes')).toBeUndefined();
    expect(slides.some((s) => s.headline === 'What to watch')).toBe(false);
  });

  it('never renders the placeholder headline, whatever the highlights are', () => {
    for (const h of [
      [swap, { type: 'technique' }],
      [swap, { type: 'chef_note', text: '' }],
      [swap, { type: 'technique', note: '   ' }],
    ]) {
      expect(carouselProps(artifact(h)).some((s) => s.headline === 'What to watch')).toBe(false);
    }
  });

  it('promotes a real note to the headline when no technique title exists', () => {
    const notes = chefNotes(
      artifact([swap, { type: 'chef_note', text: 'Chill the dough twice or it shrinks in the tin.' }]),
    );
    expect(notes?.headline).toBe('Chill the dough twice or it shrinks in the tin.');
  });

  it('keeps a technique title as the headline with its note beneath', () => {
    const notes = chefNotes(
      artifact([swap, { type: 'technique', title: 'Keep it cold', note: 'Warm fat makes it tough.' }]),
    );
    expect(notes?.headline).toBe('Keep it cold');
    expect(notes?.bodyLines.length).toBeGreaterThan(0);
  });
});
