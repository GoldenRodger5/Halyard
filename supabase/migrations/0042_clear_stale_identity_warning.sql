-- §175. Clear a handle-mismatch warning that the corrected expectation disproves.
--
-- The X brand account was confirmed *despite* "You expected @recipefix but
-- authorised @Recipe_Fix." Migration 0041 corrected the expectation, so that
-- sentence is now false — and it renders on the Accounts page as
-- "Confirmed despite a warning", permanently misreporting a healthy connection.
--
-- Guarded rather than blanket. It clears only where the stored warning is a
-- handle mismatch AND the account's handle now matches the configured
-- expectation, compared exactly as `normaliseHandle` does: trim, strip one
-- leading @, lower-case. Nothing else is folded — `_` and `.` distinguish real
-- usernames — so an account that is genuinely wrong keeps its warning.
--
-- The authorisation itself stays in `audit_log` (`oauth_authorised`), so the
-- history this removes from the card is not lost.
update social_accounts sa
   set identity_warning = null
  from products p
 where p.id = sa.product_id
   and sa.identity_warning is not null
   and sa.identity_warning like 'You expected %'
   and lower(regexp_replace(btrim(sa.handle), '^@', '')) =
       lower(regexp_replace(btrim(
         coalesce(
           p.expected_handles ->> (sa.persona || ':' || sa.platform),
           p.expected_handles ->> sa.persona
         )
       ), '^@', ''));
