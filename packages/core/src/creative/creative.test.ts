/**
 * §160. The creative plan decides how a story is told, before anything renders.
 *
 * The properties that matter here are not aesthetic. They are: the plan rests
 * on real artifact paths, it refuses when there is nothing to tell, it holds on
 * the change the piece exists for, and it knows nothing whatsoever about
 * recipes.
 */
import { describe, expect, it } from 'vitest';
import fixture from '../connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };
import { toArtifact } from '../connectors/recipefix.js';
import {
  beatsToScenes,
  footageDurationMs,
  footageSpansFor,
  planBeforeAfter,
  stepDeservesEmphasis,
  transformationsIn,
} from './plan.js';
import type { ProductArtifact } from '../connectors/types.js';

const artifact = toArtifact(fixture as never);
const input = { platform: 'tiktok', format: 'video', targetSeconds: 30 };

/** A product that is not RecipeFix, expressed only through the generic contract. */
const genericArtifact: ProductArtifact = {
  kind: 'deploy_diff',
  raw: {},
  headline: 'One deploy',
  visualHints: [],
  highlights: [
    {
      type: 'swap',
      sourcePath: 'changes[0]',
      before: 'manual rollback',
      after: 'automatic rollback',
      reason: 'The runner now detects a failed health check and reverts without a human.',
    },
    { type: 'swap', sourcePath: 'changes[1]', before: '4 steps', after: '1 step' },
    { type: 'chef_note', sourcePath: 'notes[0]', text: 'not a transformation' },
  ],
};

describe('transformationsIn', () => {
  it('takes only changes that have both a before and an after', () => {
    // A highlight with no `after` is not a transformation, whatever its type.
    const found = transformationsIn(genericArtifact);
    expect(found).toHaveLength(2);
    expect(found.every((h) => h.before && h.after)).toBe(true);
  });

  it('orders by how well the change explains itself', () => {
    // Deterministic, and no model is asked which change is interesting.
    const found = transformationsIn(genericArtifact);
    expect(found[0]!.sourcePath).toBe('changes[0]');
  });
});

describe('planBeforeAfter', () => {
  it('refuses when the artifact contains no transformation', () => {
    /*
     * The important refusal. An artifact with nothing that changed cannot be
     * told as a before/after, and a plan that rendered an empty stage would be
     * worse than falling back.
     */
    const nothing: ProductArtifact = { ...genericArtifact, highlights: [] };
    expect(planBeforeAfter(nothing, input)).toBeNull();
  });

  it('opens on a hook and holds on the leading change', () => {
    const plan = planBeforeAfter(genericArtifact, input)!;
    expect(plan.beats[0]!.role).toBe('hook');
    expect(plan.beats[0]!.emphasis).toBe('quick');

    const changes = plan.beats.filter((b) => b.role === 'change');
    expect(changes[0]!.emphasis).toBe('hold');
    // The rest are corroboration; three equal changes read as a list, which is
    // a different creative type.
    expect(changes.slice(1).every((b) => b.emphasis === 'normal')).toBe(true);
  });

  it('carries provenance for every beat drawn from the artifact', () => {
    // A beat with no source is a frame nobody can check.
    const plan = planBeforeAfter(genericArtifact, input)!;
    for (const beat of plan.beats.filter((b) => b.role !== 'hook')) {
      expect(beat.sourcePath, `${beat.id} has no provenance`).toBeTruthy();
    }
    expect(plan.evidence).toContain('changes[0]');
  });

  it('gives an explained change its own evidence beat', () => {
    const plan = planBeforeAfter(genericArtifact, input)!;
    const proof = plan.beats.find((b) => b.role === 'proof');
    expect(proof?.content.text).toContain('health check');
    expect(proof?.sourcePath).toBe('changes[0]');
  });

  it('adds no evidence beat when the change does not explain itself', () => {
    // Inventing a reason would be fabricating evidence.
    const unexplained: ProductArtifact = {
      ...genericArtifact,
      highlights: [{ type: 'swap', sourcePath: 'changes[0]', before: 'a', after: 'b' }],
    };
    const plan = planBeforeAfter(unexplained, input)!;
    expect(plan.beats.some((b) => b.role === 'proof')).toBe(false);
  });

  it('caps how many changes it shows, per platform', () => {
    const many: ProductArtifact = {
      ...genericArtifact,
      highlights: Array.from({ length: 8 }, (_, i) => ({
        type: 'swap' as const,
        sourcePath: `changes[${i}]`,
        before: `b${i}`,
        after: `a${i}`,
      })),
    };
    // A 9:16 frame fits about three pairs before the bottom lands under the
    // platform's own UI.
    expect(planBeforeAfter(many, { ...input, platform: 'tiktok' })!.beats.filter((b) => b.role === 'change')).toHaveLength(3);
    expect(planBeforeAfter(many, { ...input, platform: 'pinterest' })!.beats.filter((b) => b.role === 'change')).toHaveLength(2);
    expect(planBeforeAfter(many, { ...input, platform: 'youtube' })!.beats.filter((b) => b.role === 'change')).toHaveLength(4);
  });

  it('says why it looks the way it does', () => {
    const plan = planBeforeAfter(genericArtifact, input)!;
    expect(plan.rationale).toMatch(/transformation/);
    expect(plan.creativeType).toBe('before_after');
  });

  it('knows nothing about recipes', () => {
    /*
     * The product-agnosticism guard. This artifact has no recipe vocabulary and
     * must plan exactly as well as the RecipeFix one — §146's boundary, applied
     * to creative decisions.
     */
    const generic = planBeforeAfter(genericArtifact, input)!;
    const recipe = planBeforeAfter(artifact, input)!;
    expect(generic.creativeType).toBe(recipe.creativeType);
    expect(generic.beats[0]!.role).toBe(recipe.beats[0]!.role);
    expect(JSON.stringify(generic)).not.toMatch(/recipe|ingredient|gluten/i);
  });

  it('plans a real RecipeFix artifact through the same generic path', () => {
    const plan = planBeforeAfter(artifact, input)!;
    expect(plan.beats.filter((b) => b.role === 'change').length).toBeGreaterThan(0);
    expect(plan.evidence.every((p) => p.startsWith('ingredients['))).toBe(true);
  });
});

