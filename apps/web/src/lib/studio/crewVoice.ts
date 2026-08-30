/**
 * §387. What a desk says out loud.
 *
 * The floor puts a speech bubble above whichever desk is working. The line in
 * it is **not generated**. It is a deterministic function of the event that was
 * logged, and where no line is written for a message the bubble falls back to
 * the event's own `because` — which is a real sentence a human wrote in the
 * handler, and the honest thing to show.
 *
 * ## Why not ask a model to phrase it
 *
 * Because the governing rule is that agents perceive and code decides, and a
 * caption on a live feed is neither perception nor writing that needs one. A
 * model phrasing these would cost a call per event, be non-reproducible, and —
 * worst — could describe a run in words the run does not support. A bubble
 * saying "found six great sources!" over a stage that found two would be a
 * fabricated observation, which is gotcha 9 wearing a friendly face.
 *
 * ## Why the lines are in the crew's voice
 *
 * The room is meant to be legible and enjoyable to watch, and "citation
 * checked" is neither. These are the same fact in the words the person doing
 * the job would use. Nothing is added — where a line implies a number, that
 * number comes from the event's own detail.
 */

export interface CrewLine {
  /** What the desk says. Kept short: it sits in a 200px bubble. */
  says: string;
  /** Emphasis, rendered bold at the end. Optional. */
  then?: string;
}

/**
 * Message → line. Keyed on the exact `ctx.log` message, because a substring
 * match would attach the wrong line the moment somebody reuses a phrase — the
 * same reasoning that made stage attribution structural rather than
 * keyword-matched in §367.
 */
const LINES: Record<string, CrewLine> = {
  /* ── brief ── */
  'production planned': { says: 'Here is what we are making,', then: 'and what we are skipping.' },
  'post format chosen': { says: 'This wants to be a', then: 'particular shape.' },

  /* ── research ── */
  'citation checked': { says: 'Read the page.', then: 'It does say that.' },
  'citation rejected': { says: 'That page does not say it.', then: 'Dropping the claim.' },
  research: { says: 'Going to the sources first.' },

  /* ── write ── */
  'format filled': { says: 'Every slot has words in it now.' },
  'format refused': { says: 'Not yet —', then: 'it does not fill the shape.' },
  'hook chosen': { says: 'This is the opening that earns the second line.' },
  'caption written': { says: 'And the words that sit under it.' },

  /* ── screenplay ── */
  'piece staged': { says: 'Scene by scene,', then: 'with the beats where they land.' },

  /* ── assets ── */
  'photographic subject': { says: 'You cannot photograph an idea.', then: 'So — this instead.' },
  'no usable asset': { says: 'Nothing here to shoot.', then: 'Type on a ground, then.' },
  'annotations planned': { says: 'Pointing here, and here.' },

  /* ── voice and music ── */
  'voice skipped': { says: 'Nobody speaks in this one.' },
  'music bed skipped': { says: 'No bed I am allowed to use.', then: 'It goes out silent.' },

  /* ── render ── */
  rendered: { says: 'Frames.', then: 'That is the piece.' },

  /* ── qc ── */
  're-gated after the hook was applied': { says: 'New opening —', then: 'so I check it again.' },
  'hook rejected by QC, keeping the copywriter opening': {
    says: 'That opening does not pass.',
    then: 'Keeping the original.',
  },
  'media integrity failed': { says: 'I have watched it back.', then: 'It does not hold up.' },
};

/**
 * The line for an event.
 *
 * Falls back to the event's own `because`, then to the raw message. Never
 * empty and never invented — a desk with nothing written for it says the thing
 * the handler said, which is always true if less charming.
 */
export function crewLine(message: string, detail?: Record<string, unknown> | null): CrewLine {
  /*
   * `stage opened` fires once per stage, so a single written line for it would
   * put the same sentence in six different mouths — which is what it did: every
   * desk woke up saying "Right, let me look at this." `openStage` already
   * carries the stage's own `doing` from `STAGE_AGENTS`, and that is both
   * specific to the desk and true of it.
   */
  if (message === 'stage opened') {
    const doing = typeof detail?.doing === 'string' ? detail.doing : null;
    return { says: doing ? trim(doing) : 'Starting.' };
  }

  const written = LINES[message];
  if (written) return written;

  const because = typeof detail?.because === 'string' ? detail.because : null;
  if (because) return { says: trim(because) };

  const reason = typeof detail?.reason === 'string' ? detail.reason : null;
  if (reason) return { says: trim(reason) };

  return { says: trim(message) };
}

/** A bubble is 200px wide. Anything past two lines is not read anyway. */
function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 110 ? `${clean.slice(0, 108)}…` : clean;
}

/** Exported for the test that keeps every written line short enough to read. */
export const WRITTEN_LINES = LINES;
