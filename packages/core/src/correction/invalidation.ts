/**
 * Which gates a change invalidates.
 *
 * §165. Three places in this codebase already answer a version of this question
 * and each answers it for exactly one change:
 *
 *   · `gatesAfterEdit` — a human rewrote the body (§157)
 *   · `regateHookedBody` — the hook stage replaced the first line (§143)
 *   · `review_media`'s merge — media was measured, keep the copy-time verdicts
 *
 * All three are correct and none generalises, so a fourth change — a
 * correction — had nowhere to look. This is the general form, and the three
 * remain: they encode caller-specific knowledge this table does not have,
 * such as the fact that the slop filter is deterministic and has *already
 * re-run*, so the copy gate is refreshed rather than invalidated.
 *
 * ## The rule that governs the whole file
 *
 * **Correctness beats economy.** Every entry below errs toward invalidating
 * more, because the failure modes are not symmetric: re-running a gate costs
 * time and a little money, while preserving a stale green verdict means
 * publishing something no check has examined — which is the specific failure
 * this codebase has found in itself repeatedly (§119, §143, §151, §157).
 *
 * So the question each entry answers is not "did this probably change the
 * gate's input?" but "can I *prove* it did not?"
 */
import type { GateName } from '../qc/index.js';
import type { Component } from './defects.js';

/**
 * The gates whose input a change to this component can reach.
 *
 * Read these as reachability, not as likelihood.
 */
const INVALIDATES: Record<Component, GateName[]> = {
  /**
   * Copy reaches almost everything.
   *
   * The body is linted by the copy gate, claims are extracted from it, the
   * destination gate reads the link out of it, and — the one that is easy to
   * miss — the voiceover script is written *from* the body, so changing the
   * body can change what is said, which changes the audio, the captions, the
   * render and every gate measured on the render.
   *
   * Whether the script actually changed is knowable, and the controller checks:
   * invalidation is computed from the components a correction *really wrote*,
   * not from the ones it was allowed to. A copy revision that left `vo_script`
   * untouched does not list `vo_script` here, so the media gates survive.
   */
  copy: ['copy', 'claims', 'destination'],
  claims: ['claims', 'copy'],
  link: ['destination'],

  /**
   * A new script means new speech, new timing and new captions.
   *
   * `visual` is included because caption drift and text clipping are measured
   * on the rendered frames, and the captions come from the mix.
   */
  vo_script: ['audio', 'visual', 'coherence', 'retention'],

  /**
   * Re-synthesis with the same script still changes the audio file, so it
   * changes duration, caption cues and therefore the render.
   */
  voiceover: ['audio', 'visual', 'coherence', 'retention'],

  creative_plan: ['visual', 'coherence', 'retention'],
  caption_style: ['visual', 'coherence', 'retention'],
  composition: ['visual', 'coherence', 'retention'],

  /**
   * §318. Re-rendering the file re-runs everything measured *on* the file.
   *
   * A new render can change its own duration, its audio and every frame, so
   * every gate that reads the media is reachable. It cannot change the copy or
   * the claims — those are inputs to the render, not outputs of it — which is
   * the whole reason this is a component of its own rather than folded into
   * `composition`.
   */
  render: ['visual', 'audio', 'coherence', 'retention'],

  /**
   * Evidence is not part of the artifact, but a claim is checked against it, so
   * new evidence can change a claims verdict without a word changing.
   */
  evidence: ['claims', 'proof'],

  /**
   * A re-measurement invalidates nothing by itself. The measurement is what is
   * being redone; the artifact has not moved.
   */
  measurement: [],
};

/** Every gate the given components can reach. */
export function gatesInvalidatedBy(components: Component[]): GateName[] {
  const invalid = new Set<GateName>();
  for (const component of components) {
    for (const gate of INVALIDATES[component] ?? []) invalid.add(gate);
  }
  return [...invalid];
}

/**
 * Which stages of the pipeline have to run again.
 *
 * Returned as the existing job kinds rather than a new vocabulary, because the
 * correction controller re-enters the pipeline it already has instead of
 * driving a second one. `tts` releases the renders it gates, and `render`
 * enqueues `review_media` when the last one lands, so asking for the earliest
 * stage is enough — the chain does the rest.
 */
export type RebuildStage = 'tts' | 'render' | 'review_media' | 'none';

export function rebuildFrom(components: Component[]): RebuildStage {
  const set = new Set(components);

  // Earliest stage first: a change that needs new speech also needs a new
  // render and a new review, and `tts` already enqueues both in order.
  if (set.has('vo_script') || set.has('voiceover')) return 'tts';
  if (set.has('creative_plan') || set.has('caption_style') || set.has('composition')) return 'render';

  /*
   * A copy or claims change with no media consequence still needs the media
   * *verdict* recomputed only if media exists — the caller knows that and this
   * does not, so it asks for the cheapest thing that re-runs the gates it can:
   * nothing. The controller re-runs copy-time gates itself, in process, because
   * they are deterministic and need no job.
   */
  if (set.has('copy') || set.has('claims') || set.has('link')) return 'none';

  if (set.has('measurement')) return 'review_media';
  return 'none';
}

/**
 * Mark the invalidated gates as unverified, preserving the rest.
 *
 * A gate whose input changed becomes `skipped` with a summary saying why, never
 * `passed` and never silently dropped. `skipped` is the codebase's existing
 * word for "this was not established", and `runAllGates` already treats it as
 * failing when the item declares the gate as required — so an invalidated gate
 * that never gets re-run blocks approval instead of sliding through.
 */
export function invalidateGates<T extends { gate: GateName; status: string }>(
  gates: T[],
  invalidated: GateName[],
): T[] {
  const set = new Set(invalidated);
  return gates.map((gate) =>
    set.has(gate.gate)
      ? ({
          ...gate,
          status: 'skipped',
          summary: 'invalidated by a correction — awaiting re-measurement',
          detail: null,
        } as unknown as T)
      : gate,
  );
}
