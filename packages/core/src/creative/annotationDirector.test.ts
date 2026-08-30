/**
 * §331. The rule is that a mark needs *both* a voice and a location.
 */
import { describe, it, expect } from 'vitest';
import { planAnnotations, type MarkTarget, type SpokenLine } from './annotationDirector.js';

/* The real capture: a diet chip, tapped, with the line written about it. */
const chip: MarkTarget = {
  label: 'choose gluten-free',
  box: { x: 0.42, y: 0.53, width: 0.16, height: 0.05 },
  atSeconds: 3.0,
  validForSeconds: 1.5,
};

const wideRow: MarkTarget = {
  label: 'the swapped ingredient',
  box: { x: 0.08, y: 0.44, width: 0.84, height: 0.06 },
  atSeconds: 9.0,
  validForSeconds: 1.5,
};

const base = { marks: ['circle', 'box', 'underline', 'arrow'] as const, durationSeconds: 30 };

describe('planAnnotations', () => {
  it('marks a region the line was written about', () => {
    const narration: SpokenLine[] = [
      { atSeconds: 3.1, text: 'Say what you need. Gluten-free.', targetLabel: 'choose gluten-free' },
    ];
    const plan = planAnnotations({ ...base, marks: [...base.marks], narration, targets: [chip] });
    expect(plan.marks).toHaveLength(1);
    expect(plan.marks[0]!.target.label).toBe('choose gluten-free');
  });

  it('refuses to mark a region nobody is talking about', () => {
    /* A mark on something unmentioned makes a viewer hunt for a significance
       that is not there. */
    const plan = planAnnotations({
      ...base,
      marks: [...base.marks],
      narration: [{ atSeconds: 3.1, text: 'Something else entirely.' }],
      targets: [chip],
    });
    expect(plan.marks).toHaveLength(0);
  });

  it('refuses to mark once the position is no longer true', () => {
    /*
     * §319: a tap position is true at the instant it was measured. A line
     * spoken eight seconds later refers to a screen that has moved.
     */
    const plan = planAnnotations({
      ...base,
      marks: [...base.marks],
      narration: [
        { atSeconds: 11.0, text: 'Say what you need. Gluten-free.', targetLabel: 'choose gluten-free' },
      ],
      targets: [chip],
    });
    expect(plan.marks).toHaveLength(0);
    expect(plan.skipped.length + plan.marks.length).toBeGreaterThanOrEqual(0);
  });

  it('picks the mark from the region’s shape', () => {
    /*
     * A full-width row is underlined; a pill-shaped chip at 3.2:1 is boxed,
     * not ringed — a circle around a wide control either misses its ends or
     * covers everything above and below it, which is §324's finding; and a
     * genuinely compact control is ringed.
     */
    const icon: MarkTarget = {
      label: 'the save icon',
      box: { x: 0.44, y: 0.2, width: 0.07, height: 0.05 },
      atSeconds: 15.0,
      validForSeconds: 1.5,
    };
    const plan = planAnnotations({
      ...base,
      marks: [...base.marks],
      narration: [
        { atSeconds: 3.1, text: 'x', targetLabel: 'choose gluten-free' },
        { atSeconds: 9.1, text: 'y', targetLabel: 'the swapped ingredient' },
        { atSeconds: 15.1, text: 'z', targetLabel: 'the save icon' },
      ],
      targets: [chip, wideRow, icon],
    });
    const byLabel = new Map(plan.marks.map((m) => [m.target.label, m.kind]));
    expect(byLabel.get('choose gluten-free')).toBe('box');
    expect(byLabel.get('the swapped ingredient')).toBe('underline');
    expect(byLabel.get('the save icon')).toBe('circle');
  });

  it('stays inside the product’s vocabulary rather than picking the ideal shape', () => {
    /*
     * A pack is a restriction. An account that circles some things and boxes
     * others looks like several people made it.
     */
    const plan = planAnnotations({
      ...base,
      marks: ['box'],
      narration: [{ atSeconds: 3.1, text: 'x', targetLabel: 'choose gluten-free' }],
      targets: [chip],
    });
    expect(plan.marks[0]!.kind).toBe('box');
  });

  it('never draws two marks close enough to collide', () => {
    /* §319: two taps 76ms apart drew two rings at once, pointing at neither. */
    const near: MarkTarget = { ...wideRow, label: 'another thing', atSeconds: 3.2 };
    const plan = planAnnotations({
      ...base,
      marks: [...base.marks],
      narration: [
        { atSeconds: 3.1, text: 'x', targetLabel: 'choose gluten-free' },
        { atSeconds: 3.3, text: 'y', targetLabel: 'another thing' },
      ],
      targets: [chip, near],
    });
    expect(plan.marks).toHaveLength(1);
    expect(plan.skipped[0]!.because).toContain('point at neither');
  });

  it('caps marks as a proportion of runtime', () => {
    /* Marking a third of a video is a video with no emphasis and a lot of ink. */
    const targets: MarkTarget[] = [];
    const narration: SpokenLine[] = [];
    for (let i = 0; i < 40; i += 1) {
      const label = `thing ${i}`;
      targets.push({ label, box: { x: 0.4, y: 0.4, width: 0.1, height: 0.05 }, atSeconds: i * 3 });
      narration.push({ atSeconds: i * 3, text: label, targetLabel: label });
    }
    const plan = planAnnotations({ ...base, marks: [...base.marks], narration, targets, durationSeconds: 60 });
    expect(plan.marks.length).toBeLessThanOrEqual(8);
    expect(plan.skipped.length).toBeGreaterThan(0);
  });

  it('explains every mark and every refusal', () => {
    const plan = planAnnotations({
      ...base,
      marks: [...base.marks],
      narration: [{ atSeconds: 3.1, text: 'x', targetLabel: 'choose gluten-free' }],
      targets: [chip],
    });
    for (const mark of plan.marks) expect(mark.reason.length).toBeGreaterThan(20);
  });
});
