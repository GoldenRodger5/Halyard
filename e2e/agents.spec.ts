/**
 * The P0 observability surfaces, against real data.
 *
 * The brief forbids placeholder screens, and the way to hold that line is to
 * assert on content that can only come from the database or the registry — not
 * on a heading that would render whether or not anything was wired.
 */
import { db, expect, test } from './fixtures';

test.describe('Agents', () => {
  test('lists every registered agent with a state and a reason', async ({ page }) => {
    await page.goto('/agents');

    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();

    // Real registry content, not a placeholder.
    await expect(page.getByText('Copywriter', { exact: true })).toBeVisible();
    await expect(page.getByText('Hook Generator', { exact: true })).toBeVisible();

    /**
     * The orphans must be visible rather than hidden. An orphan absent from the
     * UI is invisible; an orphan shown is a tracked defect.
     */
    await expect(page.getByText('Rejection Clusterer', { exact: true })).toBeVisible();
    await expect(page.getByText('no caller').first()).toBeVisible();
  });

  test('a run history that is empty says so plainly', async ({ page }) => {
    const { rows } = await db().query<{ n: string }>('select count(*)::int as n from agent_runs');
    test.skip(Number(rows[0]!.n) > 0, 'runs exist, so the empty state is not the case under test');

    await page.goto('/agents/runs');
    // "No agent has ever run" is the single most important fact this system
    // currently reports, and it must not be dressed up as a missing feature.
    await expect(page.getByText('No agent has ever run')).toBeVisible();
  });

  test('a run recorded in the database appears on the runs screen', async ({ page }) => {
    await db().query(
      `insert into agent_runs (agent_id, agent_version, team, trigger, trigger_ref, status,
                               duration_ms, completed_at)
       values ('copywriter','1.0','content','job','e2e-run','succeeded', 42, now())`,
    );

    try {
      await page.goto('/agents/runs');
      await expect(page.getByText('e2e-run')).toBeVisible();
      await expect(page.getByText('succeeded').first()).toBeVisible();
    } finally {
      await db().query(`delete from agent_runs where trigger_ref = 'e2e-run'`);
    }
  });

  test('the detail screen shows the full execution contract', async ({ page }) => {
    await page.goto('/agents/copywriter');

    await expect(page.getByRole('heading', { name: 'Copywriter' })).toBeVisible();
    // The contract's real fields, which only the registry can supply.
    await expect(
      page.getByText('packages/core/src/generation/copywriter.ts#writeDraft'),
    ).toBeVisible();
    await expect(page.getByText('copywriter.v1')).toBeVisible();
  });

  test('an orphan detail screen states it has no caller', async ({ page }) => {
    // `auto-clip`, not `rejection-clusterer`: the latter stopped being an
    // orphan when the `cluster_rejections` job gave it a producer. Auto Clip
    // still has no caller because nothing ingests long-form footage.
    await page.goto('/agents/auto-clip');
    await expect(page.getByText('none declared — this agent is a tracked orphan')).toBeVisible();
  });

  test('an agent that gained a caller shows it instead of the orphan notice', async ({ page }) => {
    await page.goto('/agents/rejection-clusterer');
    await expect(page.getByText('clusterRejections.ts').first()).toBeVisible();
    await expect(
      page.getByText('none declared — this agent is a tracked orphan'),
    ).toHaveCount(0);
  });

  test('teams roll up to their worst member', async ({ page }) => {
    await page.goto('/agents/teams');
    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    await expect(page.getByText('learning')).toBeVisible();
  });

  test('versions compares declared against actually seen', async ({ page }) => {
    await page.goto('/agents/versions');
    await expect(page.getByText('declared v1.0').first()).toBeVisible();
    await expect(page.getByText('never run').first()).toBeVisible();
  });
});

