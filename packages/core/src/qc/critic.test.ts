/**
 * §275. The critic, and what it is not allowed to do.
 *
 * It exists because every video used one caption treatment and nothing caught
 * it — no threshold crossed, no rule violated, every frame individually fine.
 * Most of what is asserted here is the limits on it, because an unreliable
 * critic is worse than none: it trains the reader to ignore the one signal that
 * can see this class of problem.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITIC_PERSONAS,
  CRITIC_QUESTIONS,
  criticSystemPrompt,
  parseCriticReply,
  type CriticFrame,
} from './critic.js';

const frames: CriticFrame[] = [
  { atSeconds: 0, describes: 'Bold headline on cream', visibleText: ['Your dusting flour'] },
  { atSeconds: 4.2, describes: 'Bold headline on cream', visibleText: ['Swap the flour'] },
  { atSeconds: 9.5, describes: 'Bold headline on cream', visibleText: ['Chill the dough'] },
];

describe('the creative critic', () => {
  it('keeps a finding that cites frames it was actually shown', () => {
    const v = parseCriticReply(
      {
        findings: [
          {
            rule: 'critic.uniform_treatment',
            message: 'Every frame sets its line at the same weight and size.',
            atSeconds: [0, 4.2, 9.5],
          },
        ],
      },
      frames,
    );
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]!.severity).toBe('warning');
  });

  it('discards a finding that cites no frames', () => {
    /* Unactionable and unarguable, like a claim with no source. */
    const v = parseCriticReply(
      { findings: [{ rule: 'critic.flat_emphasis', message: 'It feels monotonous.', atSeconds: [] }] },
      frames,
    );
    expect(v.findings).toHaveLength(0);
  });

  it('discards a finding citing a timestamp that does not exist', () => {
    /* It is describing a video it was not given. Dropped whole. */
    const v = parseCriticReply(
      {
        findings: [
          { rule: 'critic.weak_opening', message: 'The frame at 30s is blank.', atSeconds: [30] },
        ],
      },
      frames,
    );
    expect(v.findings).toHaveLength(0);
  });

  it('discards a rule it was never asked about', () => {
    /* The prompt and the parser must agree, or the critic invents its own job. */
    const v = parseCriticReply(
      { findings: [{ rule: 'critic.made_up', message: 'Something else entirely.', atSeconds: [0] }] },
      frames,
    );
    expect(v.findings).toHaveLength(0);
  });

  it('never returns anything but a warning', () => {
    /* A critic with a veto blocks good posts over taste. */
    const v = parseCriticReply(
      {
        findings: [
          { rule: 'critic.reads_automated', message: 'Reads as a filled template.', atSeconds: [0] },
        ],
      },
      frames,
    );
    expect(v.findings.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('returns nothing from a malformed reply rather than inventing one', () => {
    for (const bad of [null, undefined, {}, { findings: 'nope' }, { findings: [1, 2] }]) {
      expect(parseCriticReply(bad, frames).findings).toHaveLength(0);
    }
  });

  it('keeps one finding per rule, the one with the most evidence', () => {
    const v = parseCriticReply(
      {
        findings: [
          { rule: 'critic.uniform_treatment', message: 'Same weight throughout.', atSeconds: [0] },
          { rule: 'critic.uniform_treatment', message: 'Same weight on all three.', atSeconds: [0, 4.2, 9.5] },
        ],
      },
      frames,
    );
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]!.atSeconds).toHaveLength(3);
  });

  it('distinguishes "nothing found" from "nothing looked at"', () => {
    /*
     * The important one. A critic that ran on zero frames has not endorsed
     * anything, and its summary must not read like a pass.
     */
    const nothingSeen = parseCriticReply({ findings: [] }, []);
    const nothingFound = parseCriticReply({ findings: [] }, frames);
    expect(nothingSeen.examined).toBe(0);
    expect(nothingSeen.summary).toContain('No frames');
    expect(nothingFound.examined).toBe(3);
    expect(nothingFound.summary).toContain('nothing raised');
    expect(nothingSeen.summary).not.toEqual(nothingFound.summary);
  });

  it('rejects a message too short to act on', () => {
    const v = parseCriticReply(
      { findings: [{ rule: 'critic.flat_emphasis', message: 'bad', atSeconds: [0] }] },
      frames,
    );
    expect(v.findings).toHaveLength(0);
  });

  it('asks about the defect that prompted it', () => {
    /* The caption uniformity has to be one of the questions, or this is theatre. */
    expect(CRITIC_QUESTIONS.map((q) => q.rule)).toContain('critic.uniform_treatment');
    const prompt = criticSystemPrompt();
    expect(prompt).toContain('critic.uniform_treatment');
    expect(prompt).toContain('No frames, no finding');
    /* And it must not be invited to praise anything. */
    expect(prompt).toContain('Do not praise');
  });
});

describe('critic findings reach the scorecard', () => {
  it('routes each craft finding to the dimension an operator would act on', async () => {
    const { dimensionForRule } = await import('./creativeScore.js');
    /* The one that prompted all this is a brand-fit problem, not a visual one. */
    expect(dimensionForRule('critic.uniform_treatment')).toBe('brand_fit');
    expect(dimensionForRule('critic.reads_automated')).toBe('brand_fit');
    expect(dimensionForRule('critic.weak_opening')).toBe('hook');
    expect(dimensionForRule('critic.interchangeable_frames')).toBe('novelty');
    expect(dimensionForRule('critic.accidental_space')).toBe('visual_quality');
  });

  it('every question the critic can ask lands somewhere on the scorecard', async () => {
    /* A finding with no dimension is dropped silently, which would be the same
       failure as having no critic at all. */
    const { dimensionForRule } = await import('./creativeScore.js');
    for (const q of CRITIC_QUESTIONS) {
      expect(dimensionForRule(q.rule), q.rule).not.toBeNull();
    }
  });

  it('warns rather than fails the piece', async () => {
    const { scoreCreative } = await import('./creativeScore.js');
    const card = scoreCreative({
      findings: [
        { rule: 'critic.uniform_treatment', severity: 'warning', message: 'Same weight throughout.' },
      ],
    });
    expect(card.passed).toBe(true);
    expect(card.dimensions.find((d) => d.dimension === 'brand_fit')!.status).toBe('warn');
  });
});

