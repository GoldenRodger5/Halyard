-- §236. A creative brief can exist before a concept does.
--
-- `creative_briefs.concept_id` was `not null`, which assumed concepts always
-- come first. They do not, and by design: §218 made concept generation an
-- *asynchronous* job precisely so a strategy-grade model call could not stall
-- a whole generate run. So `generate` plans a treatment, directs the creative
-- and writes a brief while the concept batch is still queued.
--
-- The first production run hit this immediately:
--   null value in column "concept_id" of relation "creative_briefs"
--
-- Nullable is the honest shape. A brief with no concept is a real state — it
-- means the plan came from the artifact and the idea rather than from a
-- concept a person chose — and the column still carries the link whenever one
-- exists, which is what makes "which concept produced this post" answerable
-- for the pieces where somebody did choose.
alter table creative_briefs alter column concept_id drop not null;

comment on column creative_briefs.concept_id is
  'The concept this brief was built from, when one was selected. Null is a real state: concept generation is asynchronous (§218), so a brief planned from the artifact alone has no concept to point at.';

-- The same assumption, one table over. A variant plan hangs off the brief, so
-- if a brief can exist without a concept then so can its variants.
alter table platform_variants alter column concept_id drop not null;

comment on column platform_variants.concept_id is
  'The concept this variant came from, when one was selected. Null for the same reason as creative_briefs.concept_id: concept generation is asynchronous.';

-- §236. The variant vocabulary gains `remix`, and loses nothing.
--
-- `platform_variants.decision` allowed produce | reuse | defer | skip, written
-- in §218 before anything filled the table. §231's planner needs one more
-- distinction, and it is the important one: **remix** — the same concept, a
-- materially different execution.
--
-- Without it there are only two answers to "should this go on Reels too":
-- post the identical file, or make something unrelated. The middle case is
-- the one that matters, because it is what separates a cross-post from a
-- feed that reads as automated.
--
-- `produce` and `defer` are kept. `produce` is what §218 called an original
-- and older rows may carry it; `defer` is a real decision the planner does not
-- make yet (a variant that should wait for a performance signal), and removing
-- a value to tidy the list would make it unavailable when it is wanted.
alter table platform_variants drop constraint if exists platform_variants_decision_check;
alter table platform_variants add constraint platform_variants_decision_check
  check (decision = any (array['original','remix','reuse','skip','produce','defer']));
