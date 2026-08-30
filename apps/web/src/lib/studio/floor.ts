/**
 * §384. What the floor is doing, right now.
 *
 * The corridor light is on every screen, so this runs on every request. It is
 * one indexed query against the newest event of the newest running job, and it
 * returns a sentence rather than a status code — "Writers' room · attempt 2"
 * is a thing an operator understands without a legend.
 *
 * Reads `job_events.stage` and `STAGE_AGENTS`, both of which shipped in §367.
 * Nothing new is stored for this.
 */
import 'server-only';
import { agentsForStage } from '@halyard/core';
import { query } from '@/lib/db';
import type { FloorState } from '@/components/studio/StudioShell';

export async function readFloor(): Promise<FloorState> {
  const rows = await query<{ stage: string | null; message: string; detail: Record<string, unknown> | null }>(
    `select e.stage, e.message, e.detail
       from job_events e
       join jobs j on j.id = e.job_id
      where j.status = 'running'
      order by e.id desc
      limit 1`,
  );

  const latest = rows[0];
  if (!latest) {
    /*
     * Idle is a real state and says so. "Nothing" would read as broken; the
     * room being quiet is normal and worth stating plainly.
     */
    return { working: false, who: 'The room is idle', what: 'Nothing in production' };
  }

  const agents = agentsForStage(latest.stage ?? '');
  /*
   * `researcher` → `Researcher`. Done here rather than with a CSS
   * `capitalize`, which title-cases every word and turned "The room is idle"
   * into "The Room Is Idle".
   */
  const who = agents.owner.charAt(0).toUpperCase() + agents.owner.slice(1);
  const because =
    typeof latest.detail?.because === 'string'
      ? latest.detail.because
      : typeof latest.detail?.reason === 'string'
        ? latest.detail.reason
        : latest.message;

  return { working: true, who, what: because };
}
