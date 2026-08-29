/**
 * §267. Choosing a composition, not cycling through one.
 *
 * The first production carousel rendered six slides in one layout, so the deck
 * varied by nothing the eye reads first. These assert the choice is driven by
 * the content and the brand rather than by a counter — and, more importantly,
 * that it never picks a shape the content cannot fill.
 */
import { describe, expect, it } from 'vitest';
import {
  CAROUSEL_LAYOUTS,
  LAYOUTS_FOR_LANGUAGE,
  LAYOUT_RENDERERS,
  chooseLayout,
  type CarouselLayout,
} from './layouts.js';

describe('choosing a carousel layout', () => {
  it('never picks a body-heavy layout for a slide with no body', () => {
    /* An editorial column with nothing to put in it renders an empty well. */
    for (const language of Object.keys(LAYOUTS_FOR_LANGUAGE)) {
      const { layout } = chooseLayout({ role: 'detail', visualLanguage: language, bodyLineCount: 0 });
      expect(['statement', 'lead_emphasis', 'numbered'], language).toContain(layout);
    }
  });

  it('never picks a display layout for a slide carrying three supporting lines', () => {
    /* A statement layout given four sentences shrinks them past legibility. */
    for (const language of Object.keys(LAYOUTS_FOR_LANGUAGE)) {
      const { layout } = chooseLayout({ role: 'detail', visualLanguage: language, bodyLineCount: 3 });
      expect(['editorial', 'split_rule'], language).toContain(layout);
    }
  });

  it('gives the opening slide presence when it has room for it', () => {
    /* Slide one is the only one most people see. */
    const { layout } = chooseLayout({
      role: 'hook',
      visualLanguage: 'bold_social',
      bodyLineCount: 0,
    });
    expect(['statement', 'lead_emphasis']).toContain(layout);
  });

  it('rotates within a deck rather than repeating a shape', () => {
    const used: CarouselLayout[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { layout } = chooseLayout({
        role: 'detail',
        visualLanguage: 'clean_modern',
        bodyLineCount: 1,
        recentLayouts: used,
      });
      used.unshift(layout);
    }
    /* Four consecutive slides must not all be the same composition. */
    expect(new Set(used).size).toBeGreaterThan(1);
  });

  it('respects the language, so a documentary piece is not shouted', () => {
    const { layout } = chooseLayout({
      role: 'detail',
      visualLanguage: 'documentary',
      bodyLineCount: 1,
    });
    expect(LAYOUTS_FOR_LANGUAGE.documentary).toContain(layout);
  });

  it('considers every layout for a language nothing declares', () => {
    /*
     * Same rule as `selectTypography`: a default here means a new visual
     * language silently inherits the look of every old one.
     */
    const seen = new Set<CarouselLayout>();
    const used: CarouselLayout[] = [];
    for (let i = 0; i < CAROUSEL_LAYOUTS.length; i += 1) {
      const { layout } = chooseLayout({
        role: 'detail',
        visualLanguage: 'a_language_nobody_wrote',
        bodyLineCount: 1,
        recentLayouts: used,
      });
      seen.add(layout);
      used.unshift(layout);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('explains the choice, because an unexplained one cannot be argued with', () => {
    const { reason } = chooseLayout({ role: 'detail', visualLanguage: 'bold_social', bodyLineCount: 1 });
    expect(reason).toMatch(/bold_social|least recently used/);
  });

  it('has a renderer for every layout it can choose', () => {
    /* The list and the implementations are the same set written twice. */
    for (const layout of CAROUSEL_LAYOUTS) {
      expect(typeof LAYOUT_RENDERERS[layout], layout).toBe('function');
    }
    expect(Object.keys(LAYOUT_RENDERERS).sort()).toEqual([...CAROUSEL_LAYOUTS].sort());
  });

  it('only names layouts that exist, in every language mapping', () => {
    for (const [language, layouts] of Object.entries(LAYOUTS_FOR_LANGUAGE)) {
      for (const layout of layouts) {
        expect(CAROUSEL_LAYOUTS, `${language} -> ${layout}`).toContain(layout);
      }
    }
  });
});
