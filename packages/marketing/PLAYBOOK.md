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
| Food history story (narrated) | same | agent finishing (`feat/mk-formats-history-versus`) |
| This or that (3 rounds) | same | agent finishing |
| Recipe video (Originals) | same + Pinterest | built (`mk recipe`), restyle per review pending |
| App intro (real screens, voice) | same | built (`mk app --voice`) |
| Quiz carousel / swap guide carousel | IG, TikTok photo mode | built on `feat/mk-formats-slides`, to merge |
| Single image + answer thread, X text | X, Threads, IG feed | built on `feat/mk-formats-slides` |
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

## 7. What the machine never does

No auto-following, auto-liking or auto-replying (platform policy; human
only). No engagement bait ("comment A or B", "follow for part 2"). No health
or allergy-safety claims. No counts that drift. No publisher photos. No post
without QA and a "post" review.
