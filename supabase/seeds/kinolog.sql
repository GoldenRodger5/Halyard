-- §517. Kinolog could never generate anything.
--
-- The product row, twenty-four facts and eight evidence pages have been in
-- production since the Product Brain read the site. What it never had was a
-- **brand voice** and a single **account row** — and `generate` throws
-- `no brand voice configured` before it does anything, then iterates accounts
-- to decide what to make. With neither, the second product this system exists
-- to market has produced nothing at all, and every improvement made this year
-- has been measured against one connector and one voice.
--
-- The voice below is written from Kinolog's own verified facts, not invented:
-- every do/don't traces to something in `product_facts`. It is a starting
-- point for calibration, not a finished voice — the operator's calibration
-- batch is what earns that.
--
-- The accounts are `draft_only` with no credential, which is exactly the state
-- RecipeFix's TikTok and Pinterest are in. Generation needs somewhere to aim;
-- publishing needs a credential, and that is a separate decision.

insert into products (id, name, kind, connector_type, website_url, brand_tokens, destinations, content_rules, operator_timezone)
values (
  'kinolog', 'Kinolog', 'product', 'none', 'https://kinolog.app',
  '{"ink":"#ede8e0","muted":"#9a938a","primary":"#e3b341","bodyFont":"Inter","background":"#141210","headingFont":"Bricolage Grotesque"}'::jsonb,
  '{"web":"https://kinolog.app"}'::jsonb,
  '{"banned_phrases":["hidden gem","must-watch","cinephile","binge-worthy"],
    "forbidden_claims":["we know your taste better than you",
                        "a recommendation engine nobody else has",
                        "we never get a pick wrong"]}'::jsonb,
  'America/New_York'
)
on conflict (id) do update set
  brand_tokens = excluded.brand_tokens,
  destinations = excluded.destinations,
  content_rules = excluded.content_rules;

insert into brand_voices (product_id, persona, display_name, description, do_rules, dont_rules, examples, anti_examples, mix_targets)
values (
  'kinolog', 'brand', 'Kinolog',
  'Quiet and specific, the way a good diary entry is. Talks about the deciding, not the films. Never tells anyone what to like, and never pretends a recommendation is objective.',
  array[
    'Name the moment: the forty minutes of scrolling, the film nobody committed to',
    'Say why a pick fits, in the user''s own terms, because an unexplained recommendation is a guess',
    'Treat the diary as the source, not a chart or a trend',
    'Admit a miss. The hit rate is on the stats page for a reason'
  ],
  array[
    'Never rank or gatekeep taste',
    'No hidden gem, must-watch, cinephile or binge-worthy',
    'Never claim to know someone''s taste better than they do',
    'No spoilers, ever, including in a hook'
  ],
  '[]'::jsonb, '[]'::jsonb,
  '{"product":0.15,"education":0.30,"community":0.20,"founder_insight":0.35}'::jsonb
)
on conflict (product_id, persona) do update set
  description = excluded.description,
  do_rules = excluded.do_rules,
  dont_rules = excluded.dont_rules,
  mix_targets = excluded.mix_targets;

-- Somewhere to aim. No credential: generation works, publishing does not.
insert into social_accounts (product_id, platform, persona, handle, capability_state, supported_formats, link_strategy)
values
  ('kinolog', 'instagram', 'brand', '@kinolog.app', 'draft_only', '{image,carousel,video,story}', 'bio_only'),
  ('kinolog', 'tiktok',    'brand', '@kinolog',     'draft_only', '{video}',                     'bio_only')
on conflict do nothing;

-- Facts and evidence are deliberately NOT seeded here.
--
-- The Product Brain had already read kinolog.app: forty-nine facts and eight
-- evidence pages exist, and `product_facts_require_evidence` refuses any fact
-- that cites none — gotcha 9 enforced in the database rather than remembered,
-- and it refused this file's first draft outright. Re-seeding them by hand
-- would be inventing provenance for rows an agent earned. Run
-- `explore_product` against a database that has none.

-- §518. The first-run state, recording what is actually true.
--
-- `generate` refuses a product whose first-run wizard is incomplete, and it
-- was right to: Kinolog had no voice and no templates it could use. Both are
-- now true rather than asserted — the Product Brain ingested the site (49
-- facts, 8 evidence pages), the voice above exists, and migration 0078 makes
-- the slot-driven templates available to every product.
--
-- `calibration` and `accounts` stay false, because neither has happened: no
-- operator has reviewed a Kinolog batch and no credential is held. They are
-- not gates on generation, and marking them would be a lie the readiness page
-- would repeat.
insert into onboarding_state (product_id, step_ingest_done, step_voice_done, step_templates_done)
values ('kinolog', true, true, true)
on conflict (product_id) do update set
  step_ingest_done = true,
  step_voice_done = true,
  step_templates_done = true;
