-- ═══════════════════════════════════════════════════════════════════════════
-- Demo data. NOT part of the production seed.
--
-- Twenty content items spanning every status, platform and format, so the UI
-- can actually be evaluated before a single review has landed. Run
-- scripts/seed-assets.ts afterwards to attach real rendered PNGs — a queue full
-- of grey placeholders cannot be judged.
--
--   psql "$DATABASE_URL" -f supabase/seed-demo.sql
--   pnpm exec tsx scripts/seed-assets.ts
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Accounts ───────────────────────────────────────────────────────────────
--
-- The account rows themselves now live in `seed.sql`, where they belong: the
-- topology is configuration, and filing it here meant the canonical seed path
-- CI runs produced a database with no accounts at all.
--
-- What stays here is the part that is genuinely demo presentation.
-- Demo accounts are shown as identity-confirmed, because an account whose
-- identity has never been checked is a state the accounts screen is supposed to
-- shout about, and every row shouting is the same as none of them shouting.
-- No token is seeded: a fake credential is worse than an absent one.
update social_accounts
   set identity_confirmed_at = now() - interval '9 days',
       platform_user_id      = 'demo-' || platform || '-' || persona,
       display_name          = case when persona = 'founder' then 'Isaac Mineo' else 'RecipeFix' end,
       follower_count        = case when persona = 'founder' then 480 else 2140 end
 where identity_confirmed_at is null;

-- ── Ideas, with real score breakdowns ──────────────────────────────────────
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
  ('recipefix','What eggs actually do in baking',
   'Structure, leavening, emulsification, colour. Which one you need decides which replacer works, and most swap guides skip that entirely.',
   'education','Reference material. Saves are worth two to three times likes, and this is save-bait.',
   0.7180, '{"mixDebt":0.68,"novelty":0.84,"seasonal":0.20,"productSignal":0.20,"formatAvailability":1.0,"historical":0.50}', 'proposed'),
  ('recipefix','Give RecipeFix a challenge',
   'Ask for the worst recipe someone has, adapt it on camera, and post the result. Participatory, and it produces genuinely novel material.',
   'community',null,
   0.5931, '{"mixDebt":0.00,"novelty":0.80,"seasonal":0.20,"productSignal":0.20,"formatAvailability":0.6,"historical":0.50}', 'proposed'),
  ('recipefix','Ingredient-anchored scaling shipped',
   'You can now scale from what you actually have rather than from servings. Hardest part was the non-linear terms.',
   'product','Product content is at 0 percent of a 15 percent ceiling, so there is room.',
   0.5510, '{"mixDebt":0.40,"novelty":0.70,"seasonal":0.20,"productSignal":1.00,"formatAvailability":1.0,"historical":0.50}', 'snoozed')
on conflict do nothing;

-- ── Twenty content items across every status, platform and format ──────────
with acct as (
  -- Brand accounts are RecipeFix's; the founder account is shared and lives on
  -- the personal product. Both are reachable from RecipeFix content.
  select id, platform, persona from social_accounts
   where (persona = 'brand' and product_id = 'recipefix') or persona = 'founder'
)
insert into content_items (product_id, account_id, platform, persona, format, category, body,
                           title, alt_text, hashtags, link_url, status, scheduled_at,
                           published_at, qc_results, claims, ai_components, disclosure_text,
                           audio_mode, edited_by_human, reject_reason, generation_meta,
                           product_artifact)
