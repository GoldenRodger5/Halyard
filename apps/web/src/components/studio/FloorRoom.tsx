'use client';

/**
 * §387. The room, drawn.
 *
 * Six desks in a horseshoe, wires between them, one speech bubble above
 * whichever desk is working, and a rail of what has been said. Client-side
 * because it polls and because clicking a desk pins it — nothing else here is
 * interactive.
 *
 * ## Why one bubble
 *
 * Because six bubbles over six desks is unreadable, and because only one desk
 * is ever working. The bubble is pinned directly above its own desk (`DESKS[].
 * bubble`), so it cannot land on top of another one whatever the room is doing.
 *
 * ## Why polling
 *
 * `readLive` is one indexed query. SSE is the better answer and is an
 * optimisation rather than a blocker — the plan says so, and a room that
 * updates every two seconds is already a room you can watch.
 */
import { useEffect, useMemo, useState } from 'react';
import { cx } from '@halyard/ui/studio';
import { DESKS, WIRES } from './desks';
import { ProgramMonitor, RundownBoard, type RundownLine } from './RoomFurniture';
import { FloorDeck } from './FloorDeck';
import type { FloorLive } from '@/lib/studio/live';

/**
 * Where each wire runs, in the room's own 700×560 space.
 *
 * Derived from the desks' own percentage positions rather than drawn by hand,
 * so moving a desk moves its wires with it. A hand-drawn path is a second copy
 * of the layout that goes stale the first time anything is rearranged.
 */
function wirePath(fromId: string, toId: string): string {
  const a = DESKS.find((d) => d.id === fromId)!;
  const b = DESKS.find((d) => d.id === toId)!;
  const pt = (d: (typeof DESKS)[number]) => ({
    /* +75px is the middle of a 150px pod; +34 is roughly its waist. */
    x: (parseFloat(d.at.left) / 100) * 700 + 75,
    y: (parseFloat(d.at.top) / 100) * 560 + 34,
  });
  const p = pt(a);
  const q = pt(b);
  /* A slack cable rather than a straight line: it reads as a room, not a graph. */
  const midY = (p.y + q.y) / 2 + 26;
  return `M ${p.x} ${p.y} C ${p.x} ${midY}, ${q.x} ${midY}, ${q.x} ${q.y}`;
}

