/**
 * §388. The week, as a running order.
 *
 * A rundown in a gallery is the list of what goes out and when, in order, with
 * the gaps visible. The gaps are the point — a calendar that only shows what
 * exists cannot tell you that Friday morning has nothing in it, and "nothing is
 * scheduled" and "nothing was commissioned" look identical from the outside.
 *
 * ## Open slots are real, not inferred
 *
 * `slots` has existed since the scheduler was written: a platform, a window, a
 * set of weekdays. An open slot is a slot occurrence in the next seven days
 * with no content item scheduled inside its window. That is a fact about the
 * configuration, not a guess — which matters, because the Rundown offers to
 * fill one and offering to fill a slot that does not exist would be worse than
 * showing nothing.
 */
import 'server-only';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';

export interface RundownEntry {
  kind: 'piece' | 'open';
  /** HH:mm in the operator's timezone. */
  at: string;
  /** Sort key. The real instant, so an open slot and a piece interleave properly. */
  atIso: string;
  platform: string;
  /** The piece's opening words, or the slot's name. */
  title: string;
  /** Platform · format · status, or null for an open slot. */
  detail: string | null;
  /** Content item id, for a piece. */
  id: string | null;
  status: string | null;
}

export interface RundownDay {
  /** "Thursday 4 September", in the operator's timezone. */
  label: string;
  /** What is going out. Listed individually — this is the running order. */
  entries: RundownEntry[];
  /**
   * The gaps, counted rather than listed.
   *
   * Seven platforms with four slots each is twenty-eight openings a day, and
   * listing them produced a nine-thousand-pixel page of one repeated sentence
   * — §362's lesson, exactly: a screen that shows everything shows nothing.
   *
   * A count is also the *truer* statement. An open slot next Tuesday is not a
   * problem; the daily run fills it. What an operator needs to know is how much
   * of the day is uncommissioned and on which platforms, and that is a number
   * and a list of names.
   */
  open: { count: number; platforms: string[] };
}

interface PieceRow {
  id: string;
  platform: string;
  format: string;
  status: string;
  scheduled_at: string;
  body: string;
  title: string | null;
  tz: string | null;
}

interface SlotRow {
  platform: string;
  name: string;
  window_start: string;
  window_end: string;
  weekdays: number[];
}

/**
 * The next seven days.
 *
 * Seven because a week is the unit an operator plans in, and because the mix
 * rules and the series cadences are both weekly.
 */
