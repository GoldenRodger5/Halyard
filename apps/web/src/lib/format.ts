import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Everything is stored UTC and rendered in the operator's timezone (build pack
 * §1). No component formats a date any other way.
 */

/**
 * An instant, as the value of a `<input type="datetime-local">`.
 *
 * These inputs carry *wall time with no zone*, so the only correct value is the
 * clock reading in the operator's timezone. Using `toISOString().slice(0, 16)`
 * — the obvious thing — writes UTC into a field the browser then presents as
 * local, so the pre-filled value silently disagrees with the label beside it and
 * submitting without editing moves the item by the UTC offset.
 */
export function toDatetimeLocalValue(
  iso: string | Date | null | undefined,
  timeZone: string,
): string {
  if (!iso) return '';
  try {
    return formatInTimeZone(new Date(iso), timeZone, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

/**
 * The inverse: a wall-clock string from such an input, read as the operator's
 * local time rather than the server's.
 *
 * `new Date('2026-09-18T09:00')` uses whatever zone the *server* runs in, which
 * on Vercel is UTC and is never what the operator meant.
 */
export function fromDatetimeLocalValue(
  value: string,
  timeZone: string,
): Date | null {
  if (!value) return null;
  try {
    const parsed = fromZonedTime(value, timeZone);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function formatInOperatorTz(
  iso: string | null | undefined,
  timeZone: string,
  pattern = "EEE d MMM 'at' HH:mm",
): string {
  if (!iso) return '—';
  try {
    return formatInTimeZone(new Date(iso), timeZone, pattern);
  } catch {
    return '—';
  }
}

export function formatRelative(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const deltaSeconds = Math.round((Date.now() - then) / 1000);

  if (Math.abs(deltaSeconds) < 60) return deltaSeconds >= 0 ? 'just now' : 'in under a minute';
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return minutes > 0 ? `${minutes} min ago` : `in ${-minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  return formatInOperatorTz(iso, timeZone, 'd MMM');
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A duration in seconds, as an operator would say it.
 *
 * Deliberately coarse: reply latency is read to answer "fast or slow", and
 * "1h 47m 12s" invites arithmetic nobody wanted to do. Rounds to the largest
 * unit that still carries the answer.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = seconds / 3600;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * §393. A timestamp's instant, whatever `pg` handed back.
 *
 * node-postgres decodes `timestamptz` to a JavaScript **Date**, and this
 * codebase types those columns as `string` because that is what they are on the
 * wire and in JSON. Both are true and the mismatch is harmless until something
 * calls a string method on one: `created_at.localeCompare(...)` threw
 * *"a.created_at.localeCompare is not a function"* on the Gallery, and the same
 * line in the Rundown was one scheduled post away from doing it too.
 *
 * Sorting by time goes through here. `new Date()` accepts both, so this is
 * correct for whichever the driver decides to give us.
 */
export function whenMs(value: string | Date | null | undefined): number {
  if (!value) return 0;
  return new Date(value).getTime();
}
