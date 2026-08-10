# Halyard — How It All Works

Every feature, what it does, and why it exists.

---

# The one-sentence version

Halyard reads your product, writes and renders social content from real product output,
checks it four ways, and hands it to you finished. You approve. It publishes and measures.

**Autonomous up to the point of publication, and never past it.**

---

# 1. The daily loop

This is the whole product from your side. Five minutes.

**Morning — `/take`**
Five news stories ranked overnight from your RSS feeds. Tap one, give a single line of
reaction, typed or spoken. Halyard fact-checks your claim against sources *before* drafting,
tells you if you got something wrong, shows the strongest counter-argument, drafts it in
your voice, and predicts the two replies you'll get. Sixty seconds.

**Then — `/queue`**
Six or so finished posts, each with the real rendered image or a playable video. Approve
most, edit one, reject one with a reason. Four minutes on your phone.

**Later — `/inbox`**
Comments on published posts with replies already drafted. Tweak and send. Nothing sends
itself.

**When you have an idea — `/compose`**
Say it in plain language. It works the angle with you and builds the post while you watch.

---

# 2. Where content comes from

## Signals

Six collectors feed a pool of raw material:

| Source | What it provides |
|---|---|
| **Product activity** | Real adaptations via RecipeFix's MCP server |
| **GitHub / release detection** | Shipped features. For RecipeFix it watches the deployed bundle hash, since it ships through Lovable and never tags releases |
| **Editorial backlog** | Your 39 substitution guides, each with a ratio and a failure mode |
| **Seasonal calendar** | Six weeks ahead. Recipe search is intensely seasonal |
| **RSS** | Hacker News above 100 points, Anthropic, OpenAI, arXiv, The Verge |
| **Past performance** | Winners from 30–90 days ago, re-templated |

## Idea ranking

Ideas are scored, and the **primary driver is content-mix debt**. You set targets — 40%
transformations, 25% education, 20% community, 15% product. The system measures actual mix
over 21 days and pushes whichever pillar is furthest behind.

That single mechanism prevents the classic failure of automated content: drifting into
whatever is easiest to generate, which is always product promotion. A hard cap keeps
product content under 15% in any two-week window regardless of scores.

Then: novelty against the last 60 days by embedding distance, seasonal proximity, whether
the format can actually be rendered well, and historical performance once data exists.

## Real artifacts, not invention

When an idea needs product output, Halyard calls `adapt_recipe` on your live MCP server and
builds content from the actual JSON — the real `changeReason` strings, the real
`updated_note` text. Nothing is imagined, so nothing can be wrong about what your product
does.

---

# 3. Writing

## Prompts split by format, not platform

A carousel, a single image, and a Reel script are three different crafts. Eleven format
specs, not six platform prompts.

## Caption architecture

Every prompt enforces structure:

- **Hook** — first 3–5 words, works with no context
- **Body** — the specific claim, traced to the artifact
- **Turn** — the counterintuitive part. This is what earns the save
- **Close** — no CTA on most posts. A CTA every time trains people to scroll

## The hook system

The highest-leverage three seconds in the product, so it's a subsystem.

**A hook is four coordinated artifacts, not one string:**

| Layer | Constraint |
|---|---|
| On-screen text, frame 1 | 4–7 words, high contrast, safe area |
| Spoken, 0–1.5s | Lands inside 1.5 seconds |
| Visual, 0–3s | A pattern interrupt, never a static title card |
| Caption first line | Works with no video context — feeds truncate |

Eight variants generated across at least four named types, filtered to five before you see
them. Eight types tracked separately: `problem_state`, `contradiction`, `specificity`,
`myth_bust`, `open_loop`, `segment_call`, `confession`, `demonstration`.

A type can't repeat consecutively. A specific pattern cools down for 30 days. Performance
is recency-weighted so a winner from six months ago stops dominating. And **payoff
verification fails closed** — if a model can't confirm the body delivers what the hook
promised, the variant is rejected.

---

# 4. The four quality gates

Nothing reaches your queue without passing all four. That's what keeps the queue worth
reading.

