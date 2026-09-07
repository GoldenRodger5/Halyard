/**
 * §551. What to search for, per sound-effect role.
 *
 * The library held four `[TEST]` fixtures whose licence field read, in as many
 * words, *"Synthesised test fixture — NOT a licence"* — the same state the
 * music library was in before §547, and with the same consequence: every piece
 * logged "no sound design: the sound effect library is empty" and shipped
 * without any.
 *
 * These queries are the SFX half of `BED_SEARCHES`, and they carry the same
 * warning it does: a search term nobody has run is a guess. Each was checked
 * against the live index before being written down, and a role that finds
 * nothing is **left empty** rather than filled from a neighbouring role — a
 * whoosh standing in for an impact is a cue in the wrong place, and the planner
 * would place it as confidently as a right one.
 *
 * ## Why the durations are so short
 *
 * A cue punctuates; it does not play. `maxSeconds` keeps a four-second field
 * recording out of a slot meant for a 300ms tick, because the planner places
 * cues by role and has no way to know that the file behind one is a soundscape.
 */
import type { SfxRole } from './sfx.js';

export interface SfxSearch {
  query: string;
  /** Cues are punctuation. Anything longer is a bed pretending to be one. */
  maxSeconds: number;
}

/**
 * §551. Below this a cue is an artefact, not a sound.
 *
 * The first tuned search picked a 0.01-second "Stereo Tick" for `accent` —
 * ten milliseconds, which is shorter than the attack of most speakers and
 * reads as a click in the encode rather than as punctuation. Eighty
 * milliseconds is about where a transient becomes something a listener
 * registers as deliberate.
 */
export const MIN_CUE_SECONDS = 0.08;

/**
 * The four roles the planner actually places. `ambience` and `texture` exist in
 * `SfxRole` and are not searched for here: nothing plans them yet, and a
 * library full of sounds no stage requests is how §535's unreachable
 * compositions happened.
 */
export const SFX_SEARCHES: Partial<Record<SfxRole, SfxSearch>> = {
  /*
   * §551. Single words, measured against the live index.
   *
   * The first version of this file used phrases — "whoosh transition swoosh",
   * "soft impact thump" — and every one returned nothing while the single word
   * returned 240. Which is the warning `BED_SEARCHES` already carries and which
   * I wrote anyway: a search term nobody has run is a guess.
   */
  transition: { query: 'whoosh', maxSeconds: 3 },
  impact: { query: 'impact', maxSeconds: 3 },
  accent: { query: 'tick', maxSeconds: 2 },
  ui: { query: 'click', maxSeconds: 2 },
};

export const SFX_ROLES_SEARCHED = Object.keys(SFX_SEARCHES) as SfxRole[];