select 'recipefix', a.id, v.platform, v.persona, v.format, v.category, v.body,
       v.title, v.alt_text, v.hashtags, v.link_url, v.status,
       case when v.hours is null then null else now() + (v.hours || ' hours')::interval end,
       case when v.published_days is null then null
            else now() - (v.published_days || ' days')::interval end,
       v.qc::jsonb, v.claims::jsonb, v.ai_components, v.disclosure,
       v.audio_mode, v.edited, v.reject_reason,
       '{"model":"claude-sonnet-4-6","prompt_version":"copywriter.v1","attempts":1,"cost_usd":0.0041}'::jsonb,
       '{"recipeName":"Sally''s Artisan Bread, gluten-free"}'::jsonb
  from (values
    -- ── pending approval, the working set ────────────────────────────────
    ('x','brand','text','education',
     'Your gluten-free loaf is gummy. The starch holds water that wheat would have released. Drop the oven 25 degrees and bake it twelve minutes longer.',
     null,'A sliced gluten-free loaf on a wooden board', array[]::text[],
     'https://recipefix.app/adapt','pending_approval',6,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"2/2 verified against artifact"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the starch holds water that wheat would have released","source":"ingredients[3].changeReason"},{"text":"drop the oven 25 degrees","source":"steps[2].updated_note"}]',
     array['copy'],null,'text_only',false,null),

    ('instagram','brand','carousel','transformation',
     'Gummy crumb, every time. We ran an artisan loaf through a gluten-free adaptation and it added apple cider vinegar nobody asked for. The acid firms the protein network that gluten would normally build. Oven came down from 475 to 450 because gluten-free browns faster than it sets.',
     null,'Six-slide carousel showing a gluten-free bread adaptation',
     array['glutenfree','breadbaking','recipeswap'],
     'https://recipefix.app/adapt','pending_approval',9,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"3/3 verified against artifact"},{"gate":"visual","status":"warning","summary":"4.2/5 — slide 4 text is close to the safe area"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the acid firms the protein network","source":"ingredients[4].changeReason"},{"text":"oven came down from 475 to 450","source":"steps[2].updated_note"},{"text":"gluten-free browns faster than it sets","source":"steps[2].updated_note"}]',
     array['copy'],null,'text_only',false,null),

    ('tiktok','brand','video','transformation',
     'Three changes. Two of them matter. The vinegar is the one nobody expects.',
     null,'Vertical video showing the ingredient swaps',
     array['glutenfree','baking','bread'],null,'pending_approval',30,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (1 warning)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.5/5"},{"gate":"audio","status":"passed","summary":"WER 0.4%, 158 wpm, -14.1 LUFS"}]}',
     '[{"text":"three changes","source":"ingredients[0].changeReason"}]',
     array['copy','voiceover'],'Narrated with my own voice, synthesised. #AIvoiceover','founder_cloned',false,null),

    ('youtube','brand','image','education',
     'Almond flour is not a swap for wheat flour. It has no starch and no gluten, so it cannot do structure. Use it where fat and flavour matter and something else is holding the shape.',
     'Why almond flour is not a 1 to 1 swap','A ratio card showing almond flour against wheat flour',
     array['glutenfree','baking'],'https://recipefix.app/adapt','pending_approval',33,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.6/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"almond flour has no starch and no gluten","source":"ingredients[0].changeReason"}]',
     array['copy'],null,'text_only',false,null),

    ('threads','brand','image','community',
     'Send me the recipe you have given up on. I will run it through and post what changes.',
     null,'A chef note card inviting submissions',array['glutenfree'],
     null,'pending_approval',12,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"passed","summary":"4.4/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',false,null),

    ('x','founder','text','founder_insight',
     'Spent two days on ingredient-anchored scaling. The hard part was never the maths. It was that people say "I have two eggs" and mean something different every time.',
     null,null,array[]::text[],null,'pending_approval',15,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',false,null),

    -- ── approved and scheduled ───────────────────────────────────────────
    ('pinterest','brand','pin','education',
     'Gluten-free sandwich loaf that holds its shape. Vinegar in the dough, lower oven, longer bake.',
     'Gluten-free sandwich loaf that holds its shape','A tall pin showing a sliced gluten-free loaf',
     array[]::text[],'https://recipefix.app/adapt','approved',26,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.7/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"vinegar in the dough","source":"ingredients[4].adapted"}]',
     array['copy'],null,'text_only',false,null),

    ('pinterest','brand','pin','education',
     'Egg replacer chart. Which one to use depends on whether the egg was doing structure, leavening, or moisture.',
     'Egg replacer chart for baking','A reference chart of egg replacers by function',
     array[]::text[],'https://recipefix.app/adapt','approved',50,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"2/2 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.8/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"structure, leavening, or moisture","source":"explanations[0]"},{"text":"which one to use depends on function","source":"explanations[1]"}]',
     array['copy'],null,'text_only',true,null),

    ('instagram','brand','video','transformation',
     'The loaf collapsed. Then it did not. One teaspoon of acid is the whole difference.',
     null,'Vertical video of a loaf collapsing then holding',
     array['glutenfree','baking','breadmaking'],null,'scheduled',54,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.6/5"},{"gate":"audio","status":"passed","summary":"WER 0.8%, 162 wpm, -13.9 LUFS"}]}',
     '[{"text":"one teaspoon of acid","source":"ingredients[4].adapted"}]',
     array['copy','voiceover'],'Narrated with my own voice, synthesised. #AIvoiceover','founder_cloned',false,null),

    ('x','brand','text','education',
     'Cold butter, not soft. The lumps are the point. They steam in the oven and that is what makes the layers.',
     null,null,array[]::text[],null,'scheduled',72,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the lumps steam in the oven","source":"steps[0].updated_note"}]',
     array['copy'],null,'text_only',false,null),

    -- ── published ────────────────────────────────────────────────────────
    ('x','brand','text','transformation',
     'A reader sent us a recipe that called for 8 cups of flour and 4 teaspoons of yeast. Scaled to two servings, the yeast should be 1 1/4 teaspoons, not 1. Proofing is not linear.',
     null,null,array[]::text[],'https://recipefix.app/adapt','published',null,3,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"2/2 verified against artifact"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"proofing is not linear","source":"ingredients[1].changeReason"},{"text":"yeast should be 1 1/4 teaspoons","source":"ingredients[1].adapted"}]',
     array['copy'],null,'text_only',false,null),

    ('instagram','brand','carousel','education',
     'Six things that go wrong with gluten-free bread, and which one is actually your problem. Most people are fixing the third when they have the first.',
     null,'Carousel listing six gluten-free bread failure modes',
     array['glutenfree','baking','breadmaking'],'https://recipefix.app/adapt','published',null,6,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"3/3 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.5/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"six things go wrong","source":"explanations[0]"},{"text":"most people fix the third","source":"explanations[1]"},{"text":"the first is usually hydration","source":"ingredients[3].changeReason"}]',
     array['copy'],null,'text_only',false,null),

    ('pinterest','brand','pin','transformation',
     'Dairy-free alfredo that is not just blended cashews. The starch has to come from somewhere.',
     'Dairy-free alfredo that actually coats','A pin showing a dairy-free alfredo',
     array[]::text[],'https://recipefix.app/adapt','published',null,9,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.4/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the starch has to come from somewhere","source":"explanations[1]"}]',
     array['copy'],null,'text_only',false,null),

    ('x','founder','text','founder_insight',
     'Shipped nutrition estimates last month and immediately regretted the wording. "Estimated" is doing a lot of work and people read past it. Rewrote the label three times.',
     null,null,array[]::text[],null,'published',null,12,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',true,null),

    -- ── awaiting manual publish, the draft_only path ─────────────────────
    ('tiktok','brand','video','education',
     'Why your gluten-free dough looks like batter. It is supposed to.',
     null,'Vertical video showing gluten-free dough consistency',
     array['glutenfree','baking','bread'],null,'awaiting_manual_publish',null,1,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.3/5"},{"gate":"audio","status":"passed","summary":"WER 1.1%, 149 wpm, -14.2 LUFS"}]}',
     '[{"text":"it is supposed to look like batter","source":"steps[0].updated_note"}]',
     array['copy','voiceover'],'Narrated with my own voice, synthesised. #AIvoiceover','founder_cloned',false,null),

    ('youtube','brand','video','education',
     'Gluten-free bread, one change at a time. Each swap on its own, so you can see which one actually mattered.',
     'Gluten-free bread, one change at a time #Shorts','Vertical short explaining one swap at a time',
     array['glutenfree','baking'],'https://recipefix.app/adapt','awaiting_manual_publish',null,2,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"2/2 verified against artifact"},{"gate":"visual","status":"passed","summary":"4.5/5"},{"gate":"audio","status":"passed","summary":"WER 0.6%, 155 wpm, -14.0 LUFS"}]}',
     '[{"text":"each swap on its own","source":"explanations[0]"},{"text":"which one actually mattered","source":"explanations[1]"}]',
     array['copy','voiceover'],'Narrated with my own voice, synthesised. #AIvoiceover','founder_cloned',false,null),

    -- ── failed, so the retry path is reachable ───────────────────────────
    ('instagram','brand','image','transformation',
     'One swap, four consequences. The ingredient changes, then the step, then the time, then the macros.',
     null,'A transformation card showing one swap and its effects',
     array['glutenfree','baking','recipeswap'],'https://recipefix.app/adapt','failed',4,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"passed","summary":"1/1 verified against artifact"},{"gate":"visual","status":"failed","summary":"failed — render did not complete"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[{"text":"the ingredient changes, then the step","source":"steps[0].updated_note"}]',
     array['copy'],null,'text_only',false,null),

    -- ── rejected, feeding the anti-example loop ──────────────────────────
    ('instagram','brand','image','product',
     'RecipeFix makes adapting recipes simple. Try it free today and see the difference for yourself.',
     null,'A product card',array['glutenfree','recipes','cooking'],
     'https://recipefix.app','rejected',null,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"passed","summary":"4.1/5"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',false,'reads like an ad, no specific claim, nothing learned'),

    ('x','brand','text','product',
     'Adapting recipes has never been easier. RecipeFix handles the hard part so you can focus on cooking.',
     null,null,array[]::text[],'https://recipefix.app','rejected',null,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',false,'no mechanism, no number, could be any product'),

    -- ── expired, so the reschedule ceiling is visible ────────────────────
    ('threads','brand','text','community',
     'What is the recipe you keep meaning to fix and never do? I will pick one.',
     null,null,array[]::text[],null,'expired',-30,null,
     '{"passed":true,"gates":[{"gate":"copy","status":"passed","summary":"passed (0 flags)"},{"gate":"claims","status":"skipped","summary":"no claims to verify"},{"gate":"visual","status":"skipped","summary":"no media"},{"gate":"audio","status":"skipped","summary":"no voiceover"}]}',
     '[]',array['copy'],null,'text_only',false,'rescheduled three times without approval')
  ) as v(platform, persona, format, category, body, title, alt_text, hashtags, link_url,
         status, hours, published_days, qc, claims, ai_components, disclosure, audio_mode,
         edited, reject_reason)
  join acct a on a.platform = v.platform and a.persona = v.persona
 where not exists (select 1 from content_items where product_id = 'recipefix' and body = v.body);

-- ── Publications and metrics for the published items ───────────────────────
insert into publications (content_item_id, account_id, platform, platform_post_id, permalink,
                          publish_mode, published_at)
select ci.id, ci.account_id, ci.platform,
       'demo-' || substr(ci.id::text, 1, 8),
       case ci.platform
         when 'x' then 'https://x.com/recipefix/status/demo-' || substr(ci.id::text, 1, 8)
         when 'instagram' then 'https://instagram.com/p/demo-' || substr(ci.id::text, 1, 8)
         else 'https://www.pinterest.com/pin/demo-' || substr(ci.id::text, 1, 8) end,
       'direct', ci.published_at
  from content_items ci
 where ci.status = 'published'
   and not exists (select 1 from publications p where p.content_item_id = ci.id);

insert into publications (content_item_id, account_id, platform, platform_post_id,
                          publish_mode, manual_publish_url, published_at)
select ci.id, ci.account_id, ci.platform,
       'demo-' || substr(ci.id::text, 1, 8), 'draft',
       case ci.platform when 'tiktok' then 'https://www.tiktok.com/upload?lang=en'
                        else 'https://studio.youtube.com/' end,
       ci.published_at
  from content_items ci
 where ci.status = 'awaiting_manual_publish'
   and not exists (select 1 from publications p where p.content_item_id = ci.id);

-- Metrics that differ per post, so /library and /analytics can be read rather
-- than just rendered.
--
-- abs(...::bigint) because hashtext() returns a *signed* int4: `hashtext(x) % n`
-- is negative for about half of all inputs, which is how /analytics ended up
-- showing −3,449 impressions per post. The cast to bigint is not optional
-- either — abs(-2147483648) overflows int4.
insert into post_metrics (publication_id, impressions, reach, likes, comments, shares,
                          saves, link_clicks, follows, collected_at)
select p.id,
       (2400 + (abs(hashtext(p.id::text)::bigint) % 9000))::int,
       (1900 + (abs(hashtext(p.id::text)::bigint) % 7000))::int,
       (60 + (abs(hashtext(p.id::text)::bigint) % 300))::int,
       (2 + (abs(hashtext(p.id::text)::bigint) % 25))::int,
       (1 + (abs(hashtext(p.id::text)::bigint) % 40))::int,
       (18 + (abs(hashtext(p.id::text)::bigint) % 180))::int,
       (12 + (abs(hashtext(p.id::text)::bigint) % 110))::int,
       (1 + (abs(hashtext(p.id::text)::bigint) % 20))::int,
       now() - interval '2 hours'
  from publications p
 where p.published_at is not null
   and not exists (select 1 from post_metrics m where m.publication_id = p.id);

insert into attribution (content_item_id, sessions, signups, activated_users,
                         adaptations, saves, cook_starts, paid_conversions)
select p.content_item_id,
       (40 + (abs(hashtext(p.id::text)::bigint) % 120))::int,
       (4 + (abs(hashtext(p.id::text)::bigint) % 18))::int,
       (2 + (abs(hashtext(p.id::text)::bigint) % 12))::int,
       (3 + (abs(hashtext(p.id::text)::bigint) % 14))::int,
       (1 + (abs(hashtext(p.id::text)::bigint) % 9))::int,
       (1 + (abs(hashtext(p.id::text)::bigint) % 7))::int,
       (abs(hashtext(p.id::text)::bigint) % 3)::int
  from publications p
 where p.published_at is not null
   and not exists (select 1 from attribution a where a.content_item_id = p.content_item_id);

-- ── Comments waiting on a reply ────────────────────────────────────────────
insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at,
                      reply_status, suggested_reply, sentiment, is_support_question)