/**
 * §275. The loop, end to end, with no model involved.
 *
 * The critic is only worth having if what it says reaches something that acts.
 * This walks a finding the whole way — gate → defect → policy → action — so a
 * future change that quietly disconnects any link fails here rather than in
 * production, where the symptom is "the critic runs and nothing ever changes".
 */
describe('a critic finding travels the whole loop', () => {
  it('becomes a defect the correction policy has an answer for', async () => {
    const { defectsFrom } = await import('../correction/defects.js');
    const { policyFor } = await import('../correction/policy.js');

    const verdict = parseCriticReply(
      {
        findings: [
          {
            rule: 'critic.weak_opening',
            message: 'The first frame carries no words at all.',
            atSeconds: [0],
          },
        ],
      },
      frames,
    );

    /* The gate shape review_media writes. */
    const gate = {
      gate: 'critic' as const,
      status: 'warning' as const,
      summary: verdict.summary,
      detail: { findings: verdict.findings },
      examined: verdict.examined,
    };

    const defects = defectsFrom([gate], policyFor);
    const found = defects.find((d) => d.rule === 'critic.weak_opening');
    expect(found, 'the critic gate produced no defect').toBeDefined();
    expect(found!.correctable).toBe(true);
    expect(found!.action).toBe('resequence_scenes');
  });

  it('every question maps to a policy entry, so none is raised into a void', async () => {
    const { policyFor } = await import('../correction/policy.js');
    for (const q of CRITIC_QUESTIONS) {
      const entry = policyFor(q.rule, 'critic');
      expect(entry, `${q.rule} has no correction policy`).toBeDefined();
      /* A rule falling through to a generic answer is the void this guards. */
      expect(entry.rootCause.length, q.rule).toBeGreaterThan(10);
    }
  });

  it('routes the judgement-only findings to escalation rather than a wrong fix', async () => {
    const { policyFor } = await import('../correction/policy.js');
    /*
     * `adjust_caption_treatment` raises contrast, not emphasis. Pointing
     * uniformity at it would spend an iteration on something unrelated and then
     * report the defect as corrected.
     */
    for (const rule of ['critic.uniform_treatment', 'critic.flat_emphasis', 'critic.reads_automated']) {
      expect(policyFor(rule, 'critic').correctable, rule).toBe(false);
      expect(policyFor(rule, 'critic').action, rule).toBe('escalate');
    }
  });

  it('a skipped critic produces no defects, because it judged nothing', async () => {
    const { defectsFrom } = await import('../correction/defects.js');
    const { policyFor } = await import('../correction/policy.js');
    const gate = {
      gate: 'critic' as const,
      status: 'skipped' as const,
      summary: 'The critic did not run.',
      detail: { findings: [] },
      examined: 0,
    };
    /* Not required, so a skip is an absence rather than a failure. */
    expect(defectsFrom([gate], policyFor)).toHaveLength(0);
  });
});

/**
 * §472. Three people looking, because they do not see the same failures.
 *
 * The critic was one persona — "a demanding art director" — which is the right
 * stance for typography and the wrong one for the two questions that decide
 * whether a post works: would anyone stop for this, and would somebody who
 * knows the subject wince.
 */
describe('who is doing the looking', () => {
  it('asks every question as somebody, and that somebody is defined', () => {
    for (const q of CRITIC_QUESTIONS) {
      expect(CRITIC_PERSONAS[q.persona], q.rule).toBeDefined();
    }
  });

  it('gives every persona something to look for', () => {
    for (const key of Object.keys(CRITIC_PERSONAS) as Array<keyof typeof CRITIC_PERSONAS>) {
      expect(CRITIC_QUESTIONS.filter((q) => q.persona === key).length, key).toBeGreaterThan(0);
    }
  });

  it('puts each stance in the prompt, named and separate', () => {
    const prompt = criticSystemPrompt();
    for (const persona of Object.values(CRITIC_PERSONAS)) {
      expect(prompt).toContain(persona.name);
      expect(prompt).toContain(persona.stance.slice(0, 40));
    }
    /* The value is the disagreement, so the prompt must not ask for a blend. */
    expect(prompt).toMatch(/do not average them/i);
  });

  it('asks the two questions craft cannot see', () => {
    const rules = CRITIC_QUESTIONS.map((q) => q.rule);
    expect(rules).toContain('critic.scrolls_past');
    expect(rules).toContain('critic.overstated');
  });

  /*
   * Derived from the rule, never taken from the reply: a model asked to label
   * its own findings will mislabel some, and the mapping is already known.
   */
  it('labels a finding with who objected, from the rule', () => {
    const verdict = parseCriticReply(
      {
        findings: [
          { rule: 'critic.scrolls_past', message: 'It is a card with words on it.', atSeconds: [0] },
          { rule: 'critic.uniform_treatment', message: 'Every line is set the same.', atSeconds: [0] },
        ],
      },
      [{ atSeconds: 0, describes: 'a card of type', visibleText: ['Yeast is not the sour part'] }],
    );
    expect(verdict.findings.map((f) => f.persona)).toEqual(['scroller', 'art_director']);
  });
});
