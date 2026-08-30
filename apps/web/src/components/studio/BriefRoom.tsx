'use client';

/**
 * §387. The room, being briefed.
 *
 * The same six desks as the live floor, in the same places, asleep until the
 * brief wakes them. Same layout table (`DESKS`), so a desk cannot be in one
 * place while briefing and another while working — which is the point of the
 * room being a room: you learn where the sound booth is once.
 */
import { useCallback, useState } from 'react';
import { cx } from '@halyard/ui/studio';
import { DESKS, WIRES } from './desks';
import { ProgramMonitor, RundownBoard, type RundownLine } from './RoomFurniture';
import { BriefPanel, type BriefShape, type CarriageEntry } from './BriefPanel';
import type { BriefPreview } from '@/app/(studio)/floor/actions';

function wirePath(fromId: string, toId: string): string {
  const a = DESKS.find((d) => d.id === fromId)!;
  const b = DESKS.find((d) => d.id === toId)!;
  const pt = (d: (typeof DESKS)[number]) => ({
    x: (parseFloat(d.at.left) / 100) * 700 + 75,
    y: (parseFloat(d.at.top) / 100) * 560 + 34,
  });
  const p = pt(a);
  const q = pt(b);
  const midY = (p.y + q.y) / 2 + 26;
  return `M ${p.x} ${p.y} C ${p.x} ${midY}, ${q.x} ${midY}, ${q.x} ${q.y}`;
}

export function BriefRoom({
  platforms,
  carriage,
  shapes,
  rundown,
  action,
}: {
  platforms: string[];
  carriage: CarriageEntry[];
  shapes: BriefShape[];
  rundown: RundownLine[];
  action: (formData: FormData) => void;
}) {
  const [preview, setPreview] = useState<BriefPreview | null>(null);
  /* Stable, so the panel's effect does not re-run on every render. */
  const onPreview = useCallback((p: BriefPreview | null) => setPreview(p), []);

  const stateOf = (id: string): 'woken' | 'asleep' | 'waiting' => {
    if (!preview) return 'waiting';
    return preview.desks.find((d) => d.id === id)?.woken ? 'woken' : 'asleep';
  };
  const becauseOf = (id: string): string | null =>
    preview?.desks.find((d) => d.id === id)?.because ?? null;

  return (
    <div className="overflow-hidden rounded-[14px] border border-hair2 bg-deep shadow-[0_24px_50px_-24px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-hair bg-[rgba(8,17,15,0.72)] px-4 py-3 text-dink">
        <span className="inline-flex items-center gap-2 rounded-full border border-holding/40 bg-holding/[0.07] px-2.5 py-[3px] font-data text-[9px] uppercase tracking-[0.16em] text-holding">
          <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-holding" />
          Room idle
        </span>
        <span className="font-display text-sm font-semibold tracking-[-0.02em]">
          Nothing in production — brief the floor
        </span>
        <span className="ml-auto font-data text-[11px] text-dmut">
          {preview
            ? `${preview.woken} of ${preview.total} desks would work on this`
            : `${DESKS.length} desks`}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_286px]">
        <div className="fl-space relative hidden min-h-[440px] md:block">
          <div className="fl-wall" />
          <div className="fl-grid" />
          <ProgramMonitor caption={null} running={false} />
          <RundownBoard lines={rundown} />

          <svg className="fl-wires" viewBox="0 0 700 560" preserveAspectRatio="none" aria-hidden>
            {WIRES.map(([from, to]) => (
              <path key={`${from}-${to}`} d={wirePath(from, to)} />
            ))}
          </svg>

          {DESKS.map((desk) => {
            const state = stateOf(desk.id);
            const because = becauseOf(desk.id);
            return (
              <div
                key={desk.id}
                className="fl-pod"
                data-state={state === 'woken' ? 'done' : state === 'asleep' ? 'skipped' : 'waiting'}
                style={{ left: desk.at.left, top: desk.at.top }}
                title={because ?? undefined}
              >
                <div className="mb-[5px] whitespace-normal break-words font-data text-[7.5px] uppercase leading-[1.35] tracking-[0.1em] text-faint">
                  {desk.team}
                </div>
                <div className="flex items-center gap-[7px]">
                  <span
                    className="fl-av"
                    style={{ color: state === 'asleep' ? '#8FA5A0' : desk.tint }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold leading-[1.2]">{desk.name}</span>
                    <span className="block text-[9.5px] leading-[1.25] text-dmut">{desk.role}</span>
                  </span>
                </div>
                <div
                  className={cx(
                    'mt-[7px] font-data text-[8.5px] leading-tight',
                    state === 'woken' ? 'text-brass' : 'text-faint',
                  )}
                >
                  {state === 'waiting'
                    ? 'waiting for a brief'
                    : state === 'woken'
                      ? '● needed'
                      : 'not needed'}
                </div>
              </div>
            );
          })}
        </div>

        <BriefPanel
          platforms={platforms}
          carriage={carriage}
          shapes={shapes}
          onPreview={onPreview}
          action={action}
        />

        {/*
          The phone's answer to the room. The horseshoe would overlap itself at
          390px, and the *information* in it — which desks this brief wakes, and
          why the rest stay dark — is a list. §5 of the build plan.
        */}
        <div className="border-t border-hair px-3 py-3 md:hidden">
          <div className="mb-2 font-data text-[8.5px] uppercase tracking-[0.14em] text-faint">
            {preview ? `${preview.woken} of ${preview.total} desks` : 'Who would work on this'}
          </div>
          <ul className="flex flex-col gap-1.5">
            {DESKS.map((desk) => {
              const state = stateOf(desk.id);
              const because = becauseOf(desk.id);
              return (
                <li key={desk.id} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={cx(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      state === 'woken' ? 'bg-brass' : 'bg-hair2',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        'block text-[12px] leading-tight',
                        state === 'woken' ? 'text-dink' : 'text-faint',
                      )}
                    >
                      {desk.name}
                    </span>
                    {/*
                      The reason is shown rather than hidden in a title — a
                      phone has no hover, so a tooltip is a reason nobody reads.
                    */}
                    {because ? (
                      <span className="block text-[10.5px] leading-snug text-dmut">{because}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
