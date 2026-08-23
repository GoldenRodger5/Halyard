/**
 * The coherence gate.
 *
 * These are the tests that matter most in the whole QC suite, because this is
 * the gate with a model behind it. Every assertion below is about the
 * *deterministic* half — given these observations and this intent, this verdict
 * — which is exactly the part that must not depend on a model's preferences.
 *
 * No network, no model, no clock.
 */
import { describe, expect, it } from 'vitest';
import {
  HOOK_WINDOW_SECONDS,
  runCoherenceQC,
  termAppearsIn,
  type CoherenceInput,
  type FrameObservation,
} from './coherence.js';
import { runAllGates } from './index.js';

const frame = (over: Partial<FrameObservation> = {}): FrameObservation => ({
  atSeconds: 0,
  describes: 'A dense gluten-free loaf sliced open on a wooden board.',
  visibleText: ['GLUTEN-FREE'],
  ...over,
});

const input = (over: Partial<CoherenceInput> = {}): CoherenceInput => ({
  intent: {
    body: 'Your gluten-free loaf is gummy. Starch holds water wheat would have released.',
    script: null,
    keyTerms: ['gluten-free', 'loaf'],
    format: 'video',
    durationSeconds: 26,
  },
  frames: [frame(), frame({ atSeconds: 1.5, describes: 'A close-up of the wet crumb.' })],
  ...over,
});

describe('termAppearsIn', () => {
  it('needs every content word, so one word does not carry a phrase', () => {
    // "bread" alone must not match "gluten-free bread", or any loaf counts.
    expect(termAppearsIn('gluten-free bread', 'a photograph of bread')).toBe(false);
    expect(termAppearsIn('gluten-free bread', 'gluten free bread on a board')).toBe(true);
  });

  it('matches a hyphenated term however it is written', () => {
    for (const written of ['gluten-free loaf', 'gluten free loaf', 'GLUTENFREE LOAF']) {
      expect(termAppearsIn('gluten-free', written), written).toBe(true);
    }
  });

  it('respects word boundaries, so a substring is not a match', () => {
    expect(termAppearsIn('oat', 'a coat on a hook')).toBe(false);
    expect(termAppearsIn('oat', 'oat milk')).toBe(true);
  });

  it('ignores stopwords and punctuation', () => {
    expect(termAppearsIn('the loaf', 'A LOAF, sliced.')).toBe(true);
  });

  it('does not match an empty or stopword-only term', () => {
    expect(termAppearsIn('', 'anything')).toBe(false);
    expect(termAppearsIn('the a of', 'anything')).toBe(false);
  });
});

describe('runCoherenceQC — the measurement itself', () => {
  it('reports not-measured when no frame was observed, and fails', () => {
    // The rule the whole QC suite follows: examining nothing and finding
    // nothing wrong is not the same as examining something and finding it good.
    const result = runCoherenceQC(input({ frames: [] }));
    expect(result.examined).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.findings[0]!.rule).toBe('coherence.not_measured');
  });

  it('passes a video that shows what the post is about', () => {
    const result = runCoherenceQC(input());
    expect(result.passed).toBe(true);
    expect(result.shownTerms).toContain('gluten-free');
    expect(result.examined).toBe(2);
  });
});

