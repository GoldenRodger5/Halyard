/**
 * §345. The operator's case: an X post with a caption, one with a caption and
 * an image, and one with a caption and a video are three different productions.
 */
import { describe, it, expect } from 'vitest';
import { canStart, planProduction, type Stage } from './productionPlan.js';

const stagesOf = (p: ReturnType<typeof planProduction>) => p.stages.map((s) => s.stage);

describe('planProduction', () => {
  it('runs almost nothing for a caption-only post', () => {
    const plan = planProduction({ channel: 'text_post', media: 'text', sourced: false });
    expect(stagesOf(plan)).toEqual(['brief', 'write', 'caption']);
    /* And it says why each of the others did not run. */
    expect(plan.skipped.map((s) => s.stage)).toContain('screenplay');
    expect(plan.skipped.map((s) => s.stage)).toContain('voice');
  });

  it('adds assets and a render for a caption with an image, and no voice', () => {
    const plan = planProduction({ channel: 'text_post', media: 'image', sourced: false });
    expect(stagesOf(plan)).toContain('assets');
    expect(stagesOf(plan)).toContain('render');
    expect(stagesOf(plan)).not.toContain('voice');
    expect(stagesOf(plan)).not.toContain('music');
  });

  it('runs the whole thing for a video', () => {
    const plan = planProduction({ channel: 'short_video', media: 'video', sourced: true });
    for (const stage of ['research', 'write', 'screenplay', 'assets', 'voice', 'music', 'marks', 'render', 'qc']) {
      expect(stagesOf(plan)).toContain(stage as Stage);
    }
  });

  it('stages a carousel without giving it a voice', () => {
    /* A carousel is a sequence and needs ordering; nobody speaks over it. */
    const plan = planProduction({ channel: 'carousel', media: 'carousel', sourced: false });
    expect(stagesOf(plan)).toContain('screenplay');
    expect(stagesOf(plan)).not.toContain('voice');
  });

  it('researches only when the format makes claims about the world', () => {
    expect(
      stagesOf(planProduction({ channel: 'short_video', media: 'video', sourced: false })),
    ).not.toContain('research');
    expect(
      stagesOf(planProduction({ channel: 'short_video', media: 'video', sourced: true })),
    ).toContain('research');
  });

  it('writes the caption last for anything with a file', () => {
    /* A caption describes the finished piece; it cannot precede it. */
    const plan = planProduction({ channel: 'short_video', media: 'video', sourced: true });
    const order = stagesOf(plan);
    expect(order[order.length - 1]).toBe('caption');
    expect(order.indexOf('caption')).toBeGreaterThan(order.indexOf('render'));
  });

  it('puts research before writing, always', () => {
    /* A writer given no sources invents them. */
    const order = stagesOf(planProduction({ channel: 'short_video', media: 'video', sourced: true }));
    expect(order.indexOf('research')).toBeLessThan(order.indexOf('write'));
  });

  it('puts the screenplay before assets and voice', () => {
    /* A picture chosen before the scenes exist cannot suit any of them. */
    const order = stagesOf(planProduction({ channel: 'short_video', media: 'video', sourced: true }));
    expect(order.indexOf('screenplay')).toBeLessThan(order.indexOf('assets'));
    expect(order.indexOf('screenplay')).toBeLessThan(order.indexOf('voice'));
  });

  it('explains every stage it skipped', () => {
    /* "It did not happen" and "it was not needed" look identical in a log. */
    const plan = planProduction({ channel: 'text_post', media: 'text', sourced: false });
    for (const skipped of plan.skipped) expect(skipped.because.length).toBeGreaterThan(12);
  });
});

describe('canStart', () => {
  it('refuses a voice with no screenplay, which is how the old ordering broke', () => {
    /*
     * The real fault: writeVoScript was given the caption, because nothing
     * required a screenplay to exist first.
     */
    const gate = canStart('voice', ['brief', 'write']);
    expect(gate.ok).toBe(false);
    expect(gate.missing).toContain('screenplay');
  });

  it('refuses a screenplay before anything is written', () => {
    /* §340: with nothing written, the screenplay invents the content. */
    expect(canStart('screenplay', ['brief']).ok).toBe(false);
  });

  it('refuses QC before a render exists', () => {
    expect(canStart('qc', ['brief', 'write', 'assets']).ok).toBe(false);
  });

  it('allows a stage whose inputs have run', () => {
    expect(canStart('voice', ['brief', 'write', 'screenplay']).ok).toBe(true);
  });

  it('names what is missing rather than saying no', () => {
    expect(canStart('render', ['brief']).because).toContain('assets');
  });
});
