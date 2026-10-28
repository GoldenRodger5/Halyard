> **2026-10-28 operating model supersession:** [Founder-led 14-day content and operations](FOUNDER_OPERATING_MODEL_2026-10-28.md) replaces earlier auto-creator and auto-approval requirements. Collaborative creation, exact-batch founder approval, then automated supported posting/analytics and source-linked market research. Blotato remains under evaluation; external comments/replies/DMs require separate owner decisions.

# RecipeFix social playbook (2026-10-27)

What to post, where, how often, in what order, and how the machine decides.
Written after the first week of building the lean lane and a round of market
research. Numbers from vendor blogs are directional; the plan is built to
learn our own numbers fast and replace them.

## 1. The one decision that matters most: the niche

Platforms classify a new account by what its first ~20 posts attract. If we
post general food history and trivia, we build an audience of trivia fans, and
trivia fans do not need RecipeFix.

**Our niche is "cooking around a diet or a headcount"**: gluten-free,
dairy-free, vegan, high-protein, allergies, halving and doubling. Every
format serves it:

- quizzes are about labels, swaps, kitchen math and diet myths (most of the
  fact bank already is);
- food history appears only when it carries a cooking or diet takeaway
  (the tomato ruling, tomato pills), as a variety slot, not a pillar;
- recipe videos are Originals that already fit a diet, or that we show
  adapted.

The people who save "Which pantry staple usually contains wheat?" are the
people who will paste a recipe into RecipeFix next week.

## 2. Content ladder: what to lead with

Do **not** lead with a product intro. A brand-new account opening with an
ad gets shown to almost nobody, and the viewer review agrees (it marks hard
product endings as ad-like every time). Do not hide the product either:

| Phase | When | Mix | Product presence |
|---|---|---|---|
| 0. Bank | before the first post | build 30 approved posts (2 weeks of buffer) | n/a |
| 1. Earn attention | weeks 1–3 (0 → ~1k followers) | 70% diet-niche games (quiz sets, myth or fact, kitchen math, label detective, this-or-that); 20% Originals recipe videos; 10% before/after transformations | one small line at the end + the profile link; never an ad slab |
| 2. Show the trick | weeks 4–8 | 50% games; 30% transformations ("making this dairy-free: what changes in the STEPS"); 10% recipes; 10% app intro / demo | a transformation IS the product, shown as useful content; one intro a week |
| 3. Double down | week 9+ | whatever the numbers say (§5) | add founder-on-camera, Product Hunt, Spark Ads on proven winners |

The before/after transformation is the bridge: it is genuinely useful to a
stranger AND it can only exist because of RecipeFix. That is why it grows
from 10% to 30%.

## 3. Cadence per platform (first 30 days)