/**
 * §163. Footage is evidence, and evidence is either there or it is not.
 *
 * These are the properties that stop a capture-backed beat becoming a way to
 * draw a product state nobody recorded.
 */
describe('planning on captured footage', () => {
  const footage = { file: 'capture/some_flow.mp4', label: 'In the product', durationMs: 3800 };

  it('plans no demo beat when no capture produced footage', () => {
    // The default, and the one that must never guess a filename.
    const plan = planBeforeAfter(genericArtifact, input)!;
    expect(plan.beats.some((b) => b.role === 'demo')).toBe(false);
    expect(plan.beats.some((b) => b.media)).toBe(false);
  });

  it('opens on the product itself, after the hook and before the cards', () => {
    /*
     * Order is the claim: a card asserting a swap is an assertion, footage of
     * the swap happening is the thing itself, so it precedes the description.
     */
    const plan = planBeforeAfter(genericArtifact, { ...input, footage })!;
    expect(plan.beats[0]!.role).toBe('hook');
    expect(plan.beats[1]!.role).toBe('demo');
    expect(plan.beats[1]!.media).toEqual({ file: footage.file, label: footage.label });
    expect(plan.beats[2]!.role).toBe('change');
  });

  it('runs exactly as long as the footage, not as long as its emphasis', () => {
    /*
     * Found on a real render: a held demo beat took 8.4s of a 27.9s piece over
     * 3.8s of footage, and Remotion froze the last frame for the difference.
     * A card's length is a choice; a video's length is a fact.
     */
    const plan = planBeforeAfter(genericArtifact, { ...input, footage })!;
    const scenes = beatsToScenes(plan);
    const demo = scenes[plan.beats.findIndex((b) => b.role === 'demo')]!;
    expect(demo.minSeconds).toBeCloseTo(3.8, 5);
    expect(demo.maxSeconds).toBeCloseTo(3.8, 5);
    /*
     * Same engine, same shape — no second timing path for media beats. The
     * fields must all be ones `layoutScenes` already understands; a media beat
     * that needed a field of its own would be a second timing system wearing
     * the first one's name.
     */
    for (const key of Object.keys(demo)) {
      expect(['id', 'weight', 'minSeconds', 'maxSeconds']).toContain(key);
    }
  });

  it('weights the footage beat on the same scale as every other beat', () => {
    // Two beats measured in different units must still divide one piece.
    const short = planBeforeAfter(genericArtifact, {
      ...input,
      footage: { ...footage, durationMs: 1200 },
    })!;
    const long = planBeforeAfter(genericArtifact, {
      ...input,
      footage: { ...footage, durationMs: 7200 },
    })!;
    const weightOf = (p: typeof short) =>
      beatsToScenes(p)[p.beats.findIndex((b) => b.role === 'demo')]!.weight;
    expect(weightOf(long)).toBeGreaterThan(weightOf(short));
    // 1.2s is what a `quick` beat gets, so it should weigh the same as one.
    expect(weightOf(short)).toBeCloseTo(1, 5);
  });

  it('traces a rendered frame back to the recording it came from', () => {
    // Provenance for footage is the same obligation as provenance for a card.
    const plan = planBeforeAfter(genericArtifact, { ...input, footage })!;
    const demo = plan.beats.find((b) => b.role === 'demo')!;
    expect(demo.sourcePath).toBe('capture:capture/some_flow.mp4');
    expect(plan.evidence).toContain('capture:capture/some_flow.mp4');
  });

  it('switches the caption treatment to the media plate', () => {
    /*
     * §158 measures contrast against a known surface colour, which it cannot do
     * over video. Footage therefore asks for the plate, and a plan without it
     * keeps the flat surface it always had.
     */
    expect(planBeforeAfter(genericArtifact, { ...input, footage })!.captionBackdrop).toBe('media');
    expect(planBeforeAfter(genericArtifact, input)!.captionBackdrop).toBe('surface');
  });

  it('says footage is why it looks like this', () => {
    const plan = planBeforeAfter(genericArtifact, { ...input, footage })!;
    expect(plan.rationale).toMatch(/footage/);
  });

  it('learns nothing about the product from the footage it is handed', () => {
    /*
     * The agnosticism guard for the media path. The planner is given a filename
     * and a label and must not read either — a plan that behaved differently
     * for a recipe capture would be branching on the product.
     */
    const recipey = planBeforeAfter(genericArtifact, {
      ...input,
      footage: { file: 'capture/gluten_free_recipe.mp4', label: 'Ingredients', durationMs: 3800 },
    })!;
    const neutral = planBeforeAfter(genericArtifact, { ...input, footage })!;
    expect(recipey.beats.map((b) => b.role)).toEqual(neutral.beats.map((b) => b.role));
    expect(recipey.beats.map((b) => b.emphasis)).toEqual(neutral.beats.map((b) => b.emphasis));
  });
});

