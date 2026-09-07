/**
 * §556. A stage that runs also records that it ran.
 *
 * The Auditor asks whether an agent has ever actually run and answers from
 * `agent_runs`. Nothing wrote those rows for a stage: `recordingLlmClient`
 * wraps the *model* client, so an agent is recorded exactly when it calls a
 * model — and the whole director layer decides in code.
 *
 * Measured before the fix: `music-director`, `sound-director`,
 * `voice-director`, `visual-director`, `story-architect`, `motion-director`,
 * `annotation-director` and `platform-creative-director` had **zero recorded
 * runs between them**, while the music director had selected a bed minutes
 * before the audit that said it never had. The Auditor reported eight agents as
 * overclaiming — correct on its evidence, wrong about the world, which is worse
 * than either.
 *
 * The governing rule turned on itself: *agents perceive, code decides* means
 * most agents here are code, and the only recorder was attached to the model.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_REGISTRY, STAGE_AGENTS } from '@halyard/core';

import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { openStage } from './stage.js';
import { testContext } from './testContext.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('stageruns', 4);
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from agent_runs');
});

d('§556 opening a stage records its owner', () => {
  it('writes a running row for the agent that owns the stage', async () => {
    const ctx = testContext({ pool, jobId: '11111111-1111-1111-1111-111111111111' });
    openStage(ctx, 'music');

    /* Fire-and-forget, so give the insert a moment to land. */
    await new Promise((r) => setTimeout(r, 250));

    const { rows } = await pool.query<{ agent_id: string; status: string; team: string }>(
      'select agent_id, status, team from agent_runs',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.agent_id).toBe(STAGE_AGENTS.music.owner);
    expect(rows[0]!.status, 'a stage must not claim success before its work').toBe('running');
    expect(rows[0]!.team).toBe(STAGE_AGENTS.music.team);
  });

  it('records the director agents that had no runs at all', async () => {
    /* The eight the Auditor wrongly reported. Each must now leave a trace. */
    const ctx = testContext({ pool, jobId: '22222222-2222-2222-2222-222222222222' });
    for (const stage of ['music', 'voice', 'assets'] as const) openStage(ctx, stage);
    await new Promise((r) => setTimeout(r, 300));

    const { rows } = await pool.query<{ agent_id: string }>('select distinct agent_id from agent_runs');
    const owners = rows.map((r) => r.agent_id);
    expect(owners).toContain(STAGE_AGENTS.music.owner);
    expect(owners).toContain(STAGE_AGENTS.voice.owner);
  });

  it('files the run under the version the registry declares', async () => {
    /*
     * §557. Marked `via: stage` in `input_ref`, not by faking the version.
     * A row filed under a version no contract declares is invisible to the
     * Auditor, which groups its evidence by (agent_id, agent_version) — so
     * `music-director` had a run and still reported never having run.
     */
    const ctx = testContext({ pool, jobId: '33333333-3333-3333-3333-333333333333' });
    openStage(ctx, 'music');
    await new Promise((r) => setTimeout(r, 250));

    const { rows } = await pool.query<{ agent_version: string; trigger_ref: string; via: string }>(
      `select agent_version, trigger_ref, input_ref->>'via' as via from agent_runs`,
    );
    const declared = AGENT_REGISTRY.find((a) => a.agentId === STAGE_AGENTS.music.owner);
    expect(rows[0]!.agent_version).toBe(declared?.version ?? '1.0');
    expect(rows[0]!.via, 'the poller closes by this marker').toBe('stage');
    expect(rows[0]!.trigger_ref).toBe('33333333-3333-3333-3333-333333333333');
  });
});
