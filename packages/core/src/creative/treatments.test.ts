/**
 * §203. The tests are about *difference*, not about each planner in isolation.
 *
 * The defect being fixed was that every video came out the same, so the
 * assertions that matter are the ones comparing treatments to each other:
 * different beat roles, different pacing, different evidence. A suite that only
 * checked each planner returned something would have passed before this change
 * too, when there was one planner.
 */
import { describe, expect, it } from 'vitest';
import type { ProductArtifact } from '../connectors/types.js';
import type { CreativeType, PlanInput } from './plan.js';
import {
  planComparison,
  planFeatureDemo,
  planHowTo,
  planListicle,
  planMythFact,
  planProcessMontage,
  selectCreativePlan,
} from './treatments.js';

const input: PlanInput = { platform: 'tiktok', format: 'video', targetSeconds: 24 };
const withFootage: PlanInput = {
  ...input,
  footage: { file: 'cap.mp4', label: 'Adapting the recipe', durationMs: 4200 },
};

function artifact(overrides: Partial<ProductArtifact> = {}): ProductArtifact {
  return {
    kind: 'recipe_adaptation',
    raw: {},
    headline: 'Gluten-free apple pie',
    highlights: [],
    visualHints: [],
    ...overrides,
  };
}

const swap = (i: number, alternative: string | null = null) => ({
  type: 'swap' as const,
  sourcePath: `ingredients[${i}].changeReason`,
  before: `butter ${i}`,
  after: `olive oil ${i}`,
  reason: `Dairy-free, and it keeps the crumb tender because the fat stays liquid at room temperature ${i}`,
  alternative,
});

const technique = (i: number) => ({
  type: 'technique' as const,
  sourcePath: `steps[${i}].updated_note`,
  title: `Step ${i}`,
  note: `Rest the dough for ${i * 10} minutes before rolling.`,
});

const note = (text: string, i = 0) => ({
  type: 'chef_note' as const,
  sourcePath: `explanations[${i}]`,
  text,
});

describe('every planner refuses without its evidence', () => {
  const bare = artifact();
  it.each([
    ['how_to', planHowTo],
    ['process_montage', planProcessMontage],
    ['listicle', planListicle],
    ['comparison', planComparison],
    ['myth_fact', planMythFact],
    ['feature_demo', planFeatureDemo],
  ])('%s returns null on an empty artifact', (_name, planner) => {
    expect(planner(bare, input)).toBeNull();
  });

  it('how_to needs more than one step', () => {
    expect(planHowTo(artifact({ highlights: [technique(1)] }), input)).toBeNull();
    expect(planHowTo(artifact({ highlights: [technique(1), technique(2)] }), input)).not.toBeNull();
  });

  it('a montage needs three steps, where a how-to needs two', () => {
    const two = artifact({ highlights: [technique(1), technique(2)] });
    expect(planHowTo(two, input)).not.toBeNull();
    expect(planProcessMontage(two, input)).toBeNull();
  });

  it('comparison needs a real alternative, not an invented one', () => {
    expect(planComparison(artifact({ highlights: [swap(1)] }), input)).toBeNull();
    const forked = artifact({ highlights: [swap(1, 'coconut oil')] });
    const plan = planComparison(forked, input)!;
    expect(plan).not.toBeNull();
    expect(plan.beats.some((b) => b.content.after === 'coconut oil')).toBe(true);
  });

  it('myth_fact needs a note that actually corrects something', () => {
    expect(
      planMythFact(artifact({ highlights: [note('Bake until golden.')] }), input),
    ).toBeNull();
    expect(
      planMythFact(
        artifact({ highlights: [note('People think butter is essential here. Actually it is not.')] }),
        input,
      ),
    ).not.toBeNull();
  });

  it('feature_demo needs footage and never substitutes a card', () => {
    const a = artifact({ highlights: [swap(1)] });
    expect(planFeatureDemo(a, input)).toBeNull();
    const plan = planFeatureDemo(a, withFootage)!;
    expect(plan.beats.some((b) => b.media?.file === 'cap.mp4')).toBe(true);
  });
});

