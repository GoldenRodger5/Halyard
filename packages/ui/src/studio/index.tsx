/**
 * §383. The studio's primitives.
 *
 * Everything here is a pure function of its props — no data, no queries, no
 * state. That is the line that keeps the design system testable and keeps
 * pages honest: a page fetches and passes down, a primitive draws.
 *
 * The visual spec is the prototype. Where a value here looks arbitrary it was
 * measured off it.
 */
import type { ReactNode } from 'react';

export * from './tally.js';

/** Join class names, skipping anything falsy. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ── The slate ──────────────────────────────────────────────────────
 *
 * A dark strip at the top of every light room carrying its number, the
 * question it answers, and one detail on the right.
 *
 * It solves two problems at once. A room of white cards on a white ground
 * reads as unfinished, and the slate is a dark anchor that fixes that without
 * making the room loud. And the *question* is the thing that tells an operator
 * whether they are in the right room — a title says "Gallery", which they can
 * already see in the sidebar.
 *
 * The right-hand detail is where a room puts something it would otherwise
 * hide in a tooltip. The Gallery puts its keyboard shortcuts there.
 */
export function Slate({
  room,
  question,
  detail,
}: {
  room: string;
  question: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-3.5 gap-y-1 bg-sink px-5 py-2.5 text-white md:px-6">
      <span className="font-data text-[9px] uppercase tracking-[0.2em] text-dmut">{room}</span>
      <span className="font-display text-sm font-semibold tracking-[-0.02em]">{question}</span>
      {detail ? (
        <span className="ml-auto font-data text-[9px] tracking-[0.08em] text-dmut">{detail}</span>
      ) : null}
    </div>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────── */

export type SheetTone = 'plain' | 'lit' | 'onair' | 'cool' | 'dark';

/**
 * A card.
 *
 * `lit` and `onair` carry a 3px inset stripe rather than a full tint, because
 * a whole card washed in colour competes with the work inside it — the stripe
 * says which one to look at without shouting.
 */
export function Sheet({
  tone = 'plain',
  className,
  children,
}: {
  tone?: SheetTone;
  className?: string;
  children: ReactNode;
}) {
  /*
   * §392. The tint carries the state, not a coloured bar down the left edge.
   *
   * The inset stripe is the single most recognisable tell of a generated
   * layout — an accent rail on a rounded card, applied to every card that
   * means anything. It also stopped working here the moment more than one card
   * on a screen had a state, because six rails read as decoration rather than
   * as emphasis.
   *
   * A card that matters now carries a *warmer ground* and a stronger border in
   * its own colour. The lamp beside its heading already names the state, so the
   * surface only has to agree with it rather than announce it again.
   */
  const tones: Record<SheetTone, string> = {
    plain: 'bg-gradient-to-b from-white to-sheet border-rule',
    lit: 'border-lit/30 bg-gradient-to-b from-[#FEFBF4] to-[#F9F2E4]',
    onair: 'border-onair/30 bg-gradient-to-b from-[#FEF8F7] to-[#FBEDEA]',
    cool: 'bg-gradient-to-b from-[#f2f6f5] to-[#e9efee] border-rule2',
    dark: 'bg-[#0d1413] border-hair text-dink',
  };
  const lift = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_16px_-10px_rgba(15,23,22,0.28)]';
  return (
    <div className={cx('rounded-[11px] border p-4', tones[tone], lift, className)}>{children}</div>
  );
}

/**
 * A small-caps label above a block.
 *
 * Mono and letterspaced, because these are structural rather than editorial —
 * they name a region, and the eye should skip them once it knows the room.
 */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'mb-2 font-data text-[9.5px] uppercase tracking-[0.11em] text-quiet',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────────── */

export type ButtonTone = 'solid' | 'ghost' | 'brass';

/**
 * A button.
 *
 * `brass` is the one action on a screen — the thing the room is asking for.
 * More than one brass button in a view means the room has not decided what it
 * wants, which is a design problem rather than a styling one.
 */
export function Action({
  tone = 'solid',
  small,
  full,
  className,
  children,
  ...rest
}: {
  tone?: ButtonTone;
  small?: boolean;
  full?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones: Record<ButtonTone, string> = {
    solid: 'bg-sink text-white shadow-[0_5px_12px_-5px_rgba(15,23,22,0.65)]',
    ghost: 'bg-transparent text-sink border border-rule2',
    brass: 'bg-lit text-white shadow-[0_5px_14px_-5px_rgba(154,110,21,0.6)]',
  };
  return (
    <button
      {...rest}
      className={cx(
        'rounded-lg font-medium transition-transform hover:-translate-y-px',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0',
        small ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-[7px] text-xs',
        full && 'w-full text-center',
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export type PillTone = 'holding' | 'working' | 'ready' | 'onair' | 'quiet';

/** A state word, outlined in its own colour. Reads beside a tally, not instead of one. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const tones: Record<PillTone, string> = {
    holding: 'text-parked',
    working: 'text-lit',
    ready: 'text-passed',
    onair: 'text-onair',
    quiet: 'text-quiet',
  };
  return (
    <span
      className={cx(
        'inline-block rounded border px-1.5 font-data text-[9px] uppercase tracking-[0.07em]',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A choice in a row of choices.
 *
 * `unavailable` is greyed and keeps its reason in `title`. Nothing is hidden —
 * an operator who cannot find an option should be told why it is not on offer,
 * not left wondering whether it exists.
 */
export function Chip({
  on,
  unavailable,
  reason,
  className,
  children,
  ...rest
}: {
  on?: boolean;
  unavailable?: boolean;
  reason?: string;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={rest.type ?? 'button'}
      disabled={unavailable || rest.disabled}
      title={unavailable ? reason : rest.title}
      aria-pressed={on}
      className={cx(
        'rounded-lg border px-2.5 py-1 text-xs transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit',
        on
          ? 'border-sink bg-sink text-white'
          : 'border-rule2 bg-sheet text-quiet hover:border-sink hover:text-sink',
        unavailable && 'cursor-not-allowed opacity-[0.34] hover:border-rule2 hover:text-quiet',
        className,
      )}
    >
      {children}
    </button>
  );
}
