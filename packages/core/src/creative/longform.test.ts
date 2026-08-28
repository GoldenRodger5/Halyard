import { describe, expect, it } from 'vitest';
import { chaptersFromBeats } from '../youtube/chapters.js';
import {
  LONG_FORM_MAX_SECONDS,
  LONG_FORM_MIN_SECONDS,
  chooseLongFormShape,
  longFormBeats,
  longFormScenes,
  planLongForm,
  type LongFormInput,
} from './longform.js';

const artifact = {
  headline: 'Gluten-free bread that holds',
  highlights: [
    { type: 'technique', note: 'Hydrate the blend for twenty minutes.', sourcePath: 'steps[0]' },
    { type: 'technique', note: 'Keep the boil active, not rolling.', sourcePath: 'steps[1]' },
    { type: 'technique', note: 'Rest before slicing.', sourcePath: 'steps[2]' },
    { type: 'swap', before: 'bread flour', after: 'gluten-free blend', reason: 'Xanthan gum does the structural work.' },
    { type: 'swap', before: 'one rise', after: 'two rises', reason: 'The second rise is where the crumb sets.' },
  ],
} as unknown as LongFormInput['artifact'];

const base: LongFormInput = { artifact, targetSeconds: 480, hasFootage: true };

describe('a long-form video is a different shape, not a longer short', () => {
  it('produces sections measured in minutes, not beats in seconds', () => {
    /*
     * §249. Ask a short-form planner for eight minutes and the timing engine
     * stretches four beats to two minutes each. That is not long-form, it is a
     * slideshow with very patient slides.
     */
    const plan = planLongForm(base);
    expect(plan.sections.length).toBeGreaterThanOrEqual(6);
    expect(plan.totalSeconds).toBeGreaterThanOrEqual(LONG_FORM_MIN_SECONDS);
    /* The body should dominate; a structure with equal sections has no argument. */
    const longest = Math.max(...plan.sections.map((s) => s.targetSeconds));
    const shortest = Math.min(...plan.sections.map((s) => s.targetSeconds));
    expect(longest).toBeGreaterThan(shortest * 2);
  });

  it('produces a chapter list YouTube will actually render', () => {
    /*
     * The constraint that shapes the structure. §223: at least three chapters,
     * the first at 0:00, each at least ten seconds. A structure that cannot
     * satisfy that has chapters which silently never appear.
     */
    const plan = planLongForm(base);
    const scenes = longFormScenes(plan);
    let at = 0;
    const chapters = scenes.map((s) => {
      const start = at;
      at += s.minSeconds;
      return { title: plan.sections.find((x) => x.id === s.id)!.title, startSeconds: start };
    });
    const result = chaptersFromBeats(chapters, plan.totalSeconds);
    expect(result.refusedReason).toBeNull();
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    expect(result.lines[0]).toMatch(/^0:00 /);
  });

  it('gives every chapter a real title rather than a number', () => {
    for (const section of planLongForm(base).sections) {
      expect(section.title).not.toMatch(/^(section|chapter|part)\s*\d/i);
      expect(section.title.length).toBeGreaterThan(3);
    }
  });

  it('clamps a request that is too short or absurdly long', () => {
    expect(planLongForm({ ...base, targetSeconds: 30 }).totalSeconds)
      .toBeGreaterThanOrEqual(LONG_FORM_MIN_SECONDS);
    expect(planLongForm({ ...base, targetSeconds: 7200 }).totalSeconds)
      .toBeLessThanOrEqual(LONG_FORM_MAX_SECONDS + 60);
  });

  it('scales proportionally, so one structure serves five and twelve minutes', () => {
    const short = planLongForm({ ...base, targetSeconds: 300 });
    const long = planLongForm({ ...base, targetSeconds: 720 });
    expect(short.shape).toBe(long.shape);
    expect(long.totalSeconds).toBeGreaterThan(short.totalSeconds);
    /* The demonstration keeps its share of the whole. */
    const share = (p: typeof short) =>
      p.sections.find((s) => s.role === 'demonstration')!.targetSeconds / p.totalSeconds;
    expect(Math.abs(share(short) - share(long))).toBeLessThan(0.08);
  });
});

describe('chooseLongFormShape', () => {
  it('refuses a shape the artifact cannot fill', () => {
    /*
     * A shape whose sections have nothing to put in them produces two minutes
     * of nothing in the middle, which is worse than a shorter video.
     */
    const thin = {
      headline: 'One swap',
      highlights: [{ type: 'swap', before: 'a', after: 'b', reason: 'because' }],
    } as unknown as LongFormInput['artifact'];
    const r = chooseLongFormShape({ ...base, artifact: thin });
    expect(r.unavailable.map((u) => u.shape)).toContain('tutorial');
    expect(r.unavailable.find((u) => u.shape === 'tutorial')!.because).toContain('at least three');
  });

  it('refuses shapes that need footage when there is none', () => {
    const r = chooseLongFormShape({ ...base, hasFootage: false });
    const blocked = r.unavailable.map((u) => u.shape);
    expect(blocked).toContain('walkthrough');
    expect(blocked).toContain('case_study');
  });

  it('still has a buildable shape for an artifact carrying nothing', () => {
    /*
     * `explainer` needs a misconception and a mechanism — words the
     * copywriter supplies, not assets the artifact must carry — so it is
     * never refused and there is always something to build.
     */
    const nothing = { headline: 'x', highlights: [] } as unknown as LongFormInput['artifact'];
    const r = chooseLongFormShape({ ...base, artifact: nothing, hasFootage: false });
    expect(r.shape).toBe('explainer');
    expect(r.unavailable.length).toBeGreaterThan(2);
  });

  it('varies across a run rather than repeating one shape', () => {
    const used: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      used.unshift(chooseLongFormShape({ ...base, recentShapes: used }).shape);
    }
    expect(new Set(used).size).toBeGreaterThan(1);
  });
});

describe('longFormBeats', () => {
  it('gives every section exactly one beat, not a short-form chop', () => {
    const plan = planLongForm(base);
    const beats = longFormBeats(plan, artifact);
    expect(beats).toHaveLength(plan.sections.length);
  });

  it('carries the section title onto the frame, so the chapter and the card agree', () => {
    const plan = planLongForm(base);
    const beats = longFormBeats(plan, artifact);
    for (const [i, beat] of beats.entries()) {
      expect(beat.content.label).toBe(plan.sections[i]!.title);
    }
  });

  it('opens on a hook and steps through the rest', () => {
    const beats = longFormBeats(planLongForm(base), artifact);
    expect(beats[0]!.role).toBe('hook');
    expect(beats.slice(2).every((b) => b.role === 'step')).toBe(true);
  });

  it('keeps the intended section lengths rather than deriving them from emphasis', () => {
    // A long-form section has an intended length: the demonstration is 45% of
    // the video *because that is the argument*.
    const plan = planLongForm(base);
    const scenes = longFormScenes(plan);
    for (const [i, scene] of scenes.entries()) {
      expect(scene.minSeconds).toBe(plan.sections[i]!.targetSeconds);
    }
  });

  it('carries provenance from the artifact where it exists', () => {
    const beats = longFormBeats(planLongForm(base), artifact);
    expect(beats.some((b) => typeof b.sourcePath === 'string')).toBe(true);
  });
});
