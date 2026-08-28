/**
 * Chapter boundaries for a long-form upload. §223.
 *
 * ## Why the worker and not the render package
 *
 * Gotcha 10. This reads the database, so it is Node-only, and anything
 * Node-only that `treatments.tsx` can reach fails at render time with
 * `UnhandledSchemeError` — after building, typechecking and passing every
 * test. It imports `@halyard/render/timing`, which is the one entry point of
 * that package deliberately kept free of React and Remotion.
 *
 * ## Why it recomputes the timing rather than reading it back
 *
 * `layoutScenes` is what the renderer itself used to place the beats, and it
 * is a pure function of (beats, totalFrames, fps). Calling it here with the
 * same inputs gives the same answer by construction. The alternative — storing
 * resolved times at render time — would be a second copy of the same fact, and
 * a second copy is a thing that can disagree.
 */
import { layoutScenes } from '@halyard/render/timing';
import type { Pool } from 'pg';

/** Remotion renders at 30fps throughout this codebase. */
const FPS = 30;

interface PlannedBeat {
  id: string;
  weight: number;
  minSeconds: number;
  maxSeconds?: number;
  content?: { label?: string; text?: string; after?: string } | null;
}

/**
 * A chapter title, from what the beat actually says.
 *
 * `label` is a step's own title and is the right answer when present. `text`
 * is the line the beat puts on screen, which reads as a chapter title far
 * better than a role name would. A beat with neither gets no chapter rather
 * than a generated one: "Chapter 3" tells a viewer nothing they did not
 * already know from the scrubber.
 */
export function titleForBeat(beat: PlannedBeat): string | null {
  const raw = beat.content?.label ?? beat.content?.text ?? beat.content?.after ?? '';
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  /* Chapter titles are read in a list, not on a frame. A sentence works; a
     paragraph does not. */
  return trimmed.length > 70 ? `${trimmed.slice(0, 67).trimEnd()}…` : trimmed;
}

/**
 * Resolve chapters for a content item, or null when it should not have any.
 *
 * Null and empty are different. Null means "this piece is not the kind of
 * thing that has chapters"; an empty array would mean "it is, and none
 * survived", which is a judgement `chaptersFromBeats` makes downstream with a
 * reason attached.
 */
export async function chaptersForItem(
  pool: Pool,
  contentItemId: string,
  runtimeSeconds: number,
): Promise<Array<{ title: string; startSeconds: number }> | null> {
  if (runtimeSeconds <= 0) return null;

  const { rows } = await pool.query<{ beats: PlannedBeat[] | null; format_subtype: string | null }>(
    `select b.beats, ci.format_subtype
       from content_items ci
       left join creative_briefs b on b.id = ci.brief_id
      where ci.id = $1`,
    [contentItemId],
  );
  const row = rows[0];
  if (!row) return null;
  /* Only long-form has chapters. A Short cannot show them at all, so asking
     the question for one would produce a list nothing could ever use. */
  if (row.format_subtype !== 'long_form') return null;
  if (!row.beats || row.beats.length === 0) return null;

  const timed = layoutScenes(
    row.beats.map((b) => ({
      id: b.id,
      weight: b.weight,
      minSeconds: b.minSeconds,
      ...(b.maxSeconds === undefined ? {} : { maxSeconds: b.maxSeconds }),
    })),
    Math.round(runtimeSeconds * FPS),
    FPS,
  );

  const chapters: Array<{ title: string; startSeconds: number }> = [];
  timed.forEach((scene, index) => {
    const beat = row.beats![index];
    if (!beat) return;
    const title = titleForBeat(beat);
    if (!title) return;
    chapters.push({ title, startSeconds: scene.startFrame / FPS });
  });

  return chapters.length > 0 ? chapters : null;
}