select p.id, 'c-1', '@bakerbecca',
       'Does this work with oat flour? I cannot do rice flour.',
       now() - interval '25 minutes', 'pending',
       'Oat flour absorbs less water and has no starch structure, so it needs a binder. Try 70 percent oat with 30 percent tapioca and keep the vinegar.',
       'question', false
  from publications p where p.platform = 'x' and p.published_at is not null
  order by p.published_at desc limit 1
on conflict do nothing;

insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at,
                      reply_status, sentiment)
select p.id, 'c-2', '@sourdough_sam',
       'The non-linear yeast thing explains three years of failed scaling. Thank you.',
       now() - interval '2 hours', 'replied', 'positive'
  from publications p where p.platform = 'x' and p.published_at is not null
  order by p.published_at desc limit 1
on conflict do nothing;

insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at,
                      reply_status, is_support_question, sentiment)
select p.id, 'c-3', '@gfmumof3',
       'The app crashed when I pasted a link from a site with a paywall. Third time this week.',
       now() - interval '40 minutes', 'pending', true, 'negative'
  from publications p where p.platform = 'instagram' and p.published_at is not null
  order by p.published_at desc limit 1
on conflict do nothing;

-- ── Worker heartbeat and a small job queue ─────────────────────────────────
insert into worker_heartbeats (worker_id, last_seen_at, version, detail)
values ('worker-demo', now() - interval '30 seconds', '0.1.0',
        '{"kinds":["publish","render","generate","collect_metrics"]}')
