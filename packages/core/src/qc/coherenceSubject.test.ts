/**
 * §409. The critic could not see the two things that were actually wrong.
 *
 * `visual_slop.entirely_static` has existed since this gate did and has never
 * fired once. It required every frame description to be byte-identical, and a
 * description is a sentence about a frame with words burned into it — six
 * frames of one photograph carrying six different overlays are six different
 * sentences. The rule that exists to catch "a still image with audio over it"
 * could not catch it on any video Halyard has made.
 *
 * And nothing asked whether the picture was of what the piece asked for. §406
 * rendered a `history` piece about sourdough from the artifact's beats, so the
 * frames were a tofu dish over a voiceover about ancient Egypt. The gate
 * reported "coherent, 2 notes".
 *
 * These assert the shape of both: a check that cannot fire, and a mismatch
 * nobody was looking for.
 */
import { describe, expect, it } from 'vitest';
import { runCoherenceQC, type CoherenceInput, type FrameObservation } from './coherence.js';

function frame(at: number, subject: string | null, text: string[] = []): FrameObservation {
  return {
    atSeconds: at,
    /* Deliberately different sentences: this is what defeated the old rule. */
    describes: `A photograph, with ${text.join(' ') || 'no'} text over it at ${at} seconds.`,
    visibleText: text,
    subject,
  };
}

function input(over: Partial<CoherenceInput> = {}): CoherenceInput {
  return {
    intent: {
      body: 'Sourdough may have originated in ancient Egypt.',
      script: 'Sourdough may have originated in ancient Egypt. Wild yeasts did the work.',
      keyTerms: ['sourdough'],
      format: 'video',
      durationSeconds: 20,
      ...over.intent,
    },
    frames: over.frames ?? [],
    audio: over.audio ?? {
      transcript: 'Sourdough may have originated in ancient Egypt.',
      openingSentence: 'Sourdough may have originated in ancient Egypt.',
    },
  };
}

const rules = (r: ReturnType<typeof runCoherenceQC>) => r.findings.map((f) => f.rule);

describe('one photograph held for the whole video', () => {
  it('is caught even though every description differs', () => {
    const result = runCoherenceQC(
      input({
        frames: [
          frame(0, 'a sourdough loaf', ['Sourdough was probably a mistake']),
          frame(5, 'a sourdough loaf', ['Picture yeast as something bakers add']),
          frame(10, 'a sourdough loaf', ['Left out, Egyptian dough caught wild yeasts']),
          frame(15, 'a sourdough loaf', ['So substitutions change timing']),
        ],
      }),
    );
    expect(rules(result)).toContain('visual_slop.entirely_static');
    expect(result.passed).toBe(false);
  });

  it('flags two pictures across a whole video as thin, without failing it', () => {
    const result = runCoherenceQC(
      input({
        frames: [
          frame(0, 'a sourdough loaf', ['one']),
          frame(5, 'a sourdough loaf', ['two']),
          frame(10, 'a glass jar of starter', ['three']),
          frame(15, 'a glass jar of starter', ['four']),
        ],
      }),
    );
    expect(rules(result)).toContain('visual_slop.thin_variety');
    expect(rules(result)).not.toContain('visual_slop.entirely_static');
  });

  it('says nothing about a piece that changes picture every beat', () => {
    const result = runCoherenceQC(
      input({
        frames: [
          frame(0, 'a sourdough loaf', ['one']),
          frame(5, 'a bowl of starter', ['two']),
          frame(10, 'a glass jar', ['three']),
          frame(15, 'a slice of crumb', ['four']),
        ],
      }),
    );
    expect(rules(result)).not.toContain('visual_slop.entirely_static');
    expect(rules(result)).not.toContain('visual_slop.thin_variety');
  });

  it('does not claim a piece is static when nothing named the subjects', () => {
    /*
     * Frames described before §409 carry no subject. Unmeasured is not the
     * same as identical, and reading it as identical would fail every old
     * piece for a defect nobody looked for.
     */
    const result = runCoherenceQC(
      input({ frames: [frame(0, null, ['a']), frame(5, null, ['b']), frame(10, null, ['c'])] }),
    );
    expect(rules(result)).not.toContain('visual_slop.entirely_static');
  });
});

describe('pictures of something else entirely', () => {
  const sourdoughFrames = [
    frame(0, 'a plate of baked tofu', ['Pressed tofu is not optional']),
    frame(5, 'a plate of baked tofu', ['2 lbs extra-firm tofu']),
    frame(10, 'a bowl of teriyaki sauce', ['Tradeoff']),
  ];

  it('catches frames that show nothing the piece asked to photograph', () => {
    const result = runCoherenceQC(
      input({
        intent: {
          body: 'Sourdough may have originated in ancient Egypt.',
          keyTerms: ['sourdough'],
          format: 'video',
          expectedSubjects: ['a rustic sourdough loaf', 'bubbling sourdough starter'],
        },
        frames: sourdoughFrames,
      }),
    );
    expect(rules(result)).toContain('coherence.pictures_are_of_something_else');
    expect(result.passed).toBe(false);
  });

  it('accepts a picture that illustrates rather than restates', () => {
    /*
     * A piece about gluten photographed as a loaf of bread is the job done
     * right. Comparing depicted subject to the *script* would call that a
     * mismatch, which is why the comparison is against what was requested.
     */
    const result = runCoherenceQC(
      input({
        intent: {
          body: 'How well do you know gluten?',
          keyTerms: ['gluten'],
          format: 'video',
          expectedSubjects: ['a rustic sourdough loaf', 'a bowl of flour'],
        },
        frames: [
          frame(0, 'a rustic sourdough loaf', ['one']),
          frame(5, 'a bowl of flour', ['two']),
          frame(10, 'a sourdough loaf on marble', ['three']),
        ],
      }),
    );
    expect(rules(result)).not.toContain('coherence.pictures_are_of_something_else');
  });

  it('tolerates one frame the describer named differently', () => {
    /* An image model given "a bowl of starter" may return what reads as a jar. */
    const result = runCoherenceQC(
      input({
        intent: {
          body: 'Sourdough',
          keyTerms: ['sourdough'],
          format: 'video',
          expectedSubjects: ['a sourdough loaf', 'a bowl of starter'],
        },
        frames: [
          frame(0, 'a sourdough loaf', ['one']),
          frame(5, 'a glass vessel', ['two']),
          frame(10, 'a bowl of starter', ['three']),
        ],
      }),
    );
    expect(rules(result)).not.toContain('coherence.pictures_are_of_something_else');
  });

  it('reports itself unmeasured when nothing recorded what was asked for', () => {
    const result = runCoherenceQC(input({ frames: sourdoughFrames }));
    expect(rules(result)).toContain('coherence.expected_subjects_not_recorded');
    /* Unmeasured is a warning, never a pass and never a failure. */
    const finding = result.findings.find((f) => f.rule === 'coherence.expected_subjects_not_recorded');
    expect(finding!.severity).toBe('warning');
  });
});
