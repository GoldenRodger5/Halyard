/*
 * §367. Which stage of a production an event came from.
 *
 * `job_events` is a flat chronological feed because a log line carries no
 * author, so the run view cannot group anything into lanes. The repair is
 * structural rather than per-call-site: a production is already a list of
 * stages, each stage is already the work of a known agent, and wrapping a
 * stage attributes everything logged inside it — including lines written by
 * code three modules down that has never heard of an agent.
 *
 * Nullable on purpose. An unattributed event is a real thing — the poller's
 * own bookkeeping, a scheduler decision, a handler not yet wrapped — and those
 * are exactly the messages that explain a run which produced nothing. They land
 * in a named system lane rather than being dropped.
 *
 * No constraint on the value. `STAGES` in TypeScript and a Postgres CHECK are
 * the same list written twice, which is gotcha 1 and has cost this project
 * three migrations already. The map in `stageAgents.ts` is covered by a test
 * that fails if a stage has no owner; that is the guarantee, and it lives
 * where a stage is actually added.
 */
alter table job_events add column if not exists stage text;

create index if not exists job_events_stage_idx on job_events (job_id, stage);
