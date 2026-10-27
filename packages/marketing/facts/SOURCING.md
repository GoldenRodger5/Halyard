# How the quiz fact bank is sourced

`food-facts.yaml` is the only source of quiz answers. Nothing in it was written
or checked by a model call. This note covers how a fact gets in. The 2026-10-27
expansion (P4) followed it for all 45 new facts.

## What may be cited

In order of preference:

1. Statutes and regulations, read on eCFR (`ecfr.gov`): 21 CFR and 9 CFR.
2. Government agencies: FDA pages and guidance PDFs, USDA FoodData Central.
3. University extension services (NMSU, UF/IFAS).
4. Diet and allergy bodies for their own subject: Celiac Disease Foundation,
   FARE, The Vegan Society.
5. A manufacturer's ingredient label. A retailer page that reproduces the
   label is acceptable when the brand's own site does not show it.
6. Test kitchens (King Arthur Baking) for technique and weights only, never
   for a health or allergy question.
7. Primary historical texts (Project Gutenberg editions, a museum's
   transcription of the original letter) for food history.

Not cited: news articles, Wikipedia, trade blogs and AI answers. These are fine
for finding a lead, and the lead is then checked on one of the sources above.

## The rule for each fact

- The page was opened and read on the `verified` date. `quote` is copied from
  that page character for character. `…` marks text left out, and nothing is
  reworded inside the quote.
- Every number on screen (question, options, why, tip) appears in the quote.
  Arithmetic on a quoted number is avoided. If a number cannot be quoted, the
  fact is dropped.
- When the page could not be read (blocked, 403, JavaScript-only), the fact
  was dropped or a readable primary source was found instead. USDA FSIS and
  MyPlate were unreadable on 2026-10-27, so turkey thawing cites UF/IFAS
  Extension and the MyPlate protein equivalents were left out.
- FoodData Central values come from the FDC app's own data
  (`fdc.nal.usda.gov/portal-data/external/<fdcId>`, the JSON behind the
  `food-details/<fdcId>/nutrients` page). The quote names the FDC id, the food
  description and the per-100 g value exactly as FDC lists them.

## Wording rules

- Say what a food contains or how a label works ("contains wheat"), never
  whether it is safe for someone ("safe for celiacs" is not allowed). Allergen
  facts are about labeling law only.
- No counts that drift, no em dashes, none of the stock AI phrases that
  `humanTextProblems` in `src/studio.ts` rejects. Captions say "3 seconds"
  (the timer), never 5.
- Myth-or-fact statements are used only when the source makes them plainly
  true or false, and some answers are Fact so the game stays honest.
- `image` shows the scene, never the answer.
- `tie` uses only the product claims `core.rewrites_steps`, `core.diets`,
  `core.scaling` and `core.reasons`, and `claims` lists the ones it uses.

## Topics without a TOPIC entry yet

`protein`, `halal` and `baking` are new topic ids. `quiz.ts` and
`keywords.ts` fall back to a generic label and hashtags for unknown topics, so
nothing breaks. Every new fact carries `search:` phrases and its set carries a
label, so the fallback is mostly invisible. Adding the three to `TOPIC`,
`TOPIC_WORDS` and `TAGS` would sharpen single-fact posts.