**Gate 1 — Copy lint.** Deterministic, no model call. Em dash is a hard reject. So are
"it's not just X, it's Y," "let's dive in," "game changer," "10x," "unlock," "seamlessly,"
"delve," rocket emoji, plus structural checks: sentence-length variance (humans vary
wildly, models don't), opening lines over 12 words, adjective stacking, hashtag counts per
platform.

**Gate 2 — Claim verification.** Every factual claim carries a source path into the stored
artifact — `steps[3].updated_note`. A verifier resolves each path and confirms support.
Unresolvable or unsupported means rejected and regenerated. Hard-blocked regardless of
source: nutrition accuracy claims, "perfect 1:1 substitution," allergy guarantees,
competitor comparisons, fabricated testimonials.

**Gate 3 — Visual QC.** Dimensions, text overflow, safe area, contrast, carousel aspect
consistency (Instagram silently crops to slide 1), black frames, loudness at −14 LUFS. Plus
retention rules as enforced constraints: **time-to-content** measures the opening static
run, so logo bumpers, intro cards and title slides are all caught by one measurement. A
video over 20 seconds with no visual state change inside 15 seconds fails. Then a vision
model scores sampled frames against a rubric and rejects below 3.5.

**Gate 4 — Audio QC.** Round-trip Whisper transcription against the source script. Word
error rate above 2% means something was mispronounced, and every failure adds a candidate
to the pronunciation lexicon — so the lexicon grows itself. Pacing 140–175 wpm, true peak
under −1 dBTP, trailing silence under 300ms.

---

# 5. Rendering

**Images** — Satori templates: transformation diff, six-slide carousel, substitution ratio
card, chef-note pull quote, tall Pinterest pin, scaling math. All driven by your brand
tokens.

**Video** — Remotion compositions taking a real adaptation as props. Transformation diff,
substitution explainer, scaling math, chef-note card, feature demo. Free at your company
size.

**Voice** — Your ElevenLabs clone. Three modes: `founder_cloned` (default, with a brief
disclosure), `founder_recorded` (you record, for high-trust moments like a launch video),
and `text_only` (music bed, on-screen text — a large share of output, since most short-form
is watched muted).

**Screen capture** — Playwright drives the live RecipeFix app. Three verified flows: a real
gluten-free adaptation, the swap toggle changing four things at once, and cook mode
reaching a running timer. A `verify-flows` job runs on a schedule and on deploy detection,
so capture fails loudly instead of recording black frames when a selector changes.

---

# 6. Scheduling

Same insight, different artifact per platform. Same day, staggered. Never the same minute.

| Rule | Value |
|---|---|
| Same platform, minimum gap | 4 hours |
| Cross-platform, same idea | 45–90 minutes |
| Founder vs brand, same platform | 3 hours |
| Jitter on every time | ±7 minutes |
| Short video per week | 3–5. Below 3 the algorithm deprioritises; above 7 retention degrades |
| Pinterest | 3–5 pins/day — it's a search index, not a feed |

Slots are named windows, not fixed times: morning, midday, **evening (17:00–19:30)**, late.
Evening is the strategic bet for a cooking product, since that's when people decide what to
cook.

---

# 7. Publishing

**Transport per account.** X and Bluesky publish direct. The rest go through a unified
provider that has already passed every platform review. Switchable per account with no code
change.

**Link strategy differs by platform.** On X the link goes in the first reply, because a post
containing a URL costs $0.20 versus $0.015 and link posts are algorithmically
deprioritised. Instagram and TikTok use link-in-bio. Pinterest puts the destination on the
pin, which is its whole strength.

**Smart routing.** Every link goes through `/r/[id]`, which sends iOS to the web share URL —
your universal links mean the installed app takes over — and desktop to the web. Every click
is logged with device class, independent of whether PostHog fires.

**Safety.** Publish is idempotent with a unique index and a pre-flight check. A malformed
response writes a row with a null post ID and never retries, because a retry there
double-posts. Cross-product publish is blocked by a composite foreign key, so a brand post
reaching your founder account is structurally impossible rather than merely unlikely.

---

# 8. Measurement

Every link carries `utm_content = content_item_id`. Once RecipeFix captures UTMs, a cohort
query answers the only question that matters: **how many activated users did this specific
post produce?**

Activation is *adapted a recipe AND (saved it OR started Cook Mode) in the first session.*

Scoring weights conversion at 0.60, engagement 0.25, reach 0.15. Saves count for more than
likes, because they're worth 2–3× to the algorithm.

Web and App Store conversions show as separate columns, never summed — they come from
different systems.

---

# 9. What it never does

Enforced in code, not policy:

- Publishes without your approval. No timer, no threshold, no confidence score
- Replies to anyone. There's no `reply()` method on the adapter interface and a test
  asserts its absence
- Follows, unfollows, or engages
- Invents an opinion you didn't express. Skip `/take` for a week and no news posts go out
- Fabricates a testimonial or a statistic
- Claims nutrition figures are accurate, until you've validated them against USDA

---

# 10. Multi-product

Brand accounts are per-product. The founder account is **one identity shared across
everything** — a founder post about RecipeFix sets `about_product_id` so it still
attributes to RecipeFix in analytics.

Adding Kinolog is a five-minute wizard. It has no MCP server, so it uses GitHub-only or
manual as its connector. Visuals still work fully — Playwright captures any public web app
by CSS selector. The only thing you lose is claim verification against live output; claims
trace to the brief instead, which makes the brief matter more, not less.

---

# 11. The failure mode to watch

It isn't a bad post. Approval catches those.

It's a queue full of competent, on-brand, correctly-formatted, forgettable content that you
rubber-stamp because reviewing carefully stopped feeling worth it. Volume without a point
of view.

Three defences are built in: the queue stays small enough to read, QC failures never reach
you, and opinion content is input-gated so the part of your feed carrying personality
cannot be generated without you.

The fourth defence is yours. **Reject things properly when they're boring.** One rejection
with a real reason teaches the system more than three lazy approvals — after ten in a
category it tells you what your rejections have in common and offers to make it a rule.
