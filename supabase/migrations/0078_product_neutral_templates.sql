-- §518. A second product could not render anything.
--
-- Every template except two pins was owned by `recipefix`, and
-- `enabledTemplates` reads `where product_id = $1 or product_id is null`. So
-- Kinolog — a real product with forty-nine facts and eight evidence pages —
-- had `pin_stack` and `pin_quote` and no way to make a video or a carousel at
-- all. Every quality improvement this system has had was therefore measured
-- against one product, which is the definition of overfitting.
--
-- The split is not a judgement call; it is visible in which file builds the
-- props:
--
--   packages/render/src/video/formatVideo.ts   → Narrative, Quiz, Walkthrough
--   packages/render/src/image/formatSlides.ts  → carousel_6
--     Built from a format's **written slots**. They draw whatever words they
--     are given, in the product's own brand tokens. Nothing about a recipe.
--
--   packages/render/src/video/artifactProps.ts → TransformationDiff,
--     ChefNoteCard, ScalingMath, SubstitutionExplainer, and the image cards
--     transformation_diff_*, substitution_ratio, scaling_math,
--     chef_note_quote. Built from a **recipe adaptation** — swaps, ratios,
--     servings. These stay with RecipeFix, because they draw a shape only
--     RecipeFix produces.
--
-- `pinterest_tall` takes title/subtitle/bullets and is slot-shaped like its
-- two siblings, which are already product-neutral.

update templates
   set product_id = null
 where id in ('Narrative', 'Quiz', 'Walkthrough', 'carousel_6', 'pinterest_tall');

comment on column templates.product_id is
  '§518. Null means any product may use it: the template draws written slots '
  'and brand tokens and knows nothing about the product. A product id means it '
  'draws that product''s own artifact shape. Adding a format template scoped to '
  'one product is how the second product silently loses a channel.';