describe('runCoherenceQC — the failure it exists to catch', () => {
  it('fails a video whose footage has nothing to do with the post', () => {
    // The whole reason for this gate. Every other gate passes here: the copy is
    // clean, the claims trace, the contrast is fine, the audio matches its
    // script. And the video is of the wrong thing.
    const result = runCoherenceQC(
      input({
        frames: [
          frame({ describes: 'A city skyline at dusk.', visibleText: [] }),
          frame({ atSeconds: 1.5, describes: 'Traffic moving on a bridge.', visibleText: [] }),
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.nothing_claimed_is_shown');
    expect(result.missingTerms).toEqual(['gluten-free', 'loaf']);
  });

  it('names what the footage showed instead, so the failure is actionable', () => {
    const result = runCoherenceQC(
      input({ frames: [frame({ describes: 'A city skyline at dusk.', visibleText: [] })] }),
    );
    expect(result.findings[0]!.message).toContain('city skyline');
  });

  it('fails narration that describes something no frame shows', () => {
    const result = runCoherenceQC(
      input({
        intent: {
          ...input().intent,
          script: 'Watch the crumb collapse when the xanthan gum goes in.',
          keyTerms: ['xanthan gum'],
        },
        frames: [frame({ describes: 'A sliced loaf.', visibleText: [] })],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.narration_shows_nothing');
  });

  it('warns rather than fails when only some of the subject is shown', () => {
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, keyTerms: ['gluten-free', 'oven thermometer'] },
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.partly_shown');
    expect(result.missingTerms).toEqual(['oven thermometer']);
  });
});

describe('runCoherenceQC — the hook, which is where the audience is won', () => {
  it('fails short-form with no burned-in text in the opening', () => {
    // Most first views are muted. Without an overlay the opening reaches nobody
    // who has not turned sound on.
    const result = runCoherenceQC(
      input({
        frames: [
          frame({ visibleText: [] }),
          frame({ atSeconds: 1.5, describes: 'A close-up of the wet crumb.', visibleText: [] }),
        ],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.no_text_in_hook');
  });

  it('only warns about missing text outside short form, where sound is likelier', () => {
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, format: 'image' },
        frames: [frame({ visibleText: [] })],
      }),
    );
    const finding = result.findings.find((f) => f.rule === 'coherence.no_text_in_hook');
    expect(finding?.severity).toBe('warning');
  });

  it('warns when nothing changes in the opening', () => {
    const held = 'A title card reading RecipeFix.';
    const result = runCoherenceQC(
      input({
        frames: [
          frame({ atSeconds: 0, describes: held }),
          frame({ atSeconds: 1.2, describes: held }),
        ],
      }),
    );
    expect(result.findings.map((f) => f.rule)).toContain('coherence.static_open');
  });

  it('does not call a changing open static', () => {
    const result = runCoherenceQC(input());
    expect(result.findings.map((f) => f.rule)).not.toContain('coherence.static_open');
  });

  it('fails an opening a muted viewer learns nothing from', () => {
    const result = runCoherenceQC(
      input({
        frames: [
          frame({ atSeconds: 0, describes: 'An out-of-focus kitchen.', visibleText: [] }),
          frame({ atSeconds: 2, describes: 'A hand reaching for something.', visibleText: [] }),
          frame({ atSeconds: 8, describes: 'A gluten-free loaf, sliced.', visibleText: [] }),
        ],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.silent_open_says_nothing');
  });

  it('only looks inside the hook window', () => {
    // A frame at 8s is not part of the hook, and must not rescue it.
    const late = runCoherenceQC(
      input({
        frames: [
          frame({ atSeconds: 0, describes: 'An empty worktop.', visibleText: [] }),
          frame({ atSeconds: HOOK_WINDOW_SECONDS + 5, describes: 'A gluten-free loaf.', visibleText: ['GF'] }),
        ],
      }),
    );
    expect(late.findings.map((f) => f.rule)).toContain('coherence.no_text_in_hook');
  });
});

describe('runCoherenceQC — a logo is not a hook', () => {
  it('fails an opening whose only text is the brand name', () => {
    // Found by running the gate against a real render. At 0.0s the only text on
    // screen was "RECIPEFIX", and the silent-first check counted it as an
    // overlay and stayed quiet — passing exactly the opening it exists to catch.
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, brandTerms: ['RecipeFix'] },
        frames: [
          frame({ atSeconds: 0, describes: 'A mostly blank background.', visibleText: ['RECIPEFIX'] }),
          frame({ atSeconds: 1.5, describes: 'A sliced gluten-free loaf.', visibleText: ['RECIPEFIX'] }),
        ],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('coherence.brandmark_only_open');
  });

  it('accepts a real overlay that happens to sit beside the wordmark', () => {
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, brandTerms: ['RecipeFix'] },
        frames: [
          frame({ atSeconds: 0, visibleText: ['RECIPEFIX', 'bread flour'] }),
          frame({ atSeconds: 1.5, describes: 'A close-up of wet crumb.', visibleText: ['swapped for gluten-free blend'] }),
        ],
      }),
    );
    expect(result.findings.map((f) => f.rule)).not.toContain('coherence.brandmark_only_open');
    expect(result.findings.map((f) => f.rule)).not.toContain('coherence.no_text_in_hook');
  });

  it('reports one rule, not two, for a brand-only opening', () => {
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, brandTerms: ['RecipeFix'] },
        frames: [frame({ atSeconds: 0, visibleText: ['RECIPEFIX'] })],
      }),
    );
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('coherence.brandmark_only_open');
    expect(rules).not.toContain('coherence.no_text_in_hook');
  });

  it('still catches a genuinely textless opening', () => {
    const result = runCoherenceQC(
      input({
        intent: { ...input().intent, brandTerms: ['RecipeFix'] },
        frames: [frame({ atSeconds: 0, visibleText: [] })],
      }),
    );
    expect(result.findings.map((f) => f.rule)).toContain('coherence.no_text_in_hook');
  });
});

describe('runCoherenceQC — the spoken opening', () => {
  it('warns when the first line names none of the subject', () => {
    const result = runCoherenceQC(
      input({
        audio: {
          transcript: 'So anyway. Your gluten-free loaf is gummy.',
          openingSentence: 'So anyway.',
        },
      }),
    );
    expect(result.findings.map((f) => f.rule)).toContain('coherence.opening_line_buries_it');
  });

  it('says nothing when the opening line leads with the subject', () => {
    const result = runCoherenceQC(
      input({
        audio: {
          transcript: 'Your gluten-free loaf is gummy.',
          openingSentence: 'Your gluten-free loaf is gummy.',
        },
      }),
    );
    expect(result.findings.map((f) => f.rule)).not.toContain('coherence.opening_line_buries_it');
  });
});