describe('beatsToScenes', () => {
  it('emits the shape layoutScenes already takes', () => {
    // A second timing system would be a second set of rounding bugs.
    const scenes = beatsToScenes(planBeforeAfter(genericArtifact, input)!);
    for (const scene of scenes) {
      expect(scene).toHaveProperty('id');
      expect(typeof scene.weight).toBe('number');
      expect(typeof scene.minSeconds).toBe('number');
    }
  });

  it('gives the held beat more room than the quick one', () => {
    const plan = planBeforeAfter(genericArtifact, input)!;
    const scenes = beatsToScenes(plan);
    const hook = scenes[0]!;
    const held = scenes[plan.beats.findIndex((b) => b.emphasis === 'hold')]!;
    expect(held.weight).toBeGreaterThan(hook.weight);
    expect(held.minSeconds).toBeGreaterThan(hook.minSeconds);
  });
});

describe('stepDeservesEmphasis', () => {
  it('never emphasises a step the flow marked as a wait', () => {
    // Holding on a spinner is still a spinner.
    const plan = planBeforeAfter(genericArtifact, input)!;
    expect(stepDeservesEmphasis(plan, { name: 'wait for the swap', elide: true })).toBe(false);
  });

  it('emphasises the step the story is actually about', () => {
    const plan = planBeforeAfter(genericArtifact, input)!;
    expect(stepDeservesEmphasis(plan, { name: 'pick the other swap option' })).toBe(true);
    expect(stepDeservesEmphasis(plan, { name: 'dismiss the cookie banner' })).toBe(false);
  });
});

