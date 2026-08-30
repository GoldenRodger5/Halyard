'use client';

/**
 * §387. The floor, in a pocket.
 *
 * A horseshoe of six absolutely-positioned desks is a *room*, and a room needs
 * room. Scaled into 390px the desks overlap each other and the two on the right
 * run off the edge — which is the "things shouldn't be cut off or blocking"
 * note from the prototype review, and the reason `docs/STUDIO_BUILD_PLAN.md`
 * §5 says the phone gets a **live map strip and a swipe deck** rather than a
 * shrunken room.
 *
 * This is not a reduced floor. Every desk is here, in the same order, with the
 * same state and the same words — only the gesture changes. That is the rule
 * the whole console is built on: the phone is not a subset.
 *
 * ## The strip is the map
 *
 * Six dots along the top, so you always know where you are in the run and how
 * far it has got — which is what the room's shape tells you on a laptop and
 * what a single scrolled card cannot. Tapping one jumps the deck to it.
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from '@halyard/ui/studio';
import type { DeskLive } from '@/lib/studio/live';

export function FloorDeck({ desks }: { desks: DeskLive[] }) {
  const [at, setAt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  /*
   * Set once a person has swiped. After that the deck stops following the run,
   * because a deck that jumps to the working desk while you are reading another
   * one takes the screen away from you mid-sentence.
   */
  const [held, setHeld] = useState(false);

  /* Follow the working desk until the operator takes over. */
  const workingAt = desks.findIndex((d) => d.state === 'working');
  useEffect(() => {
    if (held || workingAt < 0) return;
    const el = scroller.current;
    if (!el) return;
    const card = el.children[workingAt] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setAt(workingAt);
    /*
     * Inlined rather than calling `jump`, so the effect depends only on the two
     * things it actually reacts to — which desk is working, and whether the
     * operator has taken over. A `jump` in the dependency list is recreated
     * every render and would scroll the deck on every poll.
     */
  }, [workingAt, held]);

  function jump(index: number): void {
    const el = scroller.current;
    if (!el) return;
    const card = el.children[index] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setAt(index);
  }

  function onScroll(): void {
    const el = scroller.current;
    if (!el) return;
    const width = el.clientWidth;
    setAt(Math.round(el.scrollLeft / Math.max(1, width)));
  }

  return (
    <div className="md:hidden">
      {/* ── The map ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-hair px-3 py-2.5">
        {desks.map(({ desk, state }, i) => (
          <button
            key={desk.id}
            type="button"
            onClick={() => {
              setHeld(true);
              jump(i);
            }}
            aria-label={`${desk.name} — ${state}`}
            aria-current={i === at ? 'true' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span
              aria-hidden
              className={cx(
                'h-1.5 w-full rounded-full transition-colors',
                state === 'working'
                  ? 'animate-pulse bg-brass'
                  : state === 'done'
                    ? 'bg-clear'
                    : 'bg-hair2',
              )}
            />
            <span
              className={cx(
                'w-full truncate text-center font-data text-[7px] uppercase tracking-[0.04em]',
                i === at ? 'text-dink' : 'text-faint',
              )}
            >
              {desk.short}
            </span>
          </button>
        ))}
      </div>

      {/* ── The deck ─────────────────────────────────────────── */}
      <div
        ref={scroller}
        onScroll={onScroll}
        onPointerDown={() => setHeld(true)}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {desks.map(({ desk, state, says, events }) => (
          <div key={desk.id} className="w-full flex-none snap-center px-3 py-3.5">
            <div
              className="fl-pod !relative !left-auto !top-auto !w-full"
              data-state={state}
            >
              <div className="mb-[5px] font-data text-[8px] uppercase tracking-[0.12em] text-faint">
                {desk.team}
              </div>
              <div className="flex items-center gap-2">
                <span className="fl-av" style={{ color: desk.tint }} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">{desk.name}</span>
                  <span className="block text-[11px] leading-tight text-dmut">{desk.role}</span>
                </span>
                <span
                  className={cx(
                    'ml-auto shrink-0 font-data text-[9px]',
                    state === 'working'
                      ? 'text-brass'
                      : state === 'done'
                        ? 'text-clear'
                        : 'text-faint',
                  )}
                >
                  {state === 'working' ? 'working' : state === 'done' ? `done · ${events}` : 'queued'}
                </span>
              </div>

              {/*
                The bubble, inline. On a phone there is nowhere above a card for
                a speech bubble to float, and a floating one would cover the
                card it belongs to.
              */}
              <p className="mt-2.5 min-h-[42px] rounded-lg bg-[rgba(255,255,255,0.05)] px-2.5 py-2 text-[12px] leading-snug">
                {says ? (
                  <>
                    {says.says}
                    {says.then ? <b className="text-brass"> {says.then}</b> : null}
                  </>
                ) : state === 'done' ? (
                  <span className="text-dmut">
                    {events} {events === 1 ? 'line' : 'lines'} off this desk.
                  </span>
                ) : (
                  <span className="text-faint">Nothing from this desk yet.</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {held ? (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setHeld(false)}
            className="w-full rounded-lg border border-hair2 py-1.5 font-data text-[9px] uppercase tracking-[0.14em] text-dmut"
          >
            follow the run again
          </button>
        </div>
      ) : null}
    </div>
  );
}
