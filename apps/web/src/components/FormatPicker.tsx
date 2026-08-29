'use client';

/**
 * §283. Naming the shape, beside the idea.
 *
 * The composer takes a free-text idea and infers everything else. That is right
 * for the common case and wrong for the one where an operator already knows what
 * they want — "make this a quiz" typed into a chat box is a hint, not an
 * instruction, and the system was free to ignore it.
 *
 * This makes it an instruction. Picking a format sets `postFormat` on the
 * request, which `selectFormat` honours over its own choice (§278).
 *
 * ## Grouped by platform, because the same idea is a different post on each
 *
 * A full recipe is not an X post and a quiz is not a Pinterest pin. Each format
 * declares the platforms that can carry it, so the picker only ever offers a
 * shape the chosen platform can actually publish — the same discipline
 * `findFormatSpec` applies to subtypes, surfaced rather than discovered after
 * the fact.
 *
 * Leaving it unset is a real choice and the default: the system picks, weighing
 * what the source supports, which pillar is under-served, and what the account
 * has not done recently. The reason is recorded either way.
 */
import { useState } from 'react';

export interface PickableFormat {
  id: string;
  name: string;
  intent: string;
  platforms: string[];
  /** True when this format cannot run without a product artifact. */
  needsArtifact: boolean;
  /** True when every claim in it must carry a verified citation. */
  needsCitation: boolean;
}

export interface FormatPickerProps {
  formats: PickableFormat[];
  /** Narrows the list. Unset shows everything, which is the composer's default. */
  platform?: string | null;
  value: string | null;
  onChange: (formatId: string | null) => void;
}

export function FormatPicker({ formats, platform, value, onChange }: FormatPickerProps) {
  const [open, setOpen] = useState(false);

  const available = platform ? formats.filter((f) => f.platforms.includes(platform)) : formats;
  const chosen = available.find((f) => f.id === value) ?? null;

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.1em] text-muted">Shape</span>

        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`rounded-full border px-3 py-1 text-xs transition ${
            value === null
              ? 'border-primary bg-primary text-paper'
              : 'border-line text-muted hover:border-primary'
          }`}
        >
          Let Halyard choose
        </button>

        {available.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => onChange(format.id === value ? null : format.id)}
            aria-pressed={format.id === value}
            title={format.intent}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              format.id === value
                ? 'border-primary bg-primary text-paper'
                : 'border-line text-ink hover:border-primary'
            }`}
          >
            {format.name}
          </button>
        ))}

        {available.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-muted underline underline-offset-2"
          >
            {open ? 'hide' : 'what these are'}
          </button>
        ) : null}
      </div>

      {/*
        The chosen format's constraints, shown before the run rather than
        discovered from a failure afterwards. A quiz that cannot cite is
        refused (§282) and an operator deserves to know that up front.
      */}
      {chosen ? (
        <p className="mt-2 text-xs text-muted">
          {chosen.intent}
          {chosen.needsArtifact ? ' Needs an adapted artifact to exist.' : ''}
          {chosen.needsCitation
            ? ' Every claim in it is fetched and checked against its source.'
            : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Halyard picks by what the source supports, which pillar is thin, and what this
          account has not done recently — and says why.
        </p>
      )}

      {open ? (
        <dl className="mt-3 grid gap-2 rounded-lg border border-line bg-sunk p-3">
          {available.map((format) => (
            <div key={format.id} className="text-xs">
              <dt className="font-semibold">{format.name}</dt>
              <dd className="text-muted">{format.intent}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {platform && available.length === 0 ? (
        <p className="mt-2 text-xs text-danger">
          No format declares {platform}. That is a gap in the catalogue, not a choice.
        </p>
      ) : null}
    </div>
  );
}
