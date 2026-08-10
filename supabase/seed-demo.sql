-- ═══════════════════════════════════════════════════════════════════════════
-- Demo data. NOT part of the production seed.
--
-- Exists so the UI can be exercised and reviewed before any platform review has
-- landed: a queue with real QC results, a published post with metrics, an idea
-- backlog with score breakdowns, and a comment waiting for a reply.
--
-- Apply with:  psql "$DATABASE_URL" -f supabase/seed-demo.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Accounts across the capability_state range, so /accounts shows every case.
insert into social_accounts (product_id, platform, persona, handle, capability_state,
                             capability_detail, supported_formats, link_strategy)
values
  ('recipefix','x','brand','@recipefix','live',
   'No review gate on X. Posting is live and billed per call.',
   array['text','image','video'],'first_reply'),
  ('recipefix','x','founder','@isaacmineo','live',
   'Founder account. Posts are composed, not generated.',
   array['text','image'],'first_reply'),
  ('recipefix','instagram','brand','@recipefix','draft_only',
   'Connected. Publishing works against your own account in dev mode; public use needs Meta App Review (2 to 4 weeks per submission).',
   array['image','carousel','video'],'bio_only'),
  ('recipefix','pinterest','brand','@recipefix','draft_only',
   'Trial access. Pins are created as sandbox entities and are visible only to you.',
   array['pin','image'],'pin_destination'),
  ('recipefix','youtube','brand','RecipeFix','draft_only',
   'Connected. Until the compliance audit passes, uploads land as private.',
   array['video'],'description'),
  ('recipefix','tiktok','brand','@recipefix','draft_only',
   'Unaudited clients can only post SELF_ONLY with the account private, so uploads go to your drafts. The API also cannot attach trending audio.',
   array['video'],'bio_only'),
  ('recipefix','threads','brand','@recipefix','pending_auth',
   null, array['text','image'],'in_body')
on conflict (product_id, platform, persona) do nothing;

-- Ideas with real score breakdowns.
insert into ideas (product_id, title, angle, category, rationale, score, score_breakdown, status)
values
  ('recipefix','Why your gluten-free loaf is gummy',
   'The starch holds water wheat would have released, so the centre reads raw while the crust is done. Dropping the oven and extending the bake is the trade.',
   'education','Education is at 8 percent against a 25 percent target, the largest debt in the mix.',
   0.7412, '{"mixDebt":0.68,"novelty":0.91,"seasonal":0.20,"productSignal":0.75,"formatAvailability":1.0,"historical":0.50}', 'proposed'),
  ('recipefix','This recipe added an ingredient nobody asked for',
   'A real adaptation added apple cider vinegar unprompted. The acid does the structural work gluten normally would.',
   'transformation','A fresh adaptation from the last 24 hours, and it is counterintuitive.',
   0.6890, '{"mixDebt":0.00,"novelty":0.88,"seasonal":0.20,"productSignal":1.00,"formatAvailability":1.0,"historical":0.50}', 'proposed'),
  ('recipefix','Doubling a recipe is not multiplication',
   'Salt and yeast scale to roughly 85 percent of linear. Doubling them is how a scaled loaf ends up over-salted and over-proofed.',
   'education',null,
   0.6605, '{"mixDebt":0.68,"novelty":0.62,"seasonal":0.20,"productSignal":0.20,"formatAvailability":1.0,"historical":0.50}', 'proposed'),
  ('recipefix','Give RecipeFix a challenge',
   'Ask for the worst recipe someone has, adapt it on camera, and post the result. Participatory, and it produces genuinely novel material.',
   'community',null,
   0.5931, '{"mixDebt":0.00,"novelty":0.80,"seasonal":0.20,"productSignal":0.20,"formatAvailability":0.6,"historical":0.50}', 'proposed')
on conflict do nothing;

-- Queue items, with QC results in the shape v2 F.5 renders.
with acct as (
  -- Brand persona only: there are two X accounts, and joining on platform alone
  -- would insert every X item twice.
  select id, platform from social_accounts
   where product_id = 'recipefix' and persona = 'brand'
)
insert into content_items (product_id, account_id, platform, persona, format, category, body,
                           alt_text, hashtags, link_url, status, scheduled_at,
                           qc_results, claims, ai_components, generation_meta,
                           product_artifact)
