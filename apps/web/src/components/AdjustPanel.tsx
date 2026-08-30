/**
 * §373. Ask for a change, and say which part.
 *
 * The review step's other half. `Regenerate` sends a note and rebuilds from the
 * copy down, so "the picture is wrong" rewrote the words and the picture came
 * back the same. Each button here names a component, and the correction loop
 * already knows what a change to that component invalidates.
 *
 * The note field is shared rather than one per button: the reason belongs to
 * the request, not to the choice of what to rebuild, and eight note fields on
 * one screen is eight places to type the same sentence.
 *
 * A native `<details>` per unavailable group, so the page stays a server
 * component. Nothing is hidden — the wizard's rule holds here too, and an
 * adjustment that cannot apply says why rather than being absent.
 */
import { adjustmentsFor, type PieceShape } from '@halyard/core';
import { Card, SectionTitle } from '@halyard/ui';
import { adjustItem } from '@/app/(dashboard)/queue/actions';

export function AdjustPanel({ id, shape }: { id: string; shape: PieceShape }) {
  const { available, unavailable } = adjustmentsFor(shape);

  return (
    <Card className="p-4">
      <SectionTitle hint="each one rebuilds a different part">Ask for a change</SectionTitle>

      <form action={adjustItem} className="space-y-3">
        <input type="hidden" name="id" value={id} />

        <div>
          <label htmlFor="adjust-note" className="text-xs text-muted">
            Why? The note reaches whichever agent the change belongs to.
          </label>
          <input
            id="adjust-note"
            name="note"
            placeholder="It is a photo of flour and this is about bread."
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {available.map((adjustment) => (
            <button
              key={adjustment.id}
              type="submit"
              name="adjustment"
              value={adjustment.id}
              title={adjustment.does}
              className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"
            >
              {adjustment.label}
            </button>
          ))}
        </div>
      </form>

      {/*
        What this piece cannot take, and why. An operator who cannot find
        "Slower" on a text post should be told a text post has no scenes rather
        than left wondering whether the button exists at all.
      */}
      {unavailable.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer list-none text-xs text-muted underline underline-offset-2">
            {unavailable.length} more that this piece cannot take
          </summary>
          <ul className="mt-2 space-y-1">
            {unavailable.map(({ adjustment, because }) => (
              <li key={adjustment.id} className="text-xs text-muted">
                <span className="text-ink/70">{adjustment.label}</span> — {because}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
