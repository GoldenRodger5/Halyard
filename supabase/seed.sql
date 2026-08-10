-- ═══════════════════════════════════════════════════════════════════════════
-- Seed — RecipeFix configured end to end, plus the template and slot catalogue.
--
-- Idempotent: safe to run repeatedly. Contains no secrets and no tokens.
-- The first-run wizard (build pack §2) overwrites voice and brand values with
-- the operator's own answers; these are defaults, not opinions.
-- ═══════════════════════════════════════════════════════════════════════════

insert into products (
  id, name, tagline, website_url, app_store_url, status,
  connector_type, connector_config, brand_tokens, content_rules,
  audience_timezone, operator_timezone, expected_handles, destinations
) values (
  'recipefix',
  'RecipeFix',
  'Adapt any recipe to how you actually eat',
  'https://recipefix.app',
  'https://apps.apple.com/app/id6759676502',
  'active',
  'mcp',
  jsonb_build_object('url_env', 'RECIPEFIX_MCP_URL', 'token_env', 'RECIPEFIX_MCP_TOKEN'),
  jsonb_build_object(
    'primary', '#C4714A',
    'background', 'hsl(50 20% 97%)',
    'ink', '#2A2320',
    'muted', '#7A6E66',
    'accent', '#5C7A5E',
    'heading_font', 'Instrument Serif',
    'body_font', 'Inter'
  ),
  jsonb_build_object(
    'forbidden_claims', jsonb_build_array(
      'nutrition accuracy',
      'perfect 1:1 substitution',
      'medical or allergy-safety guarantee',
      'competitor comparison'
    ),
    'required_disclaimers', jsonb_build_array(),
    'banned_phrases', jsonb_build_array('chef-approved', 'foolproof', 'restaurant-quality')
  ),
  'America/New_York',
  'America/New_York',
  jsonb_build_object('brand', 'recipefix'),
  /**
   * Where a RecipeFix post sends people. Milestone 42.
   *
   * `share_url_template` is the important one: a saved adaptation gets a public
   * page at /recipe/<share_token>, verified against a real saved recipe — it
   * renders without sign-in. The app's apple-app-site-association covers every
   * path with a wildcard, so an installed iOS app opens that URL directly and
   * nobody is bounced through an App Store page for an app they already have.
   *
   * `app_analytics_provider_token` is deliberately absent. It comes from App
   * Store Connect → Analytics → Campaigns, and until it is set every App Store
   * install reads as organic. /settings/readiness says so rather than letting it
   * be a silent gap.
   */
  jsonb_build_object(
    'web', 'https://recipefix.app',
    'app_store', 'https://apps.apple.com/app/id6759676502',
    'app_store_id', '6759676502',
    'universal_link_domain', 'recipefix.app',
    'deep_link_scheme', 'recipefix',
    'share_url_template', 'https://recipefix.app/recipe/{shareToken}'
  )
) on conflict (id) do nothing;

insert into onboarding_state (product_id) values ('recipefix')
  on conflict (product_id) do nothing;

/**
 * Per-format cadence, from the milestone 27 research. The video ceiling is the
 * one that matters: below three a week the algorithm deprioritises the account,
 * above seven quality drops and average retention degrades, which pulls the
 * channel-level signal down with it.
 *
 * This lives here rather than in migration 0012 because migrations run against a
 * database that has no products yet, so the guarded insert there is a no-op on
 * every fresh install — which left RecipeFix with no cadence at all.
 */
insert into format_cadence (product_id, format, weekly_floor, weekly_ceiling, reason)
values
  ('recipefix', 'video', 3, 5,
   'Below three per week the algorithm treats the account as lower priority. Above seven, quality drops and average retention degrades, which pulls the channel-level signal down.'),
  ('recipefix', 'carousel', 2, 5,
   'Carousels earn saves, which are worth more than likes, but they are expensive to make well.'),
  ('recipefix', 'image', 2, 7, null),
  ('recipefix', 'text', 3, 14,
   'Cheap to produce and cheap to ignore. The ceiling exists to stop text crowding out everything else.'),
  ('recipefix', 'pin', 5, 35,
   'Pinterest is a search index, not a feed. Volume works here and nowhere else.')