export function FloorRoom({
  initial,
  rundown,
}: {
  initial: FloorLive;
  rundown: RundownLine[];
}) {
  const [live, setLive] = useState(initial);
  const [pinned, setPinned] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/floor', { cache: 'no-store' });
        if (res.ok) setLive((await res.json()) as FloorLive);
      } catch {
        /* A dropped poll is not worth a message. The next one is in two seconds. */
      }
    };
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [paused]);

  const hot = useMemo(() => {
    if (!live.handoff) return null;
    return `${live.handoff[0]}→${live.handoff[1]}`;
  }, [live.handoff]);

  const working = live.desks.find((d) => d.state === 'working');
  const shown = pinned ? live.desks.find((d) => d.desk.id === pinned) : working;

  return (
    <div className="overflow-hidden rounded-[14px] border border-hair2 bg-deep shadow-[0_24px_50px_-24px_rgba(0,0,0,0.6)]">
      {/* ── The bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-hair bg-[rgba(8,17,15,0.72)] px-4 py-3 text-dink">
        <span
          className={cx(
            'inline-flex items-center gap-2 rounded-full border px-2.5 py-[3px] font-data text-[9px] uppercase tracking-[0.16em]',
            live.running
              ? 'border-tally/40 bg-tally/[0.07] text-tally'
              : 'border-holding/40 bg-holding/[0.07] text-holding',
          )}
        >
          <span
            aria-hidden
            className={cx(
              'h-[7px] w-[7px] rounded-full',
              live.running ? 'animate-pulse bg-tally' : 'bg-holding',
            )}
          />
          {live.running ? 'On the floor' : 'Room idle'}
        </span>
        <span className="font-display text-sm font-semibold tracking-[-0.02em]">
          {live.making ?? (live.running ? 'In production' : 'Nothing in production')}
        </span>
        {live.running ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className={cx(
              'rounded-full border px-3 py-1 font-data text-[9px] uppercase tracking-[0.14em] transition-colors',
              paused
                ? 'border-brass bg-brass/[0.09] text-brass'
                : 'border-hair2 text-dmut hover:border-brass hover:text-brass',
            )}
          >
            {paused ? '▶ resume' : '⏸ pause'}
          </button>
        ) : null}
        <span className="ml-auto font-data text-[11px] text-dmut">
          {live.desks.filter((d) => d.state !== 'waiting').length} of {DESKS.length} desks
        </span>
      </div>

      {/* ── The room and the rail ───────────────────────────── */}
      <div className="md:grid md:min-h-[560px] md:grid-cols-[1fr_250px]">
        {/*
          The room needs room. Below `md` the horseshoe would overlap itself and
          run off the right edge, so the deck takes over — same desks, same
          order, same words, different gesture. §5 of the build plan.
        */}
        <FloorDeck desks={live.desks} />

        <div className="fl-space relative hidden min-h-[440px] md:block">
          <div className="fl-wall" />
          <div className="fl-grid" />
          <ProgramMonitor caption={live.making} running={live.running} />
          <RundownBoard lines={rundown} />

          <svg className="fl-wires" viewBox="0 0 700 560" preserveAspectRatio="none" aria-hidden>
            {WIRES.map(([from, to]) => (
              <path
                key={`${from}-${to}`}
                d={wirePath(from, to)}
                data-hot={hot === `${from}→${to}` ? 'true' : undefined}
              />
            ))}
          </svg>

          {live.desks.map(({ desk, state, events }) => (
            <button
              key={desk.id}
              type="button"
              className="fl-pod"
              data-state={state}
              data-pinned={pinned === desk.id ? 'true' : undefined}
              style={{ left: desk.at.left, top: desk.at.top }}
              onClick={() => setPinned((p) => (p === desk.id ? null : desk.id))}
              aria-pressed={pinned === desk.id}
            >
              {/*
                Wraps to two lines rather than clipping. "Content · writers'
                room" is wider than a 150px pod at this tracking, and a team
                name cut mid-word tells you less than nothing.
              */}
              <div className="mb-[5px] whitespace-normal break-words font-data text-[7.5px] uppercase leading-[1.35] tracking-[0.1em] text-faint">
                {desk.team}
              </div>
              <div className="flex items-center gap-[7px]">
                <span className="fl-av" style={{ color: desk.tint }} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold leading-[1.2]">{desk.name}</span>
                  <span className="block text-[9.5px] leading-[1.25] text-dmut">{desk.role}</span>
                </span>
              </div>
              <div
                className={cx(
                  'mt-[7px] flex items-center gap-[5px] font-data text-[8.5px]',
                  state === 'working' ? 'text-brass' : state === 'done' ? 'text-clear' : 'text-faint',
                )}
              >
                {state === 'working' ? (
                  <>
                    <span className="fl-dots inline-flex gap-[2px]" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    working
                  </>
                ) : state === 'done' ? (
                  `done · ${events}`
                ) : (
                  'queued'
                )}
              </div>
            </button>
          ))}

          {/*
            One bubble, above the desk that is talking. Rendered only for the
            working desk, so two can never overlap however the room moves.
          */}
          {working?.says ? (
            <div
              className="fl-bub"
              style={{ left: working.desk.bubble.left, top: working.desk.bubble.top }}
            >
              {working.says.says}
              {working.says.then ? <b> {working.says.then}</b> : null}
            </div>
          ) : null}
        </div>

        <Rail feed={live.feed} running={live.running} paused={paused} />
      </div>

      {/* ── What came off the pinned desk ───────────────────── */}
      <div className="border-t border-hair bg-[rgba(8,17,15,0.72)] px-4 py-3.5 text-dink">
        {shown ? (
          <>
            <span className="font-data text-[8.5px] uppercase tracking-[0.16em] text-faint">
              {shown.desk.team}
            </span>
            <h3 className="mt-1 font-display text-[17px] font-extrabold tracking-[-0.02em]">
              {shown.desk.name}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-dmut">
              {shown.says ? (
                <>
                  {shown.says.says} {shown.says.then}
                </>
              ) : shown.state === 'done' ? (
                `${shown.events} ${shown.events === 1 ? 'line' : 'lines'} off this desk. Click another to pin it.`
              ) : (
                'Nothing from this desk yet.'
              )}
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-dmut">
            Click a desk to pin it and see what came off it.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The live rail: what the crew has actually said.
 *
 * Its own component rather than markup inside the room, because it belongs to
 * both shapes — the room is replaced by the deck on a phone, and the feed is
 * not part of the room. Extracting it is what keeps the phone from losing it.
 */
function Rail({
  feed,
  running,
  paused,
}: {
  feed: FloorLive['feed'];
  running: boolean;
  paused: boolean;
}) {
  return (
    <div className="flex flex-col border-t border-hair bg-gradient-to-b from-[rgba(18,33,31,0.9)] to-[rgba(8,17,15,0.95)] md:border-l md:border-t-0">
      <div className="flex items-center gap-2 border-b border-hair px-3.5 py-2.5 font-data text-[9px] uppercase tracking-[0.16em] text-faint">
        <span
          aria-hidden
          className={cx('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse bg-clear' : 'bg-hair2')}
        />
        {paused ? 'paused' : 'live'}
      </div>
      <div className="flex max-h-[300px] flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-2.5 md:max-h-none">
        {feed.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-faint">
            Nothing has been said yet. When a production starts, every line the crew logs arrives
            here.
          </p>
        ) : (
          feed.map((e) => (
            <div key={e.id} className="flex gap-2">
              <span className="w-[62px] shrink-0 font-data text-[8.5px] uppercase leading-[1.5] tracking-[0.06em] text-faint">
                {e.who}
              </span>
              <span className="min-w-0 flex-1 text-[11px] leading-snug text-dink">
                {e.says.says}
                {e.says.then ? <b className="text-brass"> {e.says.then}</b> : null}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
