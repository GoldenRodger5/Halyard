-- §286. RecipeFix had no signal sources at all.
--
-- Not "none enabled" — none. `rss_sources` held eight rows and every one
-- belonged to the `founder` product, seeded by 0013 for an account about AI.
-- So `collect_signals` for recipefix had nothing to read, `proposeFromSignals`
-- had nothing to propose from, and generation logged "no proposed ideas to
-- draft, and none could be proposed" and stopped. The product the entire system
-- exists to market could not originate a single idea on its own.
--
-- Every URL below was fetched before being written here, and each returned 200
-- with real items. 0013's own comment records the cost of not doing that: its
-- seeded Anthropic feed 404'd from the day it was written. Four other plausible
-- candidates were rejected during this check — Serious Eats and Beyond Celiac
-- return 403 to a non-browser agent, Food52 rate-limits, and the FDA food-safety
-- feed is a dead URL.
--
-- Weighted by how close a source sits to the product's actual subject: a coeliac
-- authority publishing a labelling change is worth more than a general food blog
-- publishing a recipe, and both are worth having.
insert into rss_sources (product_id, name, feed_url, why, weight) values
  ('recipefix', 'Gluten Free Watchdog',
   'https://www.glutenfreewatchdog.org/news/feed/',
   'Independent testing of gluten-free labelling. The closest thing this niche has to a primary source, and the one most likely to carry something nobody else has.',
   1.5),
  ('recipefix', 'Celiac Disease Foundation',
   'https://celiac.org/feed/',
   'Medical and regulatory news for the audience that cannot get this wrong.',
   1.4),
  ('recipefix', 'Gluten Intolerance Group',
   'https://www.gluten.org/feed/',
   'Certification and cross-contamination guidance — the subject the product is actually about.',
   1.3),
  ('recipefix', 'FDA recalls',
   'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml',
   'Allergen recalls. High volume and mostly irrelevant, so weighted down, but an undeclared-gluten recall is the single most useful thing this account could post the day it happens.',
   0.8),
  ('recipefix', 'King Arthur Baking',
   'https://www.kingarthurbaking.com/blog/feed',
   'Technique from a source bakers already trust, and the substitution questions it raises are the product''s whole subject.',
   1.1),
  ('recipefix', 'Gluten Free on a Shoestring',
   'https://glutenfreeonashoestring.com/feed/',
   'What people in this niche are actually cooking, from someone who has been doing it for a decade.',
   1.0),
  ('recipefix', 'The Kitchn',
   'https://www.thekitchn.com/main.rss',
   'General home cooking. Weighted lowest: broad, and useful mainly for what the wider audience is asking about this week.',
   0.7)
on conflict do nothing;