on conflict (product_id, format) do nothing;

/**
 * The platform reviews that stand between this system and public posting.
 *
 * Every platform except X and Bluesky gates public posting behind a manual
 * review measured in weeks. Seeding them means /submissions is a checklist on
 * day one rather than an empty table someone has to remember to populate.
 */
insert into review_submissions (product_id, platform, review_name, requirements)
values
  ('recipefix', 'instagram', 'Meta App Review',
   '["instagram_content_publish scope","A screen recording of the whole OAuth flow","A public privacy policy URL","A working test account for the reviewer"]'::jsonb),
  ('recipefix', 'threads', 'Meta App Review — Threads API',
   '["threads_content_publish scope","Threads API product added to the app","Same recording and privacy policy as Instagram"]'::jsonb),
  ('recipefix', 'tiktok', 'Content Posting API audit',
   '["A screen recording showing the full publish flow","Verified URL ownership for the media domain","Assume rejection for an internal tool"]'::jsonb),
  ('recipefix', 'pinterest', 'Trial to Standard access',
   '["A screen recording showing the OAuth flow AND a real API call","A business account","At least one board"]'::jsonb),
  ('recipefix', 'youtube', 'API Services compliance audit',
   '["A demo video of the OAuth flow","A privacy policy URL","Answers on data retention and deletion"]'::jsonb)
on conflict (product_id, platform, review_name) do nothing;

-- ── Brand voices (v2 G.2 mix targets) ──────────────────────────────────────
insert into brand_voices (product_id, persona, display_name, description, do_rules, dont_rules, mix_targets)
values
  ('recipefix', 'brand', 'RecipeFix',
   'Plain, specific, and useful. Explains the mechanism behind a swap rather than asserting that it works. Never enthusiastic on the product''s behalf.',
   array[
     'Lead with the reader''s problem, in five words or fewer',
     'Name the mechanism: what the ingredient does, not that it is better',
     'Use real numbers from the adaptation',
     'Admit when a substitution costs something'
   ],
   array[
     'Never claim a swap is 1:1',
     'Never promise nutrition accuracy',
     'Never mention a competitor',
     'No exclamation marks'
   ],
   jsonb_build_object('transformation', 0.40, 'education', 0.25, 'community', 0.20, 'product', 0.15)
  ),
  ('recipefix', 'founder', 'Isaac',
   'A person building something in public. Talks about what broke, what surprised him, and what he changed. Promotional only by accident.',
   array[
     'Show the actual thing, screenshot or number',
     'Say what went wrong before what went right',
     'Short sentences. Fragments are fine'
   ],
   array[
     'No growth-hacking voice',
     'No thread-bait numbering',
     'Never ask for a retweet'
   ],
   jsonb_build_object('founder_insight', 0.70, 'education', 0.20, 'product', 0.10)
  )
on conflict (product_id, persona) do nothing;

-- ── Slots (v2 E.3) — named windows, not fixed times. ───────────────────────
-- Evening is the strategic bet for a cooking product: people decide what to
-- cook between 4pm and 7pm.
insert into slots (product_id, platform, name, window_start, window_end)
select 'recipefix', p.platform, s.name, s.window_start, s.window_end
  from (values ('x'),('instagram'),('tiktok'),('pinterest'),('youtube'),('threads')) as p(platform)
 cross join (values
    ('morning', time '06:30', time '08:30'),
    ('midday',  time '11:30', time '13:00'),
    ('evening', time '17:00', time '19:30'),
    ('late',    time '20:30', time '22:30')
 ) as s(name, window_start, window_end)
on conflict (product_id, platform, name) do nothing;