/**
 * §163. Which parts of a recording are worth watching.
 *
 * Live evidence, offsets copied from the real capture: the product does
 * something for about ten seconds, the adaptation wait sits in the middle, and
 * a drifted sibling flow then stalls for forty seconds on a selector that no
 * longer exists.
 */
describe('footageSpansFor', () => {
  const steps = [
    { step: 'open the converter', action: 'goto', ok: true, startMs: 0, endMs: 2337 },
    { step: 'switch to the Link tab', action: 'click', ok: true, startMs: 2422, endMs: 2472 },
    { step: 'choose gluten-free', action: 'click', ok: true, startMs: 2480, endMs: 2527 },
    { step: 'submit', action: 'click', ok: true, startMs: 2527, endMs: 2572 },
    { step: 'wait for the adaptation', action: 'waitFor', ok: true, startMs: 2574, endMs: 5859, elide: true },
    { step: 'let the result settle', action: 'wait', ok: true, startMs: 5859, endMs: 7061 },
    { step: 'still of the finished card', action: 'still', ok: true, startMs: 7061, endMs: 7167 },
    { step: 'expand a swapped ingredient', action: 'click', ok: true, startMs: 7167, endMs: 7209 },
    { step: 'hold on the reason', action: 'wait', ok: true, startMs: 7209, endMs: 9709 },
    { step: 'find the swap control', action: 'waitFor', ok: false, startMs: 9863, endMs: 49_863 },
  ];

  it('cuts the wait and keeps both sides of it', () => {
    /*
     * The reason spans are plural. The result card appears *during* the
     * adaptation wait, so one span either shows three seconds of a spinner or
     * cuts away before the result exists.
     */
    const spans = footageSpansFor(steps);
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(spans[0]!.steps).toContain('submit');
    expect(spans.flatMap((s) => s.steps)).toContain('expand a swapped ingredient');
    expect(spans.flatMap((s) => s.steps)).not.toContain('wait for the adaptation');
  });

  it('excludes the forty seconds a drifted flow spent failing', () => {
    const spans = footageSpansFor(steps);
    expect(spans.flatMap((s) => s.steps)).not.toContain('find the swap control');
    expect(Math.max(...spans.map((s) => s.endMs))).toBeLessThan(11_000);
  });

  it('filters by action rather than by step name', () => {
    /*
     * `let the result settle` reads nothing like a wait; its action is exactly
     * that. Names are prose an author chose, actions are the flow contract.
     */
    const spans = footageSpansFor(steps);
    expect(spans.flatMap((s) => s.steps)).not.toContain('still of the finished card');
  });

  it('holds the settle that follows an elided step, because that is the payoff', () => {
    /*
     * Found by cutting real footage: dropping every wait meant the adapted
     * result card was never on screen. It appears *during* the adaptation wait,
     * which is elided, and stays up through the settle after it. Cutting both
     * showed the setup and then a 400ms flash of an ingredient expanding.
     */
    const kept = footageSpansFor(steps).flatMap((s) => s.steps);
    expect(kept).toContain('let the result settle');
    // A wait that follows nothing cut is still dead air.
    expect(kept).not.toContain('hold on the reason');
  });

  it('keeps far less than the recording, which is the point', () => {
    const kept = footageDurationMs(footageSpansFor(steps));
    expect(kept).toBeLessThan(9_000);
    // …but enough to see anything at all.
    expect(kept).toBeGreaterThan(2_000);
  });

  it('is bounded by measured offsets, so the footage is what happened', () => {
    const spans = footageSpansFor(steps, { padMs: 0 });
    expect(spans[0]!.startMs).toBe(0);
    expect(spans[0]!.endMs).toBe(2572);
  });

  it('returns nothing when nothing worth showing was captured', () => {
    // Honest failure rather than a cut of dead air.
    expect(footageSpansFor([])).toEqual([]);
    expect(
      footageSpansFor([{ step: 'w', action: 'wait', ok: true, startMs: 0, endMs: 5000 }]),
    ).toEqual([]);
  });

  it('drops a span too short to perceive', () => {
    expect(
      footageSpansFor([{ step: 'blink', action: 'click', ok: true, startMs: 0, endMs: 35 }], {
        padMs: 0,
      }),
    ).toEqual([]);
  });
});
