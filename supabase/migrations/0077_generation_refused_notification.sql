-- §507. A piece refused before it existed left no trace an operator could see.
--
-- `myth_fact` was sent from the Floor, the writer could not cite its claims,
-- and the format was refused three times — which is the citation rule working.
-- But the refusal happens *before* the content item is inserted, so there was
-- no row to mark failed, nothing in the Gallery, and no notification: the
-- operator pressed send and got silence, having spent a research pass and
-- three writing attempts.
--
-- The reason lives in `job_events`, which is a developer's surface. This kind
-- puts it where the operator already looks.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'auth_failure',
    'duplicate_publish_abort',
    'queue_depth',
    'worker_missing',
    'render_failure',
    'digest',
    'connector_down',
    'correction_stopped',
    'generation_refused'
  ));

comment on constraint notifications_kind_check on notifications is
  '§507. Kept in step with the kinds the worker writes. Adding a kind in code '
  'without adding it here typechecks and fails at the first insert — gotcha 1, '
  'a third table.';