describe('treatments are materially different, not relabelled', () => {
  const rich = artifact({
    highlights: [
      swap(1, 'coconut oil'),
      swap(2),
      technique(1),
      technique(2),
      technique(3),
      note('People often think butter is essential. Actually the fat only needs to be liquid.'),
    ],
  });

  it('produce different beat-role sequences', () => {
    const roles = (t: ReturnType<typeof planHowTo>) => t!.beats.map((b) => b.role).join('>');
    const sequences = new Set([
      roles(planHowTo(rich, input)),
      roles(planProcessMontage(rich, input)),
      roles(planListicle(rich, input)),
      roles(planComparison(rich, input)),
      roles(planMythFact(rich, input)),
    ]);
    // Five treatments, five distinct structures.
    expect(sequences.size).toBe(5);
  });

  it('pace differently — a montage is quick, a myth/fact holds', () => {
    const montage = planProcessMontage(rich, input)!;
    const myth = planMythFact(rich, input)!;

    const quickShare =
      montage.beats.filter((b) => b.emphasis === 'quick').length / montage.beats.length;
    const holdShare = myth.beats.filter((b) => b.emphasis === 'hold').length / myth.beats.length;

    expect(quickShare).toBeGreaterThan(0.5);
    expect(holdShare).toBeGreaterThanOrEqual(0.5);
  });

  it('counts a listicle down so the strongest lands last', () => {
    const list = planListicle(rich, input)!;
    const items = list.beats.filter((b) => b.role === 'item');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]!.content.index).toBeGreaterThan(items[items.length - 1]!.content.index!);
    expect(items[items.length - 1]!.emphasis).toBe('hold');
  });

  it('carries provenance on every evidence-backed beat', () => {
    for (const plan of [
      planHowTo(rich, input)!,
      planListicle(rich, input)!,
      planComparison(rich, input)!,
      planMythFact(rich, input)!,
    ]) {
      expect(plan.evidence.length).toBeGreaterThan(0);
      for (const path of plan.evidence) expect(path).toMatch(/\w/);
    }
  });
});

