/**
 * §383. One lamp, one meaning, every room.
 *
 * A studio gallery reads state from lamps rather than from labels, because a
 * lamp is legible at a glance and from across a room. Halyard has exactly four
 * things a piece can be, and the whole console uses these four:
 *
 * | Lamp | Means |
 * |---|---|
 * | **blue** | holding — nothing is wrong, it is waiting on you or on a slot |
 * | **amber** | working — something is happening to it right now |
 * | **green** | ready — it passed, and it can go |
 * | **red** | on air, or the thing that stops it going |
 *
 * The value of one vocabulary is that it is learned once. An operator who
 * learns it in the Gallery can read the Rundown, the crew roster and the rig
 * without being taught again — which is only true if nothing else in the
 * product ever invents a fifth colour.
 *
 * ## Why this is a component and not a class name
 *
 * Because the *mapping* is the decision, and a decision belongs somewhere it
 * can be tested. `text-warn` on a div is a colour; `tallyFor('rendering')` is a
 * claim that rendering is a working state, and that claim can be wrong.
 */
import type { CSSProperties } from 'react';

/** The four states, and the one absence. */
export const TALLY_STATES = ['holding', 'working', 'ready', 'onair', 'dark'] as const;
export type TallyState = (typeof TALLY_STATES)[number];

/**
 * Colours per ground.
 *
 * Two sets, deliberately. §174's lesson is that contrast is a property of a
 * pair — a green that reads on the studio's near-black is washed out on paper,
 * and the paper values were each solved against the light ground rather than
 * borrowed from the dark one.
 */
const ON_DARK: Record<TallyState, string> = {
  holding: 'var(--color-holding)',
  working: 'var(--color-brass)',
  ready: 'var(--color-clear)',
  onair: 'var(--color-tally)',
  dark: 'var(--color-hair2)',
};

const ON_LIGHT: Record<TallyState, string> = {
  holding: 'var(--color-parked)',
  working: 'var(--color-lit)',
  ready: 'var(--color-passed)',
  onair: 'var(--color-onair)',
  dark: 'var(--color-rule2)',
};

/** What each lamp means, for a title attribute and for the legend. */
export const TALLY_MEANS: Record<TallyState, string> = {
  holding: 'Holding — waiting on you, or on a slot',
  working: 'Working — something is happening to it now',
  ready: 'Ready — it passed, and it can go',
  onair: 'On air',
  dark: 'Nothing here',
};

/**
 * Every content status this system has, mapped to a lamp.
 *
 * Exhaustive over `content_items.status` plus the render and gate conditions
 * the queue derives. A status with no entry falls to `dark` and is reported by
 * the test rather than guessed at — an unknown state showing green is the one
 * outcome worth preventing.
 */
const FOR_STATUS: Record<string, TallyState> = {
  draft: 'holding',
  pending_approval: 'holding',
  approved: 'ready',
  scheduled: 'ready',
  publishing: 'working',
  published: 'onair',
  awaiting_manual_publish: 'onair',
  failed: 'onair',
  rejected: 'dark',
  expired: 'dark',
  /* Derived, not stored: the queue computes these from the render rows. */
  rendering: 'working',
  render_failed: 'onair',
};

export function tallyFor(status: string): TallyState {
  return FOR_STATUS[status] ?? 'dark';
}

export interface TallyProps {
  state: TallyState;
  /** Which ground it sits on. Defaults to the studio's dark. */
  on?: 'dark' | 'light';
  /** Pixels. 7 in a row, 9 on a card, 6 on a monitor strip. */
  size?: number;
  /** A lamp that means "right now" breathes. Off by default. */
  live?: boolean;
  label?: string;
}

export function Tally({ state, on = 'dark', size = 7, live = false, label }: TallyProps) {
  const colour = (on === 'light' ? ON_LIGHT : ON_DARK)[state];
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: colour,
    /*
     * The glow is what makes it read as a lamp rather than a dot — except for
     * `dark`, which is an unlit bulb and must not glow.
     */
    boxShadow: state === 'dark' ? 'none' : `0 0 ${Math.round(size * 0.9)}px ${colour}`,
    flex: 'none',
    display: 'inline-block',
  };
  return (
    <span
      aria-hidden={label ? undefined : true}
      title={label ?? TALLY_MEANS[state]}
      className={live && state !== 'dark' ? 'animate-pulse' : undefined}
      style={style}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
