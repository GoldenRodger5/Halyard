Verified against web 3f32680f, live bundle assets/index-DXCTkwFa.js, MCP build 9d0df50d5725, iOS 2.5.5, at Sun Oct 25 2026 20:00:00 GMT-0400 (Eastern Daylight Time); knowledge commit e756660ef6e26ff0f3a798fb6256934ef1d4ec95. Claims not listed below do not exist.

# Product (product.md §1–§3)

## 1. One line

**RecipeFix rewrites the recipe you already have for how you eat, including the steps, so it still works.**

Not a recipe site, not a meal-kit, not "an AI chef". It takes someone else's recipe (a link, text or a photo), changes it for a diet and a serving count, and changes the **method** where the swap demands it, with a reason for each change. `VERIFIED` (claims `core.*`).

## 2. Why that is different

| What a reader does today | What goes wrong | What RecipeFix does |
|---|---|---|
| Swaps one ingredient from a substitution chart | The method still assumes the old ingredient: GF batter needs a rest, vegan butter spreads, coconut milk splits under a hard boil | Rewrites the affected steps and says why (`core.rewrites_steps`, `core.reasons`) |
| Halves a recipe in their head | 1½ eggs, a 9×13 pan for half the batter, bake time unchanged | Kitchen fractions, plus step and pan changes (`core.scaling`) |
| Asks a chatbot | It sounds right, but nothing checks it, nothing estimates nutrition, and nothing lands in a cookbook, plan or grocery list | Diet check before display, USDA-based estimate, save, plan, shop, cook (`core.compliance_check`, `core.nutrition`, `loop.*`) |

**The moat is the method rewrite.** Every marketing asset should show it or teach it. `DECISION` (inherited from CLAUDE.md "Instruction rewriting is the moat").

## 3. Audiences and jobs

Usage data: MCP `get_popular_transformations`, 2026-10-26, last 90 days. The counts are small, so read them as direction only.

| # | Audience | Job to be done | Evidence | Marketing angle |
|---|---|---|---|---|
| 1 | **Restriction cooks**: dairy-free, gluten-free, vegan, low-FODMAP, nut-free, often cooking for a family member | "Make the recipe I already found work for my restriction without it failing." | Dairy-free 13 ↑, GF 10 ↑, vegan 7 in 90 days; vegan leads lifetime | Name the failure mode, then the method fix. Never promise safety. |
| 2 | **Scalers** | "Make this for 2, or for 12, without bad maths." | Scaling is the #1 transformation (23 in 90 days); Google sends mostly calculator queries | Pan, egg and bake-time problems: the parts calculators skip |
| 3 | **Goal eaters**: high-protein, keto, low-carb | "Hit my numbers with a dish I already like." | High-protein ↑ | Before→after macros of a real dish, always as an "estimate". Plus nutrition targets. |
| 4 | **Weekly planners** | "Turn a few recipes into a week and one list." | The Plus thesis; little usage so far | The paid pitch. Show the outcome ("Tuesday's tikka is on the list"), not the feature list. |
| 5 | **Baking adapters** | GF and dairy-free baking, where technique changes matter most | Sources: Sally's, Sugar Spun Run, King Arthur | Highest-value proof of the method rewrite |

`HYPOTHESIS`: audiences 1 and 2 are the organic-content audience. Audience 4 is the subscriber, so content wins trust with 1 and 2 and the product converts them to 4.

# Quotable claims (cite the id for every product statement)