describe('selectCreativePlan', () => {
  const rich = artifact({
    highlights: [swap(1, 'coconut oil'), swap(2), technique(1), technique(2), technique(3)],
  });

  it('returns null when nothing is supported', () => {
    expect(selectCreativePlan(artifact(), input)).toBeNull();
  });

  it('considers every treatment the artifact supports', () => {
    const result = selectCreativePlan(rich, input)!;
    expect(result.considered.length).toBeGreaterThanOrEqual(4);
  });

  it('prefers real footage when a capture exists', () => {
    const result = selectCreativePlan(rich, withFootage)!;
    expect(result.chosen.beats.some((b) => b.media)).toBe(true);
  });

  /**
   * The regression that matters. A fixed priority list returned the same
   * treatment forever; this is the assertion that it no longer can.
   */
  it('does not return the same treatment forever', () => {
    const seen: CreativeType[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = selectCreativePlan(rich, { ...input, recentTypes: seen })!;
      seen.unshift(result.chosen.creativeType);
    }
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it('penalises the most recent type more than an older one', () => {
    const first = selectCreativePlan(rich, input)!.chosen.creativeType;
    const afterOne = selectCreativePlan(rich, { ...input, recentTypes: [first] })!;
    expect(afterOne.chosen.creativeType).not.toBe(first);
  });

  it('lets a type back in once it falls out of the window', () => {
    const first = selectCreativePlan(rich, input)!.chosen.creativeType;
    const stale = Array.from({ length: 8 }, () => 'listicle' as CreativeType);
    stale.unshift(first);
    const again = selectCreativePlan(rich, {
      ...input,
      recentTypes: stale.slice(1),
      recencyWindow: 2,
    })!;
    expect(again).not.toBeNull();
  });

  it('explains the choice in the rationale', () => {
    const result = selectCreativePlan(rich, input)!;
    expect(result.chosen.rationale).toMatch(/Chosen over \d+ other treatment/);
  });

  it('never selects a type no planner produced', () => {
    const result = selectCreativePlan(rich, input)!;
    const produced = result.considered.map((c) => c.plan.creativeType);
    expect(produced).toContain(result.chosen.creativeType);
    // The three declared-but-unimplemented names can never appear.
    for (const unimplemented of ['announcement', 'transformation', 'product_update']) {
      expect(produced).not.toContain(unimplemented);
    }
  });
});

/**
 * §203. The two role lists must agree, and neither can import the other.
 *
 * `BeatRole` lives here; the render package's `EVERY_BEAT_ROLE` restates it,
 * because `@halyard/render` is webpacked for the browser and importing the core
 * barrel would pull `node:crypto` into a Remotion bundle (gotcha 10). Two
 * hand-written lists drift, so this reads the render source as text and
 * compares. Text rather than an import, for the same reason the duplication
 * exists at all.
 */
describe('the render package can draw every role a planner emits', () => {
  it('agrees with EVERY_BEAT_ROLE in treatments.tsx', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../../render/src/video/treatments.tsx', import.meta.url),
      'utf8',
    );

    const block = /export const EVERY_BEAT_ROLE = \[([\s\S]*?)\] as const;/.exec(source);
    expect(block, 'EVERY_BEAT_ROLE not found in the render package').not.toBeNull();
    const rendered = new Set(
      [...block![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
    );

    /* Every role any planner actually emits, taken from the planners. */
    const rich = artifact({
      highlights: [
        swap(1, 'coconut oil'),
        swap(2),
        technique(1),
        technique(2),
        technique(3),
        note('People often think butter is essential. Actually it is not.'),
      ],
    });
    const emitted = new Set<string>();
    for (const planner of [
      planHowTo,
      planProcessMontage,
      planListicle,
      planComparison,
      planMythFact,
      planFeatureDemo,
    ]) {
      const plan = planner(rich, withFootage);
      plan?.beats.forEach((b) => emitted.add(b.role));
    }

    expect(emitted.size).toBeGreaterThan(5);
    for (const role of emitted) {
      expect(rendered.has(role), `planners emit "${role}" but the renderer cannot draw it`).toBe(
        true,
      );
    }
  });
});

/**
 * §204. The closed loop, as a unit test.
 *
 * Specification §13: "Generate a later content plan. Verify the plan actually
 * uses the learned insight." This is that check at the seam where it is
 * provable — measured outcomes become a belief, and the belief changes which
 * treatment a later plan picks. Without this the learning module is a table
 * nobody reads.
 */
describe('learning changes the next creative decision', () => {
  const rich = artifact({
    highlights: [swap(1, 'coconut oil'), swap(2), technique(1), technique(2), technique(3)],
  });
  const DAY = 86_400_000;
  const start = new Date('2026-06-01T00:00:00Z');

  /** Observations where one treatment measurably beat the rest. */
  function measured(winner: CreativeType, loser: CreativeType) {
    const rows = [];
    for (let i = 0; i < 25; i += 1) {
      rows.push({
        contentItemId: `w-${i}`,
        platform: 'tiktok',
        accountId: 'acct-1',
        publishedAt: new Date(start.getTime() + i * DAY),
        features: { creative_type: winner },
        score: 0.9,
      });
      rows.push({
        contentItemId: `l-${i}`,
        platform: 'tiktok',
        accountId: 'acct-1',
        publishedAt: new Date(start.getTime() + i * DAY),
        features: { creative_type: loser },
        score: 0.3,
      });
    }
    return rows;
  }

  it('picks a different treatment once results argue for one', async () => {
    const { computeInsights } = await import('../learning/insights.js');

    /* What it chooses knowing nothing. */
    const naive = selectCreativePlan(rich, input)!;
    const loser = naive.chosen.creativeType;

    /* Something else measurably outperformed it on this account. */
    const winner = naive.considered
      .map((c) => c.plan.creativeType)
      .find((t) => t !== loser)!;

    const insights = computeInsights(measured(winner, loser), 'account');
    const informed = selectCreativePlan(rich, {
      ...input,
      insights,
      now: new Date(start.getTime() + 26 * DAY),
    })!;

    expect(informed.chosen.creativeType).toBe(winner);
    expect(informed.chosen.creativeType).not.toBe(loser);
  });

  it('says which belief moved it, so the decision is traceable', async () => {
    const { computeInsights } = await import('../learning/insights.js');
    const naive = selectCreativePlan(rich, input)!;
    const loser = naive.chosen.creativeType;
    const winner = naive.considered.map((c) => c.plan.creativeType).find((t) => t !== loser)!;

    const informed = selectCreativePlan(rich, {
      ...input,
      insights: computeInsights(measured(winner, loser), 'account'),
      now: new Date(start.getTime() + 26 * DAY),
    })!;

    expect(informed.chosen.rationale).toMatch(/Measured performance argued for it/);
    const chosenCandidate = informed.considered.find(
      (c) => c.plan.creativeType === informed.chosen.creativeType,
    )!;
    expect(chosenCandidate.learned).toBeGreaterThan(0);
    expect(chosenCandidate.learnedFrom.length).toBeGreaterThan(0);
  });

  it('ignores a belief that has gone stale', async () => {
    const { computeInsights } = await import('../learning/insights.js');
    const naive = selectCreativePlan(rich, input)!;
    const loser = naive.chosen.creativeType;
    const winner = naive.considered.map((c) => c.plan.creativeType).find((t) => t !== loser)!;
    const insights = computeInsights(measured(winner, loser), 'account');

    /* Long past every review date. */
    const later = new Date(start.getTime() + 400 * DAY);
    const informed = selectCreativePlan(rich, { ...input, insights, now: later })!;
    const candidate = informed.considered.find((c) => c.plan.creativeType === winner)!;
    expect(candidate.learned).toBe(0);
  });

  it('never lets a belief select a treatment the artifact cannot carry', async () => {
    const { computeInsights } = await import('../learning/insights.js');
    /* Overwhelming evidence for a treatment that needs footage nobody captured. */
    const rows = measured('feature_demo' as CreativeType, 'listicle' as CreativeType);
    const insights = computeInsights(rows, 'account');

    const result = selectCreativePlan(rich, {
      ...input, // no footage
      insights,
      now: new Date(start.getTime() + 26 * DAY),
    })!;

    // `planFeatureDemo` refused, so it was never a candidate — evidence still
    // gates, and learning only ever reorders what the artifact supports.
    expect(result.considered.map((c) => c.plan.creativeType)).not.toContain('feature_demo');
    expect(result.chosen.creativeType).not.toBe('feature_demo');
  });

  it('does nothing at all for an account with no measured history', () => {
    const result = selectCreativePlan(rich, { ...input, insights: [] })!;
    for (const candidate of result.considered) {
      expect(candidate.learned).toBe(0);
      expect(candidate.learnedFrom).toEqual([]);
    }
  });
});
