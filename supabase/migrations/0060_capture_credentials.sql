-- §299. A test account, so a capture can record the product actually working.
--
-- The walkthrough render showed RecipeFix's *demo* card — "Chicken Tacos" with a
-- "Sign in to save your recipes" sheet across the bottom. The capture flow is
-- right: it waits for the demo card to clear and then for a real adaptation. The
-- real adaptation never comes, because it needs an account.
--
-- So every product demonstration Halyard has ever recorded has been of the
-- signed-out state — the one part of the product nobody is trying to sell.
--
-- Stored per product rather than in the environment because a *user* supplies
-- this when they connect their app, and an env var is not something a user can
-- set. Supabase encrypts at rest; the discipline this migration adds on top is
-- that these values are never logged, never put in a job payload, and never
-- returned to the browser once written.
alter table products
  add column if not exists capture_credentials jsonb;

comment on column products.capture_credentials is
  'Test-account credentials for capture, e.g. {"email":"...","password":"...","loginPath":"/signin"}. '
  'NEVER log these, never include them in a job payload, and never send them back to the client. '
  'A capture reads them at run time and nothing else touches them. §299.';