- core.intake: Paste a recipe link, paste the text, or snap a photo or PDF of a recipe. (Photo/PDF is live by code path, not re-tested by behaviour. Never promise handwriting.)
- core.rewrites_steps: It rewrites the cooking steps, not just the ingredient list. (See proof.tikka_method_changes for the concrete example.)
- core.reasons: Every change comes with its reason.
- core.only_real_changes_flagged: Only real changes are flagged — swaps, additions and removals.
- core.scaling: Scale to any number of servings, in measurements you can actually use.
- core.compliance_check: Checked against your dietary restrictions before you see it. If it can't be made to comply, you aren't charged. (Presence diets only; English-only scan. Never 'guaranteed', never 'safe for'.)
- core.nutrition: Per-serving nutrition estimates calculated from USDA data.
- core.diets: Gluten-free, dairy-free, vegan, keto, low-FODMAP, high-protein, halal, Whole30 and more — and they combine. (Name diets; NEVER count them (CLAUDE.md gotcha 8).)
- core.refine: Tweak it afterwards: make it creamier, cook it for one.
- loop.cook_mode: Cook Mode walks you through one step at a time, with timers and the ingredients for that step. (Never cite Cook Mode usage. Launch-kit capture showed 'Step 3 of 8' over a step numbered '1.' — check before filming.)
- loop.grocery_list: Add a recipe to your grocery list — amounts merge for you. (FREE for everyone, guests included. Never say Plus 'adds groceries' — Plus adds the WEEK PLAN that becomes one consolidated list (loop.plan_week_one_list).)
- loop.plan_week_one_list: Plan your week and get one grocery list for all of it. [plus] (This is what Plus adds: weekly planning -> one consolidated grocery list (plus nutrition targets, create, shop-what's-missing). The list itself is free.)
- loop.kitchen: See what you can cook with what's already in your kitchen. (Seeing matches is free; 'shop what's missing' is Plus.)
- loop.nutrition_targets: Set calorie and protein targets and see the measured result against each one. [plus]
- client.ios: On iPhone and iPad — share a recipe from Safari straight into RecipeFix.
- client.chrome: Adapt the recipe you're looking at without leaving the page (Chrome). (Never cite the user count.)
- client.claude: Adapt recipes inside Claude. (One MCP server: OAuth at …/functions/v1/mcp (unauthenticated POST -> 401). mcp-service retired 2026-10-20 (56b07dea; POST -> 404). Sign-in required; adaptations count against the plan like any other — never 'free in Claude'.)
- content.originals: RecipeFix Originals — recipes written by RecipeFix. (AI-authored home recipes, NEVER 'tested' (see no.tested_originals). Photos are licensed stock (Unsplash/Pexels), NEVER 'owned' or 'our photos'. No nutrition measured for them.)
- proof.tikka_method_changes: Real RecipeFix result (captured 2026-10-21): scaling a dairy-free chicken tikka masala from 4 to 6 servings changed the steps — broil in two batches at the same time per batch, use the spoon trail instead of multiplying the reduction time, let excess coconut yogurt drip off so it chars, keep the coconut cream at a gentle simmer. (Show the stored output, never a re-typed or re-generated one. NEVER show the '1½ (14.5-oz) can crushed tomatoes' line (an un-buyable amount). Label the source recipe as a RecipeFix Original (AI-authored, not tested).)
- email.marketing_opt_in: Opt in and RecipeFix sends a weekly email. (Explicit opt-in only (profiles.marketing_emails_opt_in). Never imply sign-up subscribes anyone to marketing; the welcome email is account-relationship mail. docs/EMAIL_PROGRAM.md header still says marketing is off — the receipt supersedes it.)
- price.plus: Plus is $3.99/month or $27.99/year.
- price.trial: 7-day free trial on the monthly plan. (Web trial needs a card. No 'new customers only' — not enforced on web.)
- plan.free_limits: Free: 5 adaptations a month and 5 saved recipes. Try 2 without an account.

# Forbidden (never write these, whatever the evidence)

- no.diet_count: "15 diets", "12 diets", "nine diets" → Drifted three times; CLAUDE.md gotcha 8.
- no.safety: "allergy-safe", "safe for celiacs", "guaranteed gluten-free", "doctor approved", "dietitian approved" → English-only presence scan; Terms disclaim medical/allergy use; a false GF claim was live until 2026-10-26.
- no.nutrition_precision: "exact calories", "accurate macros", "lab-verified"
- no.any_recipe: "works with any recipe", "adapt ANY recipe" → Fetches fail, photos may not be recipes, compliance can hard-fail. NOTE: live homepage <title> and Chrome listing still say 'Adapt Any Recipe' — owner to decide.
- no.tested_originals: "tested", "chef-developed", "test kitchen", "tested live"
- no.social_proof: "star ratings", "testimonials", "thousands of cooks", "992 recipes adapted" → None collected; counts are tiny and include test activity.
- no.referral_month: "refer a friend, they get a free month", "Give a friend their first month free", "Get a free month every time they subscribe", "refer a friend, get a free month" → The referred FRIEND gets a 7-day promo trial (on-signup/index.ts; promo-trial.ts). The REFERRER gets, only if they are on Plus via Stripe (or were Plus when the friend signed up), after the friend's FIRST ADAPTATION and abuse checks, at most 3 per year: a Stripe account credit worth one billing month ($3.99 monthly / $2.33 annual) (check-referral-eligibility, process-referral-reward). No Stripe customer (e.g. Apple subscribers) -> no automatic credit. Too conditional to compress into 'free month'. Account.tsx:1016 'Give a friend their first month free. Get a free month every time they subscribe.' and Success.tsx:159/162 'Get a free month · refer a friend' are still on origin/main 619c036a AND in the live bundle (2026-10-26T19:06Z); PR #233 is still OPEN (not merged).
- no.unlisted_price: "$6.99", "$49.99"
- no.personalisation: "learns your taste", "gets to know you" → Taste signals are counted and capped, never learned (gotcha 33).
- no.weight_loss: "lose weight", "burn fat", "slim down" → TikTok Branded Content Policy prohibits weight-loss promotion; also a medical claim.
- no.user_stories: "Four people asked us…", "our users love…" → Any first-person or user story needs a documented source in learnings.md, or it is cut.
- no.publisher_images: "Discover card photos", "saved_recipes.image_url", "search result og:images" → Hotlinked publisher photos; docs/DISTRIBUTION.md.

# Voice and editorial rules (brand.md §1, §3)

## 1. Voice

- **A knowledgeable friend who cooks, not a brand.** Plain, specific, a little dry. Say the number, the temperature, the pan size.
- **Teach the why.** "Coconut milk splits if it boils hard. Simmer, don't boil." beats "Easy dairy-free swap!"
- **Admit limits.** "It's an estimate." "Check the label if it's for a celiac." Honesty is part of the product.
- **No hype words:** *revolutionary, game-changer, magic, effortless, AI-powered* (except where a directory literally asks), *hack* (except quoting a trend), *guilt-free, clean eating, cheat meal* (diet-culture language).
- **Talk to the cook, not the team.** Never "we now show it as a diff". Say what the cook gets.
- **Second person, present tense.** One idea per post.

## 3. Editorial rules

1. **Useful without the app.** At least 8 of every 10 posts teach something a viewer could use tonight without RecipeFix.
2. **One series, one question.** Prefer a named, repeatable series ("What else changes?", "Scale it down", "Hidden in the label") over one-offs.
3. **Show the method change.** If a post mentions a swap, it says what happens to the steps.
4. **Real proof only.** A "transformation" is either a real RecipeFix output (stored response, with its capture date) or a dish actually cooked on camera. Never a mock.
5. **No invented people.** No "four of you asked…", "our users love…", or first-person stories unless the source is recorded in [`learnings.md`](learnings.md).
6. **No conflicting advice.** Before scheduling, check the last 30 days of posts on the same topic. Where two fixes both apply (more oven time vs. cool before cutting), post the **diagnostic**, not one fix.
7. **Health language.** "Flags gluten ingredients", never "celiac-safe". "Estimated 41 g protein", never "41 g protein". Never weight-loss claims.
8. **Numbers get checked.** Every ratio, temperature, time and conversion in a post carries a source (USDA, Monash, King Arthur, a test bake) in the post's record before approval.
9. **Product share caps at 10–15%** of posts, and product posts still teach something.
10. **Seasonal beats trending.** Holiday and New Year diet calendars are known weeks ahead; a borrowed trend sound is optional garnish, chosen by a human in the app.

# Latest learnings (learnings.md, newest 5)

## 2026-10-26 — Two proof/identity assumptions in the first pack were wrong
Type: correction
Evidence: `docs/MCP.md` "Retired" + commit `56b07dea`; `POST …/functions/v1/mcp-service` → 404 `NOT_FOUND` (2026-10-26T19:07Z); `x-deployment-id` `psr2.90e57921-…` at 17:45Z and 19:04Z; live bundle markers (`../evidence/2026-10-26/reconcile-notes.md`).
n: n/a   Confidence: high
- `mcp-service` (static bearer, "no credit") was retired 2026-10-20. The only MCP server is OAuth; `persist:false` is metered unless the account is test/admin. Proof = stored real outputs + committed snapshots of OAuth free reads.
- `x-deployment-id` is not a publish signal. Identity = live bundle entry hash + marker strings (later `/version.json`). A marker must be unique to the commit: "Recently adapted" existed before 8c44a5b4, and the live bundle at 19:04Z still matched the 3f32680f tree.
Change made: ARCHITECTURE §4.2, ROADMAP POC 1/2, knowledge/README §3, QUALITY pre-publish re-check, DECISIONS P4, claims `client.claude`, `verified_against`, `state.json`.

## 2026-10-26 — Baseline before any social posting
Type: outcome
Evidence: MCP `get_product_stats` and `get_popular_transformations` (2026-10-26); `docs/growth/GROWTH_PLAN_1K_MRR_2026-10-24.md`; Halyard `docs/RECIPEFIX_LAUNCH_CHECKPOINT_2026-09-27.md`.
n: n/a   Confidence: high (counts), low (direction)
- 0 public RecipeFix posts on TikTok, Instagram or X. There is no social baseline.
- 62 adaptations in the last 30 days. About 1 paying subscriber. 2 trials ever, 0 converted.
- 90-day transformations: scaled 23, dairy-free 13, gluten-free 10, high-protein 7, low-FODMAP 7, vegan 7, keto 6.
Change made: initial pillar mix weights scaling and restriction "fix-it" content (see `../STRATEGY.md`).

## 2026-10-26 — Prior Halyard drafts would not stop a scroll
Type: correction
Evidence: 17 drafts in Halyard `recipefix/`; `../evidence/2026-10-26/content-research.md` §9.
Confidence: medium (expert review, no audience data)
- 7 of 17 were about gummy gluten-free bread, with contradictory fixes.
- The first frame was a title card, and a subtitle sat inside TikTok's bottom UI band.
- Several unverified first-person user stories.
Change made: editorial rules 2, 5 and 6 in `brand.md`. Narrative-claim check added to QA.
