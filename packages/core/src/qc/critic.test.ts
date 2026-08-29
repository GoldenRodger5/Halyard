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
