/**
 * Audio provenance, checked at the last possible moment. §244.
 *
 * ## The hole this closes
 *
 * §241 made a fixture library safe by giving every bed a `provenance` and
 * refusing anything but `licensed_production` for a post. §242 then set
 * `forPublication: false` in the TTS handler — correctly, because that mix is
 * produced long before anybody approves anything — and left a comment saying
 * "the publish path re-checks provenance against what actually got mixed".
 *
 * That check did not exist. Which means a fixture mixed at draft time would
 * have travelled all the way to a real post, and the whole provenance
 * apparatus would have been decoration.
 *
 * This is the check. It runs against what was **actually used**, recorded in
 * `music_usage` and `content_items.qc_results.audio`, not against what the
 * selector would choose if asked again — because the file that exists is the
 * one that matters, and re-deriving the answer could easily produce a
 * different one.
 */

export interface AudioProvenanceInput {
  /** Provenance of every bed actually mixed into this item's audio. */
  musicProvenance: Array<{ title: string; provenance: string }>;
  /** Provenance of every effect actually mixed in. */
  sfxProvenance: Array<{ title: string; provenance: string }>;
}

export interface AudioProvenanceVerdict {
  publishable: boolean;
  /** Everything that would have to change, named. */
  problems: string[];
}

/**
 * May this item's audio be published?
 *
 * Silence is publishable — narration alone is a normal short-form style, and
 * an item with no music at all has nothing to be unlicensed about. What is not
 * publishable is audio containing something whose licence has not been
 * established.
 */
export function audioIsPublishable(input: AudioProvenanceInput): AudioProvenanceVerdict {
  const problems: string[] = [];

  for (const bed of input.musicProvenance) {
    if (bed.provenance === 'licensed_production') continue;
    problems.push(
      bed.provenance === 'test'
        ? `The mix contains "${bed.title}", a test fixture. Re-run the audio with a licensed bed, or publish it silent.`
        : `The mix contains "${bed.title}", whose licence has not been verified. Record the proof and mark it licensed_production, or re-run the audio.`,
    );
  }

  for (const effect of input.sfxProvenance) {
    if (effect.provenance === 'licensed_production') continue;
    problems.push(
      effect.provenance === 'test'
        ? `The mix contains the test effect "${effect.title}". Re-run the audio with licensed effects, or without sound design.`
        : `The mix contains the effect "${effect.title}", whose licence has not been verified.`,
    );
  }

  return { publishable: problems.length === 0, problems };
}
