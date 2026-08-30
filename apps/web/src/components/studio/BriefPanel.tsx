'use client';

/**
 * §387. Briefing the floor.
 *
 * The same five questions the `/make` wizard asks, in the room they apply to.
 * The panel is on the right and the desks are on the left, and choosing wakes
 * them — which is the whole reason this is a room and not a form. An operator
 * choosing "caption" watches the sound booth and the edit bay go dark, and
 * learns what a caption is in this system without reading anything.
 *
 * ## Nothing is hidden
 *
 * A post type a platform cannot carry stays on screen, greyed, with the
 * adapter's own reason in its title. §355's rule: an operator who cannot find
 * an option should be told why it is not on offer, not left wondering whether
 * it exists.
 */
import { useEffect, useState, useTransition } from 'react';
import { cx } from '@halyard/ui/studio';
import { PLATFORM_LABELS } from '@halyard/ui';
import { previewBrief, type BriefPreview } from '@/app/(studio)/floor/actions';

export interface CarriageEntry {
  id: string;
  name: string;
  media: 'video' | 'text' | 'carousel' | 'image';
  channel: string;
  byPlatform: Record<string, { ok: boolean; because: string }>;
}

export interface BriefShape {
  id: string;
  name: string;
}

export function BriefPanel({
  platforms,
  carriage,
  shapes,
  productId,
  onPreview,
  action,
}: {
  /** Only platforms with an account. A chip for a platform you cannot post to is a dead end. */
  platforms: string[];
  carriage: CarriageEntry[];
  shapes: BriefShape[];
  /** Sent with the brief rather than defaulted inside the action. */
  productId: string;
  /** Lifts the preview so the room can light its desks. */
  onPreview: (preview: BriefPreview | null) => void;
  action: (formData: FormData) => void;
}) {
  const [platform, setPlatform] = useState(platforms[0] ?? '');
  const [typeId, setTypeId] = useState<string>('');
  const [shape, setShape] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [pending, start] = useTransition();

  /* What this platform can carry, and what it cannot — both shown. */
  const offered = carriage.map((c) => ({
    ...c,
    verdict: c.byPlatform[platform] ?? { ok: false, because: 'no account on this platform' },
  }));

  const chosen = offered.find((c) => c.id === typeId) ?? offered.find((c) => c.verdict.ok);

  useEffect(() => {
    if (!chosen) {
      onPreview(null);
      return;
    }
    let live = true;
    start(() => {
      void previewBrief({
        media: chosen.media,
        channel: chosen.channel,
        ...(shape ? { format: shape } : {}),
      }).then((p) => {
        if (live) onPreview(p);
      });
    });
    return () => {
      live = false;
    };
    /*
     * Deliberately keyed on the *selections* rather than on `chosen` or on
     * `onPreview`. `chosen` is recomputed every render, so depending on the
     * object re-runs the preview on every keystroke in the subject field;
     * `onPreview` is a `useCallback` from the room and depending on it is
     * harmless but says something untrue about what this effect reacts to.
     */
  }, [chosen?.id, chosen?.media, chosen?.channel, shape, onPreview]);

  return (
    <form
      action={action}
      className="flex flex-col gap-2.5 border-hair bg-[rgba(8,17,15,0.55)] p-4 text-dink lg:border-l"
    >
      <input type="hidden" name="platforms" value={platform} />
      <input type="hidden" name="postType" value={chosen?.id ?? ''} />
      {/*
        `postFormat`, not `format`. `makePiece` reads `postFormat`, this sent
        `format`, and a `FormData` key nobody reads is silently dropped — so
        every shape chosen on this panel was discarded on the way to the job and
        the run picked its own. Declared, wired, never read: decision 71's shape
        in the newest code in the repository, found by driving the room and
        reading the payload back out of the database.
      */}
      <input type="hidden" name="postFormat" value={shape} />
      <input type="hidden" name="productId" value={productId} />

      <div className="font-display text-sm font-semibold tracking-[-0.02em]">Brief the floor</div>

      <Q>Where does it go</Q>
      <Chips>
        {platforms.map((p) => (
          <DChip key={p} on={p === platform} onClick={() => setPlatform(p)}>
            {PLATFORM_LABELS[p] ?? p}
          </DChip>
        ))}
      </Chips>

      <Q>What kind — only what {PLATFORM_LABELS[platform] ?? platform} can carry</Q>
      <Chips>
        {offered.map((c) => (
          <DChip
            key={c.id}
            on={c.id === chosen?.id}
            unavailable={!c.verdict.ok}
            reason={c.verdict.because}
            onClick={() => setTypeId(c.id)}
          >
            {c.name}
          </DChip>
        ))}
      </Chips>

      <Q>What shape</Q>
      <Chips>
        <DChip on={shape === ''} onClick={() => setShape('')}>
          Let the room decide
        </DChip>
        {shapes.map((s) => (
          <DChip key={s.id} on={shape === s.id} onClick={() => setShape(s.id)}>
            {s.name}
          </DChip>
        ))}
      </Chips>

      <Q>About what — optional</Q>
      <input
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Leave empty and it reads this week’s signals"
        className="w-full rounded-[7px] border border-hair2 bg-[rgba(8,17,15,0.5)] px-2.5 py-2 text-xs text-dink outline-none placeholder:text-faint focus:border-brass"
      />

      <button
        type="submit"
        disabled={!chosen || pending}
        className={cx(
          'mt-1.5 rounded-lg bg-brass px-3.5 py-2 text-xs font-medium text-deep transition-transform',
          'hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0',
        )}
      >
        Send it to the floor →
      </button>
    </form>
  );
}

function Q({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 font-data text-[8.5px] uppercase tracking-[0.14em] text-faint">
      {children}
    </div>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function DChip({
  on,
  unavailable,
  reason,
  onClick,
  children,
}: {
  on?: boolean;
  unavailable?: boolean;
  reason?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={unavailable}
      title={unavailable ? reason : undefined}
      aria-pressed={on}
      className={cx(
        'rounded-[7px] border px-2.5 py-1 text-[11.5px] transition-colors',
        on
          ? 'border-brass bg-brass/[0.14] text-dink'
          : 'border-hair2 text-dmut hover:border-brass hover:text-dink',
        unavailable && 'cursor-not-allowed opacity-[0.32] hover:border-hair2 hover:text-dmut',
      )}
    >
      {children}
    </button>
  );
}
