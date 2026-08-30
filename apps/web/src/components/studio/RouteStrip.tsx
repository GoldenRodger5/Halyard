/**
 * §386. Six dots and five legs — the shape of a run at a glance.
 *
 * A leg is lit when the run got *past* the stop behind it, which includes
 * getting past a refusal. A refusal is not the end of a run in this system;
 * most are followed by an attempt that passed, and drawing the line dead after
 * a red dot would say the opposite of what happened.
 */
import { cx } from '@halyard/ui/studio';
import type { Route, StopState } from '@/lib/studio/route';

const DOT: Record<StopState, string> = {
  done: 'bg-passed',
  refused: 'bg-onair',
  now: 'bg-lit',
  ahead: 'bg-rule2',
};

/** Reached, in either sense. Both light the leg out of the stop. */
const PAST = new Set<StopState>(['done', 'refused']);

export function RouteStrip({ route }: { route: Route }) {
  return (
    <div>
      <div className="flex flex-wrap items-center">
        {route.stops.map((stop, i) => (
          <div key={stop.key} className="flex items-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cx(
                  'mx-[3px] mb-[13px] h-0.5 w-[22px]',
                  PAST.has(route.stops[i - 1]!.state) ? 'bg-passed' : 'bg-rule2',
                )}
              />
            ) : null}
            <span className="flex flex-col items-center gap-1" title={`${stop.label} — ${stop.means}`}>
              <span aria-hidden className={cx('h-2.5 w-2.5 rounded-full', DOT[stop.state])} />
              <span className="font-data text-[8.5px] text-quiet">{stop.label}</span>
            </span>
          </div>
        ))}
      </div>
      {route.note ? <p className="mt-2.5 text-[11.5px] leading-snug text-quiet">{route.note}</p> : null}
    </div>
  );
}