-- ── Templates (v1 §5.1 images, §5.2 video) ─────────────────────────────────
insert into templates (id, product_id, renderer, format, aspect_ratio, description) values
  ('transformation_diff_1x1',  'recipefix', 'satori',    'image',    '1:1',  'Struck-through original above the swap, reason below'),
  ('transformation_diff_4x5',  'recipefix', 'satori',    'image',    '4:5',  'Feed-optimised transformation card'),
  ('carousel_6',               'recipefix', 'satori',    'carousel', '4:5',  'Original, what breaks, swaps, why, chef notes, result'),
  ('substitution_ratio',       'recipefix', 'satori',    'image',    '1:1',  'Ratio card plus the failure mode'),
  ('chef_note_quote',          'recipefix', 'satori',    'image',    '1:1',  'Pull quote on brand background'),
  ('pinterest_tall',           'recipefix', 'satori',    'pin',      '2:3',  'Keyword-forward, long half-life'),
  ('scaling_math',             'recipefix', 'satori',    'image',    '1:1',  'Doubling is not multiplication'),
  ('TransformationDiff',       'recipefix', 'remotion',  'video',    '9:16', 'Original strikes, replacement slides in, reason caption'),
  ('SubstitutionExplainer',    'recipefix', 'remotion',  'video',    '9:16', 'Ratio animation, failure mode as payoff'),
  ('ScalingMath',              'recipefix', 'remotion',  'video',    '9:16', 'Non-linear scaling, visualised'),
  ('ChefNoteCard',             'recipefix', 'remotion',  'video',    '9:16', 'Kinetic typography over b-roll'),
  ('FeatureDemo',              'recipefix', 'playwright','video',    '9:16', 'Playwright capture, long wait cut, captioned with the measured time')
on conflict (id) do nothing;

-- ── Series (v2 I.3) — franchises build habit ───────────────────────────────
insert into series (product_id, name, description, template_id, cadence) values
  ('recipefix', 'Fix This Recipe',      'A reader-submitted recipe, adapted on camera', 'TransformationDiff', 'weekly'),
  ('recipefix', 'Why This Swap Is Not 1:1', 'One substitution, one ratio, one failure mode', 'substitution_ratio', 'weekly'),
  ('recipefix', '8 Servings to 2',      'Scaling down without ruining the chemistry', 'scaling_math', 'biweekly'),
  ('recipefix', 'Chef Notes',           'One line from a real adaptation, unedited', 'chef_note_quote', 'twice_weekly')
on conflict (product_id, name) do nothing;

