-- §176. Nothing is expected of an account nobody has connected yet.
--
-- `expected_handles` was seeded by migration 0014 with guesses written before any
-- account existed, and 0041 corrected those guesses per platform. Both were the
-- wrong shape of answer: a first-time connection has no prior identity to be
-- checked against, and a value typed in advance cannot outrank what the platform
-- itself returns at the moment of authorisation.
--
-- It also does not generalise. Halyard is meant to serve arbitrary users, and a
-- new one signing up has no handles to seed — so any behaviour that depends on
-- them being present is behaviour that only ever worked for the first tenant.
--
-- Identity now comes from the platform: `confirmConnection` writes the returned
-- platform_user_id, handle, display name and avatar, and continuity on later
-- reconnects is enforced against that stored id, which is stable across renames
-- and cannot be typed wrong.
--
-- The column stays. An operator may still declare an expected handle deliberately
-- and Halyard will show it as an advisory on a first connection — it just is not
-- seeded, and it never blocks.
update products
   set expected_handles = '{}'::jsonb
 where expected_handles <> '{}'::jsonb;