| Platform | Volume | Post types | Notes |
|---|---|---|---|
| TikTok | 1 a day | 5 videos + 2 photo carousels a week | Research: 1–2/day for new accounts; consistency beats bursts. A trending sound is added in the app only (API can't), so post as draft and add the sound when there is time. |
| Instagram | 4 Reels + 2 carousels a week | Reels = the TikTok videos; carousels = quiz decks, swap guides | Reels find new people; carousels get saved (≈9× single images). |
| YouTube Shorts | 3–4 a week | the best-reviewed videos only | 2–4 a week is where per-Short performance peaks. |
| X | 1–2 a day | quiz image + answer thread, one-line swap tips, the occasional video | Never a link in the main post (near-zero reach); replies matter more than volume, and replies are human-only (policy). |
| Threads | 1 a day | mirror of the X post | cheap to repeat. |
| Pinterest | 3–5 pins a week | recipe pins, swap-guide carousels | Not built yet. Pinterest is search for recipes and pins live for months; strongest long-tail fit of all. |

Weekly production: ~7 videos, 2–3 carousels, 7–14 X/Threads posts, 3–5 pins.
Cost at current prices: images $0.05, review $0.02, voice (optional) ~$0.05 a
post, so about $3–5 a week. Rendering is free (local).

## 4. Variety: the format × topic grid

The scheduler (`mk plan-week`) never repeats a format back to back, never
reuses a fact within 30 days, rotates topics, and caps product intros at one
a week. Formats available, by status:

| Format | Platforms | Status |
|---|---|---|
| Quiz, 1 question / 3-question set | TikTok, Reels, Shorts, X, Threads | built (`mk quiz`), 20 facts, 4 sets |
| Myth or fact | same | built |
| Food history story (narrated) | same | built (`mk history`); out of rotation, 6/5/3/7 after 5 rounds |
| This or that (3 rounds) | same | built (`mk versus`); out of rotation, 6/4/3/6 after 5 rounds |
| Recipe video (Originals) | same + Pinterest | built (`mk recipe`), restyle per review pending |
| App intro (real screens, voice) | same | built (`mk app --voice`) |
| Quiz carousel / swap guide carousel | IG, TikTok photo mode | built (`mk slides`) |
| Single image + answer thread, X text | X, Threads, IG feed | built (`mk image`) |
| List video ("Looks vegan? Check these 5") | TikTok, Reels, Shorts, X, Threads | built (`mk list`): 3 lists, stamp reveal per item, label checklist close |
| Before/after transformation video | all | **not built**: the bridge format; next to build |
| Founder on camera | all | human only; highest-trust format per research |

## 5. How the machine decides what to post (the learning loop)

1. **Plan:** `mk plan-week` proposes the slate from the grid + fact bank +
   history, with variety rules.
2. **Make:** each item renders with QA (text read-back, safe zones, contrast,
   claims, no em dashes / stock AI phrasing).
3. **Review:** `mk critique` (vision model as a stranger in the feed) must say
   "post" (stop ≥7, stay ≥7, engage ≥6, looks-human ≥7). Below the bar the
   item is remade once with the fixes, then dropped.
4. **Approve:** the owner approves the week's slate (one preview page), until
   a month of results earns auto-approval.
5. **Queue:** `mk run-plan --live` schedules in Blotato at the planned times.
6. **Measure (not built):** 48 h and 7 d after each post, pull Blotato post
   analytics (views, average watch, likes, saves, shares, profile visits,
   link clicks) into the run record.
7. **Learn (not built):** weekly, score each format × topic by saves+shares
   per 1k views and profile visits per 1k views; shift the next week's grid
   80% toward winners, keep 20% exploring. Report it in one page.

RecipeFix-side attribution is required to know whether any of this makes
customers: a distinct UTM per platform on the profile link, and
`acquisitionEvents.source()` must stop folding social into "referral".

## 6. What must happen before autonomous posting (in order)

1. Create RecipeFix accounts (TikTok, Instagram, YouTube, X, Threads,
   Pinterest) and connect them in Blotato. Today's key is Moment Circuit's
   workspace. **Owner.**
2. Merge the format branches (slides; history/versus when done).
3. Build the before/after transformation video from real stored results.
4. Grow the fact bank to ~60 sourced facts (a research agent drafts with
   primary sources and quotes; owner spot-checks a batch).
5. Build the analytics pull + weekly report (Blotato analytics endpoints).
6. UTM'd profile links + the RecipeFix source() fix.
7. Bank 30 approved posts.
8. Run it: a nightly local job (launchd) on this Mac, since rendering uses
   Chrome and Apple Vision OCR here; or a scheduled cloud routine for planning
   and analytics with rendering kept local.
9. Weeks 1–4 the owner approves each weekly slate; then auto-approve anything
   that passes QA and review, with a daily digest.

## 7. Organic growth from zero: the tactics we use

Research 2026-10-27 (sources at the end). Most published numbers are vendor
blogs; the tactics below are the ones every source agrees on. Each one is
marked **machine** (the pipeline does it), **assist** (the pipeline prepares
it, a person does it) or **human**.

**Search is the discovery engine now, hashtags are labels.**
- *machine*: one target search phrase per post, chosen from real autocomplete
  suggestions (Google, YouTube, Pinterest), placed in the first ~50 caption
  characters, in the on-screen hook in the first 3 seconds, and spoken when
  voiced. TikTok indexes burned-in text, so the quiz question is the keyword.
- *machine*: 3–5 hashtags, never more (Instagram caps at 5): one niche
  (#glutenfree), one specific (#glutenfreetips), one community (#foodtok), and
  #recipefix. No made-up "trending" tags, no repeating the same set every post.
- *machine*: YouTube titles lead with the search phrase; the first description
  line repeats it.

**Series beat one-offs.** A named, numbered series ("Label Detective #4",
"Kitchen Math #2") gives a reason to follow for the next one. *machine*: every
quiz set and format is a series with a running number; captions say "#4".

**Profile = landing page.** Bio states the niche in search words ("gluten-free,
dairy-free & scaled recipes, fixed"), one UTM'd link, three pinned posts (the
best-reviewed quiz, one transformation, one recipe). *human, once*.

**Early engagement.** Reply to every comment in the first hour; on TikTok,
reply to good questions *with a video* (each one is a new post). *assist*: the
pipeline renders a "you asked" answer card from a comment's text; a person
picks the comment and posts.

**X grows by replies.** Small accounts grow mostly by useful replies under
bigger accounts in the niche (dietitians, gluten-free and vegan cooks, recipe
creators). Automated replies break X's rules. *assist*: a daily list of 10
fresh posts worth answering, with the fact from our bank that answers them.

**Stitch/duet the niche.** React to a trending kitchen myth with the sourced
answer. *assist*: watchlist of trending myths; the answer card is our myth
format.

**Pinterest is search with a long tail.** Every RecipeFix Original page is a
2:3 recipe pin linking to recipefix.app/original-recipes/<id> (a real site
visit, not just a view); 2–3 pin variants per recipe on keyword-named boards
("Gluten-Free Dinner Recipes"); recipe Rich Pins from the page's Recipe schema.
*machine* once the Pinterest account exists.

**Seasonality.** Diet-swap demand spikes around holidays (Thanksgiving sides,
holiday baking, January high-protein). The planner pulls seasonal facts and
recipes 2–4 weeks early (60–90 days for Pinterest). *machine*.

**Cross-post, never copy-paste.** One video, platform-specific captions and
titles (already how `record.posts` works).

**Later, once there is an audience:** Instagram trial reels (need 1k
followers), collaborations with small diet creators (the `collaborators`
field), founder on camera, Spark Ads on proven organic winners.

## 8. POC build plan (in order; nothing final is made until the pipeline passes)

The two-week buffer is made only after the templates themselves pass the
viewer review. Until then every render is a pipeline test.

| # | Deliverable | Acceptance | Owner |
|---|---|---|---|
| P1 | Merge carousel/image/X formats; finish history + this-or-that | each format renders, passes QA, and has a viewer critique on file | lead + agents |
| P2 | Search-keyword + hashtag module (autocomplete-sourced, tiered tags, series numbers) wired into every format's captions | every post has a target phrase in caption head + on-screen hook; 3–5 tags; no repeated tag set within a week | lead |
| P3 | Before/after transformation video from stored real RecipeFix results | renders the real ingredient + step changes; QA + critique | agent |
| P4 | Fact bank to ~60, all with primary-source quotes, diet-niche weighted | `loadFacts` validates every entry; owner spot-checks 10 | agent |
| P5 | Template perfection loop: make → critique → fix until the median critique is "post" for quiz sets, transformations and carousels | 3 consecutive "post" verdicts per format | lead |
| P6 | Pinterest pin format (2:3, recipe pins → Originals pages) | renders, QA, link + board in record | lead |
| P7 | Analytics loop: Blotato post analytics at 48 h / 7 d into records; weekly report; format × topic weights fed to `plan-week` | report runs on real data | lead (needs accounts) |
| P8 | Attribution: UTM per platform; RecipeFix `source()` separates social | a test visit from each UTM lands as its platform | lead (RecipeFix PR) |
| P9 | Assist kit: daily X reply targets, "you asked" comment-reply card, myth watchlist | one daily digest file | lead |
| P10 | Runner: nightly launchd job (plan → make → review → digest; queue when approved) | a full dry-run week on disk | lead |
| P11 | Bank the two-week buffer (~30 posts) from the perfected templates; queue in Blotato once RecipeFix accounts are connected | 30 approved posts scheduled | lead + owner |

**Status (2026-10-27, night):** Creative strategy researched and written (`CREATIVE_STRATEGY.md`: sound, platform matrix, reading pace, AI labels, the product bridge). Applied: AI labels from asset provenance; list pace 2.8 words/s with ~8-word lines (~33 s videos); mid-beat punch-in; loop seam; pinned-comment bridge with UTM per platform; every list also ships as a TikTok photo carousel (`list-photos` slot); quiz carousels end on the answers with claim-matched images. The reviewer now judges within the no-footage format, and "a pro team would post it" is advisory (owner decision 2026-10-27). `mk batch list all` renders, reviews and builds the owner's review page in one command. **Waiting on the owner:** music beds (GarageBand sound library download, or approval to use a free licensed library), a Pexels API key for real stock footage, RecipeFix accounts connected in Blotato, a separate `MK_OPENAI_API_KEY`.

Owner-only: create the RecipeFix accounts and connect them in Blotato; write
the bio; pin posts; approve the first weekly slates; be on camera sometimes.

### What the viewer review taught us (2026-10-27, P5 round 1)

Each line was a reviewer complaint that held up when checked against the frames.

- **Ten evenly spaced stills lie.** A long shot read as "a duplicate slide" and a
  transition as "a blank frame". The reviewer now sees one labelled frame a second.
- **Pacing is the first thing that kills a quiz.** 47 s for three questions scored
  stay 4. The timer starts ~1 s in (people read during it), and only the core
  sentence of an explanation is on screen; the full one is in the caption.
- **End on the viewer, not the brand.** A RecipeFix row on the last frame read as
  "a hidden ad" every time. The account is RecipeFix and the tie is in the
  caption; the video ends on a score prompt or a checklist worth saving.
- **A warning alone is not worth saving.** Each list item names the swap when the
  source gives one, and the close is a checklist of what to look for.
- **Every reveal needs a beat.** A list item is name, then a stamp slammed in with
  what is hidden in it, then the line: something changes every half second.
- **The picture must suit the audience** (no steak on a vegan list), and the
  title must fit every item ("things", not "foods", when beer is on it).
- **Qualify the claim on screen** ("often", "some", "classic ones"); a reviewer
  docks credibility for an absolute.
- **QA must not be loosened to pass.** OCR boxes around outlined display type run
  ~40 px wide, so display text sits further in rather than the check shrinking;
  a duplicate word matched to two lines is attribution, not an overlap.

### P5 round 2 (2026-10-27): what moved the score and what did not

The reviewer is now the median of three reviews, one labelled frame per second.

| Change (one per round, not-vegan list unless noted) | stop/stay/engage/human |
|---|---|
| Sticker look, full sentences | 7/7/6/6 |
| Editorial look (brand serif, flat stamps) | 7/7/6/7 |
| + source quote card with highlighted label words | 7/7/5/7 (read as "homework") |
| + guess beat ("What's hiding in it?") | 7/6/6/7 (longer, so stay fell) |
| Quote card off, guess on item 1 only, ~14 s | 7/7/6/7 |
| Magazine look (photo + paper band, big ink type) | 7/7/6/6 |
| **Content: surprising items** (hidden dairy: hot dogs, tuna, shellfish, steak; FARE) | **7/8/6/7**, "would leave at: never" |

- **Design has stopped moving the score; content still does.** Four layouts land within a
  point of each other. The one jump came from items the audience does not already know.
  Write lists from surprising, sourced facts first.
- **Calibration:** two real food-media shorts through the same reviewer scored
  2/4/2/5 (Tasty, re-cut horizontal) and 7/5/4/6 (Business Insider). Ours beat both. The
  reviewer is not harsh across the board; 8–9 is reserved for native, high-engagement posts.
  "A pro team would post it exactly as is" has been no for everything, the benchmarks
  included, so the owner's own approval stays the real gate.
- **The ceiling for stills plus text is about 7/8/6/7.** The remaining notes are about the
  format ("same template with swapped footage"). The next step up is moving footage
  (real cooking clips, or the owner on camera), not another layout.

## 9. What the machine never does

No auto-following, auto-liking or auto-replying (platform policy; human
only). No engagement bait ("comment A or B", "follow for part 2"). No health
or allergy-safety claims. No counts that drift. No publisher photos. No post
without QA and a "post" review.

## Sources (2026-10-27 research)

Cadence: JoinBrands (TikTok frequency), Socialinsider 2026 Instagram
benchmarks, Metricool YouTube Trends 2026, Commeta X frequency study. Growth:
Sprout Social and Metricool TikTok SEO guides; Creator Lane (Instagram
5-hashtag cap) and Phable (Mosseri on hashtags vs captions); Lilach Bullock
and Graham Mann on X growth by replies; SEO Sherpa and Postiz on Pinterest SEO;
vidIQ on YouTube SEO; TikTok newsroom (reply to comments with video); SocialKit
on duets and stitches. Format evidence: QUIZ_FORMAT_RESEARCH.md.
