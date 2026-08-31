/**
 * §403. The floor must refuse a repeat and must never refuse an unmeasured one.
 *
 * Both halves matter. Without the first, "it keeps posting about gluten" is
 * unfixed — novelty is one of six weighted terms, so an all-repeats batch still
 * elects its best repeat. Without the second, the day the embedding call fails
 * every idea scores unmeasured and the whole queue would starve on a guard that
 * had measured nothing.
 */
import { describe, expect, it } from 'vitest';
import { selectIdeas, NOVELTY_FLOOR, type IdeaCandidate, type MixState } from './ideaEngine.js';

const mix: MixState = {
  targets: { education: 0.4, product: 0.2, community: 0.2, transformation: 0.2 },
  actual: { education: 0.4, product: 0.2, community: 0.2, transformation: 0.2 },
  postsPerCategory: { education: 4, product: 2, community: 2, transformation: 2 },
  productShare14d: 0.2,
};

/** A unit vector pointing along `axis`, so distance between axes is exactly 1. */
function vec(axis: number, dims = 8): number[] {
  return Array.from({ length: dims }, (_, i) => (i === axis ? 1 : 0));
}

function candidate(over: Partial<IdeaCandidate> = {}): IdeaCandidate {
  return {
    id: 'i1',
    title: 'An idea',
    angle: 'an angle',
    category: 'education',
    availableTemplates: ['t1'],
    ...over,
  } as IdeaCandidate;
}

describe('the novelty floor', () => {
  it('refuses an idea measured as a repeat of one already used', () => {
    const { selected, rejected } = selectIdeas([candidate({ embedding: vec(0) })], mix, {
      recentEmbeddings: [vec(0)],
    });
    expect(selected).toHaveLength(0);
    expect(rejected[0]!.blockedReason).toMatch(/last 60 days/);
  });

  it('does not refuse an idea that is merely near an old one', () => {
    /* Cosine distance 0.25 — above the floor, below full novelty. */
    const near = [Math.cos(Math.acos(0.75)), Math.sin(Math.acos(0.75)), 0, 0, 0, 0, 0, 0];
    const { selected } = selectIdeas([candidate({ embedding: near })], mix, {
      recentEmbeddings: [vec(0)],
    });
    expect(selected).toHaveLength(1);
  });

  it('never refuses an idea whose novelty was not measured', () => {
    /*
     * The failure mode this guard could itself become: no embedding, so
     * novelty is the unmeasured neutral. Refusing here would empty the queue
     * on any embedding outage.
     */
    const { selected, rejected } = selectIdeas([candidate({ embedding: undefined })], mix, {
      recentEmbeddings: [vec(0)],
    });
    expect(selected).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('never refuses when there is no history to be a repeat of', () => {
    const { selected } = selectIdeas([candidate({ embedding: vec(0) })], mix, {
      recentEmbeddings: [],
    });
    expect(selected).toHaveLength(1);
  });

  it('lets a novel idea through a batch whose repeats are refused', () => {
    const { selected } = selectIdeas(
      [
        candidate({ id: 'repeat', title: 'Said before', embedding: vec(0) }),
        candidate({ id: 'fresh', title: 'Not said before', embedding: vec(3) }),
      ],
      mix,
      { recentEmbeddings: [vec(0)], limit: 4 },
    );
    expect(selected.map((s) => s.id)).toEqual(['fresh']);
  });

  it("never refuses what the operator typed in themselves", () => {
    /*
     * The floor's own failure mode, found live: briefing a subject a second
     * time reported success and produced nothing. An operator asking again has
     * said they want it again — which is the only thing the floor is not
     * entitled to overrule.
     */
    const { selected, rejected } = selectIdeas(
      [candidate({ embedding: vec(0), briefed: true })],
      mix,
      { recentEmbeddings: [vec(0)] },
    );
    expect(selected).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('still applies every other guard to a brief', () => {
    /* Exempt from novelty, not from being unrenderable. */
    const { selected, rejected } = selectIdeas(
      [candidate({ embedding: vec(0), briefed: true, availableTemplates: [] })],
      mix,
      { recentEmbeddings: [vec(0)] },
    );
    expect(selected).toHaveLength(0);
    expect(rejected[0]!.blockedReason).toMatch(/template/i);
  });

  it('marks a novelty refusal permanent and every other refusal temporary', () => {
    /*
     * Found live: a novelty-refused idea stayed `proposed`, was re-refused on
     * every run forever, and one of them was enough to make every subsequent
     * run produce nothing. Novelty loses to history and history only grows, so
     * that refusal can never come untrue. A daily limit can, tomorrow.
     */
    const { rejected } = selectIdeas(
      [
        /* Alone in its category, so only the novelty floor can refuse it. */
        candidate({ id: 'stale', category: 'education', embedding: vec(0) }),
        /* Two in one category: the loser is refused for today only. */
        candidate({ id: 'community1', category: 'community', embedding: vec(1) }),
        candidate({ id: 'community2', category: 'community', embedding: vec(2) }),
      ],
      mix,
      { recentEmbeddings: [vec(0)], limit: 4 },
    );
    const byId = new Map(rejected.map((r) => [r.id, r]));
    expect(byId.get('stale')!.blockedReason).toMatch(/last 60 days/);
    expect(byId.get('stale')!.blockedPermanently).toBe(true);
    /* Refused only because another education idea won today — it competes again. */
    const temporary = byId.get('community1') ?? byId.get('community2')!;
    expect(temporary.blockedReason).toMatch(/already selected today/);
    expect(temporary.blockedPermanently).toBeFalsy();
  });

  it('keeps the floor below a paraphrase and above a restatement', () => {
    /* Measured against real embeddings; see the constant's own comment. */
    expect(NOVELTY_FLOOR).toBeGreaterThan(0.06);
    expect(NOVELTY_FLOOR).toBeLessThan(0.45);
  });
});
