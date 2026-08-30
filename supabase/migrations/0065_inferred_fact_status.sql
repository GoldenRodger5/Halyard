-- §328. `inferred` is a fact status, and the check constraint did not know.
--
-- Gotcha 1, in the place the gotcha does not name: `FactStatus` in TypeScript
-- and `product_facts_status_check` in Postgres are the same list written twice.
-- Adding to the union typechecked cleanly, passed 2,483 tests, deployed, and
-- died on the first insert — which is exactly the sequence the gotcha
-- describes for `JOB_KINDS`.
--
-- The reason it is a separate status rather than a flag: `EVIDENTIAL_STATUSES`
-- decides what may back a public claim, and an inference may never. A boolean
-- beside the status would have to be checked by every consumer; a status they
-- already filter on cannot be forgotten.
alter table product_facts drop constraint if exists product_facts_status_check;
alter table product_facts add constraint product_facts_status_check
  check (status in ('unverified', 'verified', 'refuted', 'unverifiable', 'inferred'));
