-- ═══════════════════════════════════════════════════════════════════════════
-- Seed — RecipeFix configured end to end, plus the template and slot catalogue.
--
-- Idempotent: safe to run repeatedly. Contains no secrets and no tokens.
-- The first-run wizard (build pack §2) overwrites voice and brand values with
-- the operator's own answers; these are defaults, not opinions.
-- ═══════════════════════════════════════════════════════════════════════════

insert into products (
  id, name, tagline, website_url, status,
  connector_type, connector_config, brand_tokens, content_rules,
  audience_timezone, operator_timezone
) values (
  'recipefix',
  'RecipeFix',
  'Adapt any recipe to how you actually eat',
  'https://recipefix.app',
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
  'America/New_York'
) on conflict (id) do nothing;

insert into onboarding_state (product_id) values ('recipefix')
  on conflict (product_id) do nothing;

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
  ('FeatureDemo',              'recipefix', 'playwright','video',    '9:16', 'Playwright capture, speed-ramped, captioned')
on conflict (id) do nothing;

-- ── Series (v2 I.3) — franchises build habit ───────────────────────────────
insert into series (product_id, name, description, template_id, cadence) values
  ('recipefix', 'Fix This Recipe',      'A reader-submitted recipe, adapted on camera', 'TransformationDiff', 'weekly'),
  ('recipefix', 'Why This Swap Is Not 1:1', 'One substitution, one ratio, one failure mode', 'substitution_ratio', 'weekly'),
  ('recipefix', '8 Servings to 2',      'Scaling down without ruining the chemistry', 'scaling_math', 'biweekly'),
  ('recipefix', 'Chef Notes',           'One line from a real adaptation, unedited', 'chef_note_quote', 'twice_weekly')
on conflict (product_id, name) do nothing;

-- ── Hooks (v2 I.4) — seeded, then replaced by measured performance ─────────
insert into hooks (product_id, pattern, platform, category, source) values
  ('recipefix', 'Why your {dish} is {failure_mode}.',            null, 'education',      'seeded'),
  ('recipefix', '{ingredient} needs {ingredient_2}. Here is why.', null, 'education',    'seeded'),
  ('recipefix', 'This recipe added an ingredient nobody asked for.', null, 'transformation','seeded'),
  ('recipefix', '{n} changes. {m} of them matter.',              null, 'transformation', 'seeded'),
  ('recipefix', 'Doubling a recipe is not multiplication.',      null, 'education',      'seeded'),
  ('recipefix', 'I shipped {thing} and it broke {thing_2}.',     'x',  'founder_insight','seeded')
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
