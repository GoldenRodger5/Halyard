-- §304. Two compositions that were registered in Remotion and invisible here.
--
-- `chooseVideoComposition` and the format video builder both filter by the
-- account's enabled templates, and `Quiz` and `Walkthrough` have never had a
-- row. So the quiz format — catalogue entry, writer, question planner (§300),
-- five treatments (§302) — could not have produced a piece even once the video
-- path started consulting formats, and the walkthrough (§298) had the same
-- problem in the opposite direction: a composition nothing could ask for.
--
-- This is gotcha 1 in a second place. `JOB_KINDS` and `jobs_kind_check` are the
-- same list written twice; so are `root.tsx`'s compositions and this table.
-- `videoTemplateCoverage.test.ts` is what catches the next one.
--
-- §379. Guarded on the product existing.
--
-- This inserted rows referencing `product_id = 'recipefix'`, and a migration
-- runs against a database that has no products yet — products arrive in
-- `seed.sql`, which runs afterwards. So on any clean database this failed on
-- the foreign key, which meant `createIsolatedPool` could not build one, which
-- meant **every database-backed test in the repository silently skipped**: 453
-- of them, from the day this landed. A test that skips reports green.
--
-- Product-scoped seed data belongs in `seed.sql`, and these three rows were
-- already there — so this migration was duplicating the seed and failing on a
-- clean database to do it. Guarded rather than deleted: the databases that
-- already applied it must keep the rows, and re-running must be a no-op.
insert into templates (id, product_id, renderer, format, aspect_ratio, description, enabled)
select * from (values
  ('Quiz', 'recipefix', 'remotion', 'video', '9:16',
   'Five questions, a countdown, and a reveal that fills the right option', true),
  ('Walkthrough', 'recipefix', 'remotion', 'video', '9:16',
   'A screen recording inside a drawn phone, with callouts on the taps', true)
) as t(id, product_id, renderer, format, aspect_ratio, description, enabled)
where exists (select 1 from products where id = 'recipefix')
on conflict (id) do nothing;
