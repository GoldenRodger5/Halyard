/**
 * §385. What happened while you were away.
 *
 * The band no competitor can have, because in every other tool in this category
 * nothing happens while you sleep.
 *
 * ## Why "since the last long gap" rather than "since you last looked"
 *
 * Tracking a `last_seen_at` per operator would be the obvious thing and it is
 * worse: it resets every time you glance at the phone, so by mid-morning the
 * band says "1 piece made" and stops being interesting. What an operator
 * actually means by *overnight* is **the last stretch when nobody was watching**
 * — so this finds the most recent run of work bounded by a gap of four hours or
 * more, which is the shape of a night whatever time zone you are in.
 *
 * Returns `anything: false` when there is nothing to report, so the caller can
 * omit the band entirely. A band that appears every morning saying nothing
 * stops being read within a week.
 */
import 'server-only';
import { query } from '@/lib/db';

export interface Overnight {
  anything: boolean;
  /**
   * What to call the window.
   *
   * "While you slept" is only true if the window actually covers a night. A
   * band headed that way over a run that happened at two in the afternoon is a
   * small lie, and small lies in an interface are how an operator learns to
   * stop reading it.
   */
  heading: string;
  from: string;
  to: string;
  figures: Array<{ n: number; label: string }>;
}

/** A gap this long means nobody was watching. */
const QUIET_HOURS = 4;

export async function overnight(productId: string): Promise<Overnight> {
  const [window] = await query<{ started: string | null; ended: string | null }>(
    `with events as (
       select e.at,
              lag(e.at) over (order by e.at) as previous
         from job_events e
        where e.at > now() - interval '36 hours'
     ),
     gaps as (
       select at, previous,
              (previous is null or at - previous > interval '${QUIET_HOURS} hours') as after_a_gap
         from events
     ),
     runs as (
       select at, sum(case when after_a_gap then 1 else 0 end) over (order by at) as run
         from gaps
     )
     select min(at)::text as started, max(at)::text as ended
       from runs
      where run = (select max(run) from runs)`,
  );

  if (!window?.started || !window.ended) {
    return { anything: false, heading: '', from: '', to: '', figures: [] };
  }

  const [made] = await query<{ made: string; refused: string; replies: string }>(
    `select
       (select count(*)::text from content_items
         where product_id = $1 and created_at between $2 and $3)                       as made,
       (select count(*)::text from content_items
         where product_id = $1 and status = 'failed' and created_at between $2 and $3) as refused,
       (select count(*)::text from comments
         where suggested_reply is not null and first_seen_at between $2 and $3)       as replies`,
    [productId, window.started, window.ended],
  );

  const figures = [
    { n: Number(made?.made ?? 0), label: 'made' },
    { n: Number(made?.refused ?? 0), label: 'refused at the gate' },
    { n: Number(made?.replies ?? 0), label: 'replies drafted' },
  ].filter((f) => f.n > 0);

  const clock = (iso: string): string =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  /*
   * A window is "the night" if it crosses the small hours. Anything else is
   * simply the last stretch of work, and saying so is more useful than a
   * flattering heading that does not match the times printed beside it.
   */
  const startHour = new Date(window.started).getHours();
  const endHour = new Date(window.ended).getHours();
  const overnightish = startHour >= 21 || endHour <= 8 || endHour < startHour;

  return {
    anything: figures.length > 0,
    heading: overnightish ? 'While you slept' : 'Since you were last here',
    from: clock(window.started),
    to: clock(window.ended),
    figures,
  };
}