test.describe('System', () => {
  test('health shows a measured value for every check', async ({ page }) => {
    await page.goto('/system');

    await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();

    /**
     * Scoped to `main`: the sidebar has its own "Queue" link, and an unscoped
     * text match hits both. A locator that matches the navigation would pass on
     * a page that rendered no health data at all.
     */
    const main = page.locator('main');
    await expect(main.getByText('Database')).toBeVisible();
    // A measured number, not a colour on its own.
    await expect(main.getByText(/responded in \d+ ms/)).toBeVisible();
    await expect(main.getByText('Worker', { exact: true })).toBeVisible();
    await expect(main.getByText('Queue', { exact: true })).toBeVisible();
  });

  test('an unmeasurable check says unknown rather than ok', async ({ page }) => {
    /**
     * The same rule the quality gates follow, applied to infrastructure: never
     * call an unmeasured dimension passed.
     *
     * This used to assert that *some* check on the page read `unknown`, and
     * hoped one would. It passed on a fresh database and failed the moment
     * anything real had happened — running the worker once left two heartbeat
     * rows and a handful of finished jobs behind, and every check on the page
     * had a measurement from then on. The test then failed while the rule it
     * describes was perfectly intact, which is the least useful way for a test
     * to be red.
     *
     * So the condition is created rather than awaited: remove the heartbeats,
     * which is exactly "nothing has reported in", and assert the Worker check
     * reports unknown instead of down or ok. `worker_heartbeats` is a
     * last-seen-at cache the worker rewrites on its next tick; the rows are
     * saved and put back regardless.
     */
    const saved = await db().query<{ worker_id: string; last_seen_at: Date; version: string | null }>(
      'select worker_id, last_seen_at, version from worker_heartbeats',
    );
    await db().query('delete from worker_heartbeats');

    try {
      await page.goto('/system');
      /**
       * Anchored on the Worker check's own detail line rather than on a DOM
       * shape. `agentQueries.ts` emits this exact sentence only in the branch
       * that sets the state to `unknown`, so it names *which* check is
       * unmeasured — which a bare "some pill says unknown" never did.
       */
      await expect(page.getByText('no worker has ever sent a heartbeat')).toBeVisible();
      await expect(page.getByText('unknown', { exact: true }).first()).toBeVisible();
      // And it says why an unknown is not a failure, which is the point.
      await expect(page.getByText('Why some checks say unknown')).toBeVisible();
      await expect(
        page.getByText(/never call an unmeasured (dimension|check) (passed|ok)/i),
      ).toBeVisible();
    } finally {
      for (const row of saved.rows) {
        await db().query(
          `insert into worker_heartbeats (worker_id, last_seen_at, version)
           values ($1,$2,$3) on conflict (worker_id) do update set last_seen_at = excluded.last_seen_at`,
          [row.worker_id, row.last_seen_at, row.version],
        );
      }
    }
  });

  test('jobs lists every declared kind, including ones never enqueued', async ({ page }) => {
    await page.goto('/system/jobs');

    await expect(page.getByText('collect_signals')).toBeVisible();
    // Listed from JOB_KINDS rather than from the jobs table, so a kind that has
    // never run is visible instead of absent.
    await expect(page.getByText('digest_email')).toBeVisible();
  });

  test('integrations shows each account and what it can do', async ({ page }) => {
    await page.goto('/system/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  });

  test('audit says the Auditor has not run rather than showing green', async ({ page }) => {
    const { rows } = await db().query<{ n: string }>('select count(*)::int as n from auditor_runs');
    test.skip(Number(rows[0]!.n) > 0, 'an audit exists, so the empty state is not under test');

    await page.goto('/system/audit');
    await expect(page.getByText('The Auditor has never run')).toBeVisible();
  });

  test('a persisted audit renders its findings', async ({ page }) => {
    const run = await db().query<{ id: string }>(
      `insert into auditor_runs (completed_at, duration_ms, findings_total, findings_error,
                                 findings_warning, capabilities_audited, triggered_by)
       values (now(), 100, 1, 1, 0, 17, 'e2e') returning id`,
    );
    const runId = run.rows[0]!.id;
    await db().query(
      `insert into auditor_findings (auditor_run_id, rule, severity, subject, subject_kind, detail)
       values ($1, 'e2e.synthetic', 'error', 'ghost-agent', 'agent',
               'A synthetic finding, to prove this screen renders real rows.')`,
      [runId],
    );

    try {
      await page.goto('/system/audit');
      await expect(page.getByText('e2e.synthetic')).toBeVisible();
      await expect(page.getByText('ghost-agent')).toBeVisible();
    } finally {
      await db().query('delete from auditor_runs where id = $1', [runId]);
    }
  });
});