describe('the gate registry', () => {
  const copy = {
    body: 'Your gluten-free loaf is gummy. Starch holds water wheat would have released.',
    platform: 'x' as const,
    hashtags: [],
  };

  /**
   * These used to run through `runAllGates`, which accepted a `coherence`
   * input that no production caller could supply — the aggregate runs at copy
   * time, before anything is rendered. §119 removed the input; the measurement
   * is unchanged and is asserted here, against the function `review_media`
   * actually calls.
   */
  it('reports nothing examined when frames could not be sampled, rather than passing', () => {
    const result = runCoherenceQC(input({ frames: [] }));
    expect(result.examined).toBe(0);
  });

  it('fails when the footage contradicts the post', () => {
    const result = runCoherenceQC(
      input({ frames: [frame({ describes: 'A city skyline at dusk.', visibleText: [] })] }),
    );
    expect(result.passed).toBe(false);
  });

  it('passes a coherent render', () => {
    const result = runCoherenceQC(input());
    expect(result.passed).toBe(true);
    expect(result.examined).toBeGreaterThan(0);
  });

  it('the aggregate leaves the slot unexamined for review_media to fill', () => {
    // Copy time cannot see media, so this is the only honest answer here — and
    // `skipped` never contributes to a pass unless a caller says it may.
    const result = runAllGates({ copy });
    const gate = result.gates.find((g) => g.gate === 'coherence')!;
    expect(gate.status).toBe('skipped');
    expect(gate.examined).toBe(0);
  });
});

describe('visual slop', () => {
  /**
   * Distinct from coherence. These do not ask whether the video is about the
   * right thing — they ask whether it looks like a person made it. A video can
   * be perfectly on-topic and still be a static card with a wall of text on it,
   * which is the clearest signature of generated content.
   */
  const intent = {
    body: 'Swap the flour and the crumb changes.',
    keyTerms: ['flour'],
    format: 'video',
    durationSeconds: 20,
  };

  const frame = (atSeconds: number, describes: string, visibleText: string[] = ['flour']) => ({
    atSeconds,
    describes,
    visibleText,
  });

  it('catches a video that never moves, which the hook check cannot', () => {
    /**
     * `static_open` only compares the first two frames, so a video that holds
     * one card for its entire length passes it — the opening is as static as
     * everything else, and the rule fires once as a warning at most.
     */
    const result = runCoherenceQC({
      intent,
      frames: [
        frame(0, 'A flour substitution card'),
        frame(1, 'A flour substitution card'),
        frame(2, 'A flour substitution card'),
        frame(10, 'A flour substitution card'),
      ],
    });

    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('visual_slop.entirely_static');
    // An error, not a note: this is a still image with audio over it.
    expect(result.passed).toBe(false);
  });

  it('does not fire on a video that actually cuts', () => {
    const result = runCoherenceQC({
      intent,
      frames: [
        frame(0, 'A bag of flour on a counter'),
        frame(1, 'A close-up of the crumb'),
        frame(2, 'A flour substitution card'),
        frame(10, 'A finished loaf'),
      ],
    });
    expect(result.findings.map((f) => f.rule)).not.toContain('visual_slop.entirely_static');
  });

  it('flags a wall of text nobody can read in a beat', () => {
    const wall = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const result = runCoherenceQC({
      intent,
      frames: [
        frame(0, 'A card of dense text', wall),
        frame(1, 'A bag of flour'),
        frame(2, 'The crumb'),
      ],
    });
    expect(result.findings.map((f) => f.rule)).toContain('visual_slop.text_wall');
  });

  it('reports the text wall once rather than once per frame', () => {
    const wall = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const result = runCoherenceQC({
      intent,
      frames: [
        frame(0, 'Dense text', wall),
        frame(1, 'Different dense text', wall),
        frame(2, 'More dense text', wall),
      ],
    });
    expect(result.findings.filter((f) => f.rule === 'visual_slop.text_wall')).toHaveLength(1);
  });

  it('notices when the on-screen text never changes', () => {
    const result = runCoherenceQC({
      intent,
      frames: [
        frame(0, 'A bag of flour', ['flour', 'swap']),
        frame(1, 'A close-up of crumb', ['flour', 'swap']),
        frame(2, 'A finished loaf', ['flour', 'swap']),
      ],
    });
    expect(result.findings.map((f) => f.rule)).toContain('visual_slop.text_never_changes');
  });

  it('needs at least three frames before calling anything static', () => {
    // Two frames is the hook check's territory, and too little to conclude the
    // whole video never moves.
    const result = runCoherenceQC({
      intent,
      frames: [frame(0, 'A flour card'), frame(1, 'A flour card')],
    });
    expect(result.findings.map((f) => f.rule)).not.toContain('visual_slop.entirely_static');
  });
});