on conflict (worker_id) do update set last_seen_at = excluded.last_seen_at;

insert into jobs (kind, payload, status, created_at) values
  ('collect_metrics','{"publicationId":"demo"}','done', now() - interval '1 hour'),
  ('render','{"renderId":"demo"}','queued', now() - interval '2 minutes'),
  ('collect_comments','{"publicationId":"demo"}','queued', now() - interval '30 seconds')
on conflict do nothing;

-- Partly through the wizard, which is the realistic state.
update onboarding_state
   set step_ingest_done = true, step_voice_done = true, calibration_reviewed = 6
 where product_id = 'recipefix';

update settings set publishing_enabled = true;

-- Destinations, resolved the way the generator would. Milestone 42: a post about
-- one specific adaptation points at that adaptation's own public page; a general
-- post points at the web app. The share token is a real one, from a saved
-- RecipeFix recipe.
update content_items
   set destination_type = 'share_link',
       destination_url  = 'https://recipefix.app/recipe/be1b2a5f-5015-4e0c-9194-8bae735e9e01',
       destination_reason = 'The post is about one specific adaptation and the product gave it a public share page, so the link goes straight there.'
 where category = 'transformation' and destination_type is null;

update content_items
   set destination_type = 'web',
       destination_url  = 'https://recipefix.app',
       destination_reason = 'A general post, so the web page is the right destination.'
 where destination_type is null;
