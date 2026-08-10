import { formatInTimeZone } from 'date-fns-tz';

/**
 * Everything is stored UTC and rendered in the operator's timezone (build pack
 * §1). No component formats a date any other way.
 */
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
