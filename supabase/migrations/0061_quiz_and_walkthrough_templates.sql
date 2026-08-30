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
insert into templates (id, product_id, renderer, format, aspect_ratio, description, enabled)
values
  ('Quiz', 'recipefix', 'remotion', 'video', '9:16',
   'Five questions, a countdown, and a reveal that fills the right option', true),
  ('Walkthrough', 'recipefix', 'remotion', 'video', '9:16',
   'A screen recording inside a drawn phone, with callouts on the taps', true)
on conflict (id) do nothing;
