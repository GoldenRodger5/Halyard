/**
 * Timezone resolution. Build pack §1.
 *
 * Three separate concepts, and they must never collapse into one field:
 *   storage           → always UTC
 *   audience_timezone → what a slot window means
 *   operator_timezone → what the UI renders
 *
 * Slots are wall-clock local, so 18:00 stays 18:00 across a DST transition. The
 * UTC instant is therefore computed at schedule time, never at slot-definition
 * time.
 */
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface SlotWindow {
  /** 'morning' | 'midday' | 'evening' | 'late' */
  name: string;
  /** 'HH:MM' or 'HH:MM:SS', wall-clock in the audience timezone. */
  windowStart: string;
  windowEnd: string;
  /** ISO weekdays the slot is active on. 1 = Monday. */
  weekdays?: number[];
}

export interface ResolvedSlot {
  name: string;
  /** Earliest UTC instant inside the window on the given local day. */
  startUtc: Date;
  /** Latest UTC instant inside the window on the given local day. */
  endUtc: Date;
  /** The wall-clock local day this resolves against, 'YYYY-MM-DD'. */
  localDate: string;
}

function parseTime(value: string): { hours: number; minutes: number; seconds: number } {
  const [h = '0', m = '0', s = '0'] = value.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  const seconds = Number(s);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    throw new Error(`Unparseable slot time: ${value}`);
  }
  return { hours, minutes, seconds };
}

/** 'YYYY-MM-DD' for an instant, as seen in a given timezone. */
export function localDateString(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

/** ISO weekday (1 = Monday) for an instant, as seen in a given timezone. */
export function localIsoWeekday(instant: Date, timeZone: string): number {
  const day = Number(formatInTimeZone(instant, timeZone, 'i'));
  return day;
}

/**
 * Turn a wall-clock local time on a given local day into a UTC instant.
 *
 * `fromZonedTime` resolves the offset that applies on that specific date, which
 * is the whole point: an 18:00 evening slot is 22:00Z in EDT and 23:00Z in EST,
 * and the scheduler must not hard-code either.
 */
export function localWallClockToUtc(
  localDate: string,
  timeOfDay: string,
  timeZone: string,
): Date {
  const { hours, minutes, seconds } = parseTime(timeOfDay);
  const stamp =
    `${localDate}T` +
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}`;
  return fromZonedTime(stamp, timeZone);
}

/** Resolve one slot on one local day to a UTC window. */
export function resolveSlot(
  slot: SlotWindow,
  localDate: string,
  audienceTimeZone: string,
): ResolvedSlot {
  const startUtc = localWallClockToUtc(localDate, slot.windowStart, audienceTimeZone);
  let endUtc = localWallClockToUtc(localDate, slot.windowEnd, audienceTimeZone);
  // A window that ends before it starts crosses midnight (e.g. 22:30 → 01:00).
  if (endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
  }
  return { name: slot.name, startUtc, endUtc, localDate };
}

/**
 * The next N occurrences of a slot at or after `from`, skipping local days the
 * slot is not active on.
 */
export function upcomingSlotOccurrences(
  slot: SlotWindow,
  audienceTimeZone: string,
  from: Date,
  count: number,
  horizonDays = 21,
): ResolvedSlot[] {
  const out: ResolvedSlot[] = [];
  const weekdays = slot.weekdays ?? [1, 2, 3, 4, 5, 6, 7];

  for (let dayOffset = 0; dayOffset <= horizonDays && out.length < count; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const localDate = localDateString(probe, audienceTimeZone);
    const resolved = resolveSlot(slot, localDate, audienceTimeZone);
    if (!weekdays.includes(localIsoWeekday(resolved.startUtc, audienceTimeZone))) continue;
    if (resolved.endUtc.getTime() <= from.getTime()) continue;
    out.push(resolved);
  }
  return out;
}

/** Render a UTC instant for the operator. UI-only; never used for scheduling. */
export function formatForOperator(
  instant: Date,
  operatorTimeZone: string,
  pattern = 'EEE d MMM, HH:mm zzz',
): string {
  return formatInTimeZone(instant, operatorTimeZone, pattern);
}

export { toZonedTime, fromZonedTime, formatInTimeZone };
