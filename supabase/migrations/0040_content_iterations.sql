/*
 * §165 — bounded self-correction.
 *
 * A failing QC verdict used to be terminal: `review_media` set the item to
 * `failed` and a person dealt with it. This table is the history of Halyard
 * trying to fix it first.
 *
 * ## One row per iteration, written once
 *
 * A row is written at the moment its verdict is known, complete: the gates for
 * that iteration, the defects found in it, and the correction chosen *in
 * response to* it. The correction that produced iteration N is therefore
 * recorded on row N-1, which is what lets every row be final at insert time and
 * the whole table be append-only.
 *
 * ## Append-only, enforced
 *
 * The operator-facing promise of this feature is a readable history —
 * "version 0 failed because X, version 1 attempted Y, version 2 passed". A
 * history that can be rewritten is not evidence of anything, and this codebase
 * has already watched `qc_results` get overwritten a few minutes after being
 * measured (§151). So UPDATE and DELETE are refused by a trigger rather than by
 * convention.
 *
 * `on delete cascade` from `content_items` is deliberately still allowed: the
 * trigger guards edits to history, not the removal of an item that no longer
 * exists.
 */
create table content_iterations (
  id                uuid primary key default gen_random_uuid(),
  content_item_id   uuid not null references content_items(id) on delete cascade,

  /** 0 is the original generation. 1..3 are corrections. */
  iteration         integer not null check (iteration >= 0),
  /** Null only for iteration 0, so the chain is explicit rather than implied by order. */
  parent_iteration  integer check (parent_iteration >= 0),

  -- ── What this iteration was judged to be ────────────────────────────────
  gates             jsonb   not null default '[]'::jsonb,
  defects           jsonb   not null default '[]'::jsonb,
  /** Snapshot the regression check reads: evidence paths, captions, audio, beats. */
  snapshot          jsonb   not null default '{}'::jsonb,

  -- ── What was done about it ──────────────────────────────────────────────
  /** The correction chosen in response to this iteration. Null when none was. */
  action            text,
  /** Why, in one line an operator can read. */
  reason            text,
  /** Components the correction actually wrote — not the ones it was allowed to. */
  changed           text[] not null default '{}',
  /** Gates whose input the correction reached, and which must be re-established. */
  invalidated       text[] not null default '{}',
  /** Regressions found when judging this iteration against its parent. */
  regressions       jsonb  not null default '[]'::jsonb,

  -- ── What it produced ────────────────────────────────────────────────────
  body              text,
  vo_asset_id       uuid,
  render_id         uuid,

  -- ── Cost, from existing telemetry ───────────────────────────────────────
  /**
   * Agent spend recorded while this iteration was being produced.
   *
   * Summed from `agent_runs.cost_usd` over the window between the previous
   * iteration and this one. It is a window attribution rather than a per-item
   * ledger, because `agent_runs.trigger_ref` holds a job id — stated plainly so
   * nobody later reads it as an exact figure. Reusing the existing telemetry
   * was the point; a second cost system would be a second thing to keep true.
   */
  cost_usd          numeric(10,6) not null default 0,
  duration_ms       integer,

  outcome           text not null check (outcome in (
                      'generated',            -- iteration 0, before any correction
                      'corrected',            -- a correction was applied in response
                      'accepted',             -- required gates pass; goes to approval
                      'rejected_regression',  -- cleared its target but broke something else
                      'escalated',            -- cannot be fixed by generating differently
                      'exhausted'             -- budget spent, best iteration preserved
                    )),

  created_at        timestamptz not null default now(),

  unique (content_item_id, iteration)
);

create index content_iterations_item_idx
  on content_iterations (content_item_id, iteration);

create index content_iterations_outcome_idx
  on content_iterations (outcome, created_at desc)
  where outcome in ('escalated', 'exhausted');

-- RLS, matching every other table here: enabled AND forced, one admin_all policy
-- gated on public.is_admin(), no privileges for anon or authenticated.
-- `schema.test.ts` asserts this for every table, and caught its absence here.
alter table content_iterations enable row level security;
alter table content_iterations force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'content_iterations' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.content_iterations for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.content_iterations from %I', r);
    end if;
  end loop;
end $$;

create or replace function content_iterations_are_append_only()
returns trigger
language plpgsql
as $$
begin
  /*
   * A cascade from `content_items` is the one deletion that must still work.
   *
   * The first version of this refused *every* delete, which made the
   * `on delete cascade` above dead and meant an item with any correction
   * history could never be removed — a retention purge or an erasure request
   * would fail on a foreign key that the trigger then refused to let anyone
   * clear. The comment claimed the cascade was allowed; it was not, and the
   * test that was supposed to prove it passed vacuously against an empty
   * database.
   *
   * Postgres deletes the parent row before the cascading children, so by the
   * time this fires for a cascade the item is already gone. That absence is
   * the signal, and it is not forgeable by a direct delete: the item is still
   * there when someone tries to delete its history on its own.
   */
  if tg_op = 'DELETE'
     and not exists (select 1 from content_items where id = old.content_item_id) then
    return old;
  end if;

  /*
   * plpgsql's only placeholder is a bare `%`; `%s` prints the substitution and
   * then a literal "s". The first version used `%d` and read "cannot be
   * deleted" purely by that accident.
   */
  raise exception
    'content_iterations is append-only: iteration % of item % cannot be %',
    coalesce(old.iteration, -1),
    old.content_item_id,
    case tg_op when 'DELETE' then 'deleted' else 'updated' end;
end;
$$;

create trigger content_iterations_no_update
  before update on content_iterations
  for each row execute function content_iterations_are_append_only();

create trigger content_iterations_no_delete
  before delete on content_iterations
  for each row execute function content_iterations_are_append_only();

/*
 * The new job kind.
 *
 * Gotcha 1: `JOB_KINDS` in TypeScript and `jobs_kind_check` in Postgres are the
 * same list written twice. Adding to one typechecks cleanly and fails at the
 * first insert; migrations 0024, 0028, 0031 and 0033 all exist because of it.
 * `handlerCoverage.test.ts` compares the two against a real database.
 */
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate', 'render', 'tts', 'capture', 'publish',
  'collect_metrics', 'collect_signals', 'collect_comments', 'collect_attribution',
  'refresh_tokens', 'score_performance', 'digest_email', 'reconcile_schedule',
  'mark_stale_assets', 'collect_app_store', 'detect_release', 'collect_watch_terms',
  'draft_newsletter', 'send_newsletter', 'collect_reviews', 'review_media',
  'verify_feature', 'explore_product', 'collect_product_evidence',
  'build_product_brain', 'verify_provider_capability', 'cluster_rejections',
  'purge_logs',
  /** §165: diagnose a failing verdict and apply the smallest correction. */
  'correct_content'
));

/*
 * A notification kind for the loop giving up.
 *
 * Reusing `render_failure` would have been one line cheaper and would have
 * mislabelled every escalation — a correction stopped because a product has no
 * configured destination is not a render failure, and an operator filtering
 * their notifications would never find it. `notifications.kind` is another list
 * written twice, so this is amended the same way `jobs_kind_check` is.
 */
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'auth_failure', 'duplicate_publish_abort', 'queue_depth', 'worker_missing',
  'render_failure', 'digest', 'connector_down',
  /** §165: bounded self-correction stopped and a person needs to look. */
  'correction_stopped'
));
