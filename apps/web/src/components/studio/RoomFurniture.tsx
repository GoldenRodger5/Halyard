/**
 * §387. The two things on the wall of the room.
 *
 * A **program monitor** showing what is being made, and a **rundown board**
 * showing what is going out today. Both are in the prototype and both are real
 * reads — and without them the room is six desks floating in a dark box, which
 * looks like a diagram rather than a place.
 *
 * They are shared between the briefing room and the live floor deliberately.
 * The furniture does not move when the room starts working; only the people do.
 */
import { cx } from '@halyard/ui/studio';

export interface RundownLine {
  /** HH:mm in the operator's timezone, or a dash when unscheduled. */
  at: string;
  platform: string;
  /** What state it is in, in one word. */
  state: string;
  /** The lamp beside it. */
  tone: 'ready' | 'working' | 'holding' | 'onair' | 'dark';
}

const TONE: Record<RundownLine['tone'], string> = {
  ready: 'bg-clear',
  working: 'bg-brass',
  holding: 'bg-holding',
  onair: 'bg-tally',
  dark: 'bg-hair2',
};

/** What is being made right now, on the wall where everyone can see it. */
export function ProgramMonitor({
  caption,
  running,
}: {
  caption: string | null;
  running: boolean;
}) {
  return (
    <div className="absolute left-1/2 top-3 z-[3] w-[180px] -translate-x-1/2 overflow-hidden rounded-[7px] border border-hair2 bg-[#0B1413] shadow-[0_14px_34px_-14px_rgba(0,0,0,0.9),0_0_44px_-16px_rgba(217,164,65,0.35)]">
      <div
        className={cx(
          'relative h-[84px]',
          running
            ? 'bg-gradient-to-br from-[#C6B79F] to-[#7E6A55]'
            : 'bg-[repeating-linear-gradient(45deg,#1A2422,#1A2422_5px,#141D1C_5px,#141D1C_10px)]',
        )}
      >
        <span
          className={cx(
            'absolute inset-x-[7px] bottom-[6px] font-display text-[10px] font-extrabold leading-[1.2] text-white',
            '[text-shadow:0_2px_9px_rgba(0,0,0,0.75)]',
            !running && 'opacity-50',
          )}
        >
          {caption ?? 'No programme'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#101817] px-2 py-[5px] font-data text-[8px] uppercase tracking-[0.14em] text-[#8FA5A0]">
        <span
          aria-hidden
          className={cx('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse bg-tally' : 'bg-hair2')}
        />
        {running ? 'program · what we’re making' : 'program · standing by'}
      </div>
    </div>
  );
}

/** Today's running order, on the wall. Empty is a real state and says so. */
export function RundownBoard({ lines }: { lines: RundownLine[] }) {
  return (
    <div className="absolute left-[18px] top-4 z-[3] w-[124px] rounded-md border border-hair bg-[rgba(24,43,40,0.72)] px-2.5 py-2.5 text-dmut">
      <div className="mb-1.5 font-data text-[7px] uppercase tracking-[0.16em] text-faint">
        Today’s rundown
      </div>
      {lines.length === 0 ? (
        <div className="text-[9px] leading-snug text-faint">Nothing scheduled today.</div>
      ) : (
        lines.slice(0, 4).map((line, i) => (
          <div key={i} className="mb-[3px] flex items-center gap-[5px] text-[9px]">
            <span aria-hidden className={cx('h-[5px] w-[5px] shrink-0 rounded-sm', TONE[line.tone])} />
            <span className="truncate">
              {line.at} · {line.platform} · {line.state}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