select 'recipefix', a.id, v.platform, 'brand', v.format, v.category, v.body,
       v.alt_text, v.hashtags, v.link_url, v.status,
       now() + (v.hours || ' hours')::interval,
       v.qc::jsonb, v.claims::jsonb, array['copy'],
       '{"model":"claude-sonnet-4-6","prompt_version":"copywriter.v1","attempts":1,"cost_usd":0.0041}'::jsonb,
       '{"recipeName":"Sally''s Artisan Bread, gluten-free"}'::jsonb
  from (values
    ('x','text','education',
     'Your gluten-free loaf is gummy. The starch holds water that wheat would have released. Drop the oven 25 degrees and bake it twelve minutes longer.',
     'A sliced gluten-free loaf on a wooden board',
     array[]::text[], 'https://recipefix.app/adapt', 'pending_approval', 6,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"2/2 verified against artifact"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the starch holds water that wheat would have released","source":"ingredients[3].changeReason"},{"text":"drop the oven 25 degrees","source":"steps[2].updated_note"}]'),

    ('instagram','carousel','transformation',
     'Gummy crumb, every time. We ran an artisan loaf through a gluten-free adaptation and it added apple cider vinegar nobody asked for. The acid firms the protein network that gluten would normally build. Oven came down from 475 to 450 because gluten-free browns faster than it sets.',
     'Six-slide carousel showing a gluten-free bread adaptation',
     array['glutenfree','breadbaking','recipeswap'], 'https://recipefix.app/adapt', 'pending_approval', 9,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"3/3 verified against artifact"},{"gate":"visual","status":"warning","summary":"4.2/5 — slide 4 text is close to the safe area"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the acid firms the protein network","source":"ingredients[4].changeReason"},{"text":"oven came down from 475 to 450","source":"steps[2].updated_note"},{"text":"gluten-free browns faster than it sets","source":"steps[2].updated_note"}]'),

    ('pinterest','pin','education',
     'Gluten-free sandwich loaf that holds its shape. Vinegar in the dough, lower oven, longer bake.',
     'A tall pin showing a sliced gluten-free sandwich loaf',
     array[]::text[], 'https://recipefix.app/adapt', 'approved', 26,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.7/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"vinegar in the dough","source":"ingredients[4].adapted"}]'),

    ('tiktok','video','transformation',
     'Three changes. Two of them matter. The vinegar is the one nobody expects.',
     'Vertical video showing the ingredient swaps',
     array['glutenfree','baking','bread'], null, 'pending_approval', 30,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (1 warning)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.5/5"},{"gate":"audio","status":"passed","summary":"WER 0.4%, 158 wpm, -14.1 LUFS"}]}',
     '[{"text":"three changes","source":"ingredients[0].changeReason"}]')
  ) as v(platform, format, category, body, alt_text, hashtags, link_url, status, hours, qc, claims)
  join acct a on a.platform = v.platform
 where not exists (select 1 from content_items where product_id = 'recipefix' and body = v.body);

-- A published post with metrics and attribution, so /library and /analytics
-- have something honest to show.
with acct as (select id from social_accounts where product_id='recipefix' and platform='x' and persona='brand'),
ins as (
  insert into content_items (product_id, account_id, platform, persona, format, category, body,
                             status, published_at, final_link_url, eligible_for_repost_at)
  select 'recipefix', acct.id, 'x','brand','text','transformation',
         'A reader sent us a recipe that called for 8 cups of flour and 4 teaspoons of yeast. Scaled to two servings, the yeast should be 1 1/4 teaspoons, not 1. Proofing is not linear.',
         'published', now() - interval '3 days',
         'https://recipefix.app/adapt?utm_source=x&utm_medium=social&utm_campaign=transformation&utm_content=demo',
         now() + interval '87 days'
    from acct
   where not exists (select 1 from content_items where status = 'published')
  returning id, account_id
),
pub as (
  insert into publications (content_item_id, account_id, platform, platform_post_id, permalink,
                            publish_mode, published_at)
  select id, account_id, 'x', 'demo-post-1', 'https://x.com/recipefix/status/demo-post-1',
         'direct', now() - interval '3 days'
    from ins
  returning id, content_item_id
)
insert into post_metrics (publication_id, impressions, likes, comments, shares, link_clicks, follows)
select id, 8420, 214, 19, 31, 96, 12 from pub;

insert into attribution (content_item_id, sessions, signups, activated_users, adaptations, saves, cook_starts)
select content_item_id, 96, 14, 9, 11, 6, 4
  from publications where platform_post_id = 'demo-post-1'
 and not exists (select 1 from attribution);

insert into performance_scores (content_item_id, score, reach_score, engagement_score, conversion_score, low_confidence, notes)
select content_item_id, 0.7100, 0.5000, 0.5000, 0.5000, false,
       'Only one published post, so every percentile is neutral. The score means little until there is a cohort.'
  from publications where platform_post_id = 'demo-post-1'
on conflict (content_item_id) do nothing;

-- A comment waiting for a reply, and one already handled.
insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at,
                      reply_status, suggested_reply, sentiment)
select p.id, 'c-1', '@bakerbecca',
       'Does this work with oat flour? I cannot do rice flour.',
       now() - interval '25 minutes', 'pending',
       'Oat flour behaves differently: it absorbs less water and has no starch structure, so you would need a binder. Try 70 percent oat with 30 percent tapioca and keep the vinegar.',
       'question'
  from publications p where p.platform_post_id = 'demo-post-1'
on conflict do nothing;

insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at,
                      reply_status, sentiment)
select p.id, 'c-2', '@sourdough_sam',
       'The non-linear yeast thing explains three years of failed scaling. Thank you.',
       now() - interval '2 hours', 'replied', 'positive'
  from publications p where p.platform_post_id = 'demo-post-1'
on conflict do nothing;

-- Worker heartbeat, so the health page is not permanently red in a demo.
insert into worker_heartbeats (worker_id, last_seen_at, version, detail)
values ('worker-demo', now() - interval '30 seconds', '0.1.0',
        '{"kinds":["publish","render","generate","collect_metrics"]}')
on conflict (worker_id) do update set last_seen_at = excluded.last_seen_at;

-- Jobs, so queue depth is not zero.
insert into jobs (kind, payload, status, created_at) values
  ('collect_metrics','{"publicationId":"demo"}','done', now() - interval '1 hour'),
  ('render','{"renderId":"demo"}','queued', now() - interval '2 minutes')
on conflict do nothing;

-- Onboarding partly done, so the dashboard shows the wizard banner in a
-- realistic state rather than all-or-nothing.
update onboarding_state
   set step_ingest_done = true, step_voice_done = true, calibration_reviewed = 6
 where product_id = 'recipefix';

update settings set publishing_enabled = true;