-- ── Hooks (v2 I.4, extended by milestone 27 I.2) ──────────────────────────
-- Seeded, then replaced by measured performance. Every hook carries a type,
-- because "which hook won" is useless without knowing what kind it was.
insert into hooks (product_id, pattern, pattern_template, hook_type, layer, platform, category, source) values
  ('recipefix', 'Why your {dish} is {problem}.', 'Why your {dish} is {problem}.',
   'problem_state', 'text', null, 'education', 'seeded'),
  ('recipefix', '{ingredient} needs {ingredient_2}. Here is why.', '{ingredient} needs {ingredient_2}.',
   'open_loop', 'text', null, 'education', 'seeded'),
  ('recipefix', 'This recipe added an ingredient nobody asked for.', 'This {thing} added {n} nobody asked for.',
   'contradiction', 'text', null, 'transformation', 'seeded'),
  ('recipefix', '{n} changes. {m} of them matter.', '{n} changes. {m} of them matter.',
   'specificity', 'text', null, 'transformation', 'seeded'),
  ('recipefix', 'Doubling a recipe is not multiplication.', 'Doubling {thing} is not multiplication.',
   'myth_bust', 'text', null, 'education', 'seeded'),
  ('recipefix', 'I shipped {thing} and it broke {thing_2}.', 'I shipped {thing} and it broke {thing_2}.',
   'confession', 'text', 'x', 'founder_insight', 'seeded'),
  ('recipefix', 'Watch the crumb when the acid goes in.', 'Watch {thing} when {event}.',
   'demonstration', 'visual', 'tiktok', 'transformation', 'seeded'),
  ('recipefix', 'If you bake without gluten, this one is for you.', 'If you {activity}, this one is for you.',
   'segment_call', 'text', null, 'education', 'seeded'),

  -- Milestone 51: three patterns per type rather than one.
  --
  -- One each was enough to prove the shape and not enough to use. Hook
  -- selection applies a 30-day cooldown per pattern, so a library with a single
  -- entry per type has every type on cooldown after a single use and rotation
  -- falls back to whatever is least stale rather than what fits. Three gives the
  -- rotation something to rotate.
  ('recipefix', 'Your {dish} is {problem} and it is not your fault.', 'Your {dish} is {problem} and it is not your fault.',
   'problem_state', 'text', null, 'education', 'seeded'),
  ('recipefix', 'The {diet} version fails at exactly one step.', 'The {diet} version fails at exactly one step.',
   'problem_state', 'text', null, 'transformation', 'seeded'),

  ('recipefix', 'It works. Nobody can tell you why.', 'It works. Nobody can tell you why.',
   'open_loop', 'text', null, 'education', 'seeded'),
  ('recipefix', 'One line in this recipe is doing all the work.', 'One line in this {thing} is doing all the work.',
   'open_loop', 'text', null, 'transformation', 'seeded'),

  ('recipefix', 'The expensive ingredient is the one you can skip.', 'The expensive {thing} is the one you can skip.',
   'contradiction', 'text', null, 'education', 'seeded'),
  ('recipefix', 'Less liquid. Wetter crumb.', 'Less {thing}. {adjective} {thing_2}.',
   'contradiction', 'text', null, 'transformation', 'seeded'),

  ('recipefix', 'Twelve minutes longer. Twenty-five degrees lower.', '{n} minutes longer. {m} degrees lower.',
   'specificity', 'text', null, 'education', 'seeded'),
  ('recipefix', 'One teaspoon changes the whole texture.', '{n} {unit} changes the whole {thing}.',
   'specificity', 'text', null, 'transformation', 'seeded'),

  ('recipefix', 'Resting dough is not about the gluten.', '{activity} is not about the {thing}.',
   'myth_bust', 'text', null, 'education', 'seeded'),
  ('recipefix', 'Room-temperature butter is not a temperature.', '{thing} is not a {category}.',
   'myth_bust', 'text', null, 'education', 'seeded'),

  ('recipefix', 'I got this wrong for two years.', 'I got {thing} wrong for {n} years.',
   'confession', 'text', 'x', 'founder_insight', 'seeded'),
  ('recipefix', 'The first version of this feature was useless.', 'The first version of {thing} was useless.',
   'confession', 'text', 'x', 'founder_insight', 'seeded'),

  ('recipefix', 'Watch what happens at the four minute mark.', 'Watch what happens at the {n} {unit} mark.',
   'demonstration', 'visual', 'tiktok', 'transformation', 'seeded'),
  ('recipefix', 'Same recipe. Both pans. One swap.', 'Same {thing}. Both {thing_2}. One swap.',
   'demonstration', 'visual', 'instagram', 'transformation', 'seeded'),

  ('recipefix', 'For anybody cooking around somebody else''s allergy.', 'For anybody {activity}.',
   'segment_call', 'text', null, 'community', 'seeded'),
  ('recipefix', 'If you have ever thrown out a whole loaf, read this.', 'If you have ever {activity}, read this.',
   'segment_call', 'text', null, 'community', 'seeded')
on conflict do nothing;

-- ── Voice lexicon (v2 D.2) — cooking is full of terms TTS gets wrong ───────
insert into voice_lexicon (product_id, term, phonetic, notes) values
  ('recipefix', 'ghee',    'gee',                       'hard g, as in geese'),
  ('recipefix', 'tamari',  'tuh-MAR-ee',                null),
  ('recipefix', 'za''atar','ZAH-tar',                   null),
  ('recipefix', 'roux',    'roo',                       null),
  ('recipefix', 'quinoa',  'KEEN-wah',                  null),
  ('recipefix', 'mise en place', 'meez ahn plahs',      null),
  ('recipefix', '450°F',   'four hundred fifty degrees','normalise before synthesis'),
  ('recipefix', '1¾',      'one and three quarters',    'fractions are a common TTS failure')
on conflict (product_id, term) do nothing;
