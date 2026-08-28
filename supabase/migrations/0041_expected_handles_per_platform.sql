-- §175. The brand's handle differs per platform, so the expectation must too.
--
-- Migration 0014 seeded `expected_handles = {"brand":"recipefix"}` before any
-- account existed. It was a guess, and it was wrong on three platforms: the
-- product is @Recipe_Fix on X and @recipe.fix on Instagram and Threads. A real,
-- correct authorisation of @Recipe_Fix was therefore reported as the wrong
-- account.
--
-- The comparison was never at fault — it has always folded case. Folding `_` and
-- `.` as well would have "fixed" this by making @recipefix, @recipe_fix and
-- @recipe.fix indistinguishable, and those are three usernames three different
-- people can own. The expectation was wrong, not the check.
--
-- Keys are `"<persona>"` with an optional `"<persona>:<platform>"` override, so
-- the general value keeps applying wherever it is still right (TikTok, Pinterest
-- and YouTube all really are `recipefix`).
--
-- Written with jsonb_build_object rather than a literal so re-running is safe.
update products
   set expected_handles = expected_handles || jsonb_build_object(
         'brand',            'recipefix',
         'brand:x',          'Recipe_Fix',
         'brand:instagram',  'recipe.fix',
         'brand:threads',    'recipe.fix'
       )
 where id = 'recipefix';

-- The founder row is deliberately left alone. `expected_handles.founder` is
-- 'isaacmineo' while the seeded X row reads @IsaacMBuilds; only the operator can
-- say which is the account they mean, and guessing here would either wave through
-- the wrong account or block the right one.
