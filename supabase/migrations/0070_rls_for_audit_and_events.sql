/*
 * §379. Two tables shipped without row-level security.
 *
 * `capture_audit` (0064) and `job_events` (0066) both went in without the
 * `enable`/`force` pair every other table in this schema carries. Nothing
 * exploited it — the application connects as the service role, which bypasses
 * RLS either way — but the rule here is that a table is protected by default
 * and the exceptions are argued for, and neither of these was.
 *
 * `schema.test.ts` has been asserting exactly this since the beginning, and it
 * caught both. Nobody saw it, because that test could not run: migrations 0061
 * and 0063 inserted product-scoped rows that fail on a clean database, so
 * `createIsolatedPool` could not build one and every database-backed test in
 * the repository skipped. A skipped test reports green.
 *
 * That is the actual lesson, and it is bigger than these two tables: 445 tests
 * were dark for a day, and the thing that hid them was a foreign key in a
 * migration.
 */
alter table capture_audit enable row level security;
alter table capture_audit force row level security;

alter table job_events enable row level security;
alter table job_events force row level security;
