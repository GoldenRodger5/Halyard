/**
 * §372. The screenplay, on the piece it staged.
 *
 * The UI spec's review step asks for the screenplay beside the finished video,
 * and until now there was nothing to show: `writeScreenplay` ran from a script
 * and its output was printed to a terminal and lost. A production stages the
 * piece now and the document survives on the row, so an operator can read what
 * the video was *meant* to be and compare.
 *
 * Rendered as the script `printScreenplay` produces rather than as a table.
 * That format exists because a screenplay is read, not queried — the whole
 * reason §335 wrote one down instead of leaving the decisions in a graph of
 * agent outputs was that a person should be able to read the piece before it is
 * made. A table of scene properties would undo that.
 */
import { printScreenplay, type Screenplay } from '@halyard/core';
import { Card, SectionTitle } from '@halyard/ui';

export function ScreenplayPanel({ screenplay }: { screenplay: Screenplay | null }) {
  /*
   * Null means not staged, which is a real and common answer — a caption has no
   * scenes, a still image has none, and a run whose screenwriter was
   * unavailable makes the piece without one. Saying nothing is right; an empty
   * panel headed "Screenplay" would imply one was expected and is missing.
   */
  if (!screenplay || screenplay.scenes.length === 0) return null;

  const seconds = screenplay.scenes.reduce((total, scene) => total + scene.seconds, 0);

  return (
    <Card className="p-4">
      <SectionTitle hint={`${screenplay.scenes.length} scenes · ${seconds}s · bed ${screenplay.bedMood}`}>
        What it was staged as
      </SectionTitle>
      {/*
        Horizontal scroll on its own container: a screenplay is fixed-width
        text and the page must never scroll sideways because of it.
      */}
      <div className="overflow-x-auto">
        <pre className="whitespace-pre text-[11px] leading-relaxed text-muted">
          {printScreenplay(screenplay)}
        </pre>
      </div>
    </Card>
  );
}