export async function readRundown(days = 7): Promise<{ days: RundownDay[]; timeZone: string }> {
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const [pieces, slots] = await Promise.all([
    query<PieceRow>(
      `select ci.id, ci.platform, ci.format, ci.status, ci.scheduled_at, ci.body, ci.title,
              (select operator_timezone from products order by (kind = 'product') desc limit 1) as tz
         from content_items ci
        where ci.scheduled_at between $1 and $2
          and ci.status not in ('rejected', 'expired')
        order by ci.scheduled_at`,
      [from.toISOString(), to.toISOString()],
    ),
    /*
     * Only slots on a platform with a connected account. A slot for a platform
     * you cannot post to is not an opportunity, and offering to fill it sends
     * the operator to a brief that cannot be delivered.
     */
    query<SlotRow>(
      `select s.platform, s.name, s.window_start::text, s.window_end::text, s.weekdays
         from slots s
        where s.enabled
          and exists (select 1 from social_accounts sa where sa.platform = s.platform)
        order by s.platform, s.window_start`,
    ),
  ]);

  const timeZone = pieces[0]?.tz ?? (await operatorTimeZone());

  const byDay = new Map<string, RundownEntry[]>();
  const openByDay = new Map<string, Set<string>>();
  const openCount = new Map<string, number>();

  const dayOf = (iso: string): string => formatInOperatorTz(iso, timeZone, 'EEEE d MMMM');
  const push = (entry: RundownEntry): void => {
    const key = dayOf(entry.atIso);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(entry);
  };

  /* Which (day, platform, slot-window) already has something in it. */
  const filled = new Set<string>();

  for (const piece of pieces) {
    push({
      kind: 'piece',
      at: formatInOperatorTz(piece.scheduled_at, timeZone, 'HH:mm'),
      atIso: piece.scheduled_at,
      platform: piece.platform,
      title: (piece.title || piece.body || '').replace(/\s+/g, ' ').trim(),
      detail: `${piece.platform} · ${piece.format} · ${piece.status.replace(/_/g, ' ')}`,
      id: piece.id,
      status: piece.status,
    });
    filled.add(occupancyKey(piece.scheduled_at, piece.platform, timeZone));
  }

  /*
   * Slot occurrences across the window. Computed in the operator's timezone
   * because that is the clock the rundown is read against — the slots table
   * stores a local wall-clock window, not an instant.
   */
  for (let d = 0; d < days; d += 1) {
    const day = new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
    const weekday = Number(formatInOperatorTz(day.toISOString(), timeZone, 'i'));
    const dayStamp = formatInOperatorTz(day.toISOString(), timeZone, 'yyyy-MM-dd');

    for (const slot of slots) {
      if (!slot.weekdays.includes(weekday)) continue;
      /*
       * The middle of the window, not its start. A slot is a *window* the
       * scheduler jitters within, and showing its opening minute would imply a
       * precision the scheduler deliberately does not have.
       */
      const at = middleOf(dayStamp, slot.window_start, slot.window_end);
      if (at.getTime() < from.getTime() || at.getTime() > to.getTime()) continue;
      if (filled.has(occupancyKey(at.toISOString(), slot.platform, timeZone))) continue;

      const key = dayOf(at.toISOString());
      openCount.set(key, (openCount.get(key) ?? 0) + 1);
      if (!openByDay.has(key)) openByDay.set(key, new Set());
      openByDay.get(key)!.add(slot.platform);
      /* The day must appear even when nothing is scheduled in it. */
      if (!byDay.has(key)) byDay.set(key, []);
    }
  }

  /*
   * Days are ordered by the day they represent, not by their first entry — a
   * day with only open slots has no first entry, and sorting on one dropped it
   * to the top.
   */
  const dayOrder = new Map<string, number>();
  for (let d = 0; d < days; d += 1) {
    const day = new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
    dayOrder.set(dayOf(day.toISOString()), d);
  }

  const ordered: RundownDay[] = [...byDay.entries()]
    .map(([label, entries]) => ({
      label,
      entries: entries.sort((a, b) => a.atIso.localeCompare(b.atIso)),
      open: {
        count: openCount.get(label) ?? 0,
        platforms: [...(openByDay.get(label) ?? [])].sort(),
      },
    }))
    .sort((a, b) => (dayOrder.get(a.label) ?? 99) - (dayOrder.get(b.label) ?? 99));

  return { days: ordered, timeZone };
}

/**
 * A slot is taken if something on that platform is scheduled the same day
 * within the same half of the day.
 *
 * Deliberately coarse. The scheduler jitters by minutes and an exact-instant
 * match would report every slot open while a piece sits four minutes inside it
 * — which is the failure that makes an "open slot" list useless.
 */
function occupancyKey(iso: string, platform: string, timeZone: string): string {
  const day = formatInOperatorTz(iso, timeZone, 'yyyy-MM-dd');
  const hour = Number(formatInOperatorTz(iso, timeZone, 'H'));
  const band = hour < 10 ? 'morning' : hour < 15 ? 'midday' : hour < 20 ? 'evening' : 'late';
  return `${day}:${platform}:${band}`;
}

function middleOf(dayStamp: string, start: string, end: string): Date {
  const s = new Date(`${dayStamp}T${start}Z`);
  let e = new Date(`${dayStamp}T${end}Z`);
  if (e.getTime() <= s.getTime()) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  return new Date((s.getTime() + e.getTime()) / 2);
}

async function operatorTimeZone(): Promise<string> {
  const rows = await query<{ tz: string }>(
    `select operator_timezone as tz from products order by (kind = 'product') desc limit 1`,
  );
  return rows[0]?.tz ?? 'UTC';
}
