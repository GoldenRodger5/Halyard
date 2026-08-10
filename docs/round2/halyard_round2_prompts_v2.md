# Halyard — Round 2 Prompts (Milestones 21–32)

Replaces the earlier round 2 document. Twelve milestones, reordered, with four new ones
driven by research on 2026-08-10.

**Read `halyard_operating_model.md` first.** It is canonical on autonomy, approval, and
gate types, and it supersedes the language in v1, v2, and the build pack wherever they
differ. The short version:

> **Halyard is autonomous up to the point of publication, and never past it.**
>
> Every draft arrives finished — a publishable artifact, not a prompt for me to complete.
> Nothing publishes without an explicit human action. Content is either **approval-gated**
> (the system has everything it needs) or **input-gated** (it needs my opinion, and will
> not fabricate one).

**Claude Code handles its own setup in these prompts.** Where a milestone needs Docker,
an env var, a local service, or a dependency, the prompt says so and Claude installs and
verifies it rather than stopping to ask.

## Also update these prompts to reference the operating model

Milestones 27 and 28 changed substantially in this revision. Two extensions to note:

- **Hooks are now a subsystem** (27, Part I): four coordinated layers per variant, eight
  named types, payoff verification, fatigue rotation, and real experiment design
- **Daily Take is now a fact-checked loop** (28, Part B): my raw reaction is verified
  against sources *before* drafting, strengthened, risk-flagged, and cleaned up without
  its opinion being sanded off

---

## What the research changed

Four findings that reshape the build.

**1. Retention mechanics are specific and measurable, and should be enforced in code
rather than left to a prompt.** <cite index="26-1">The first 3 seconds drive 80% of completion variance, and saves are 2 to 3 times more valuable than likes to the algorithm.</cite> <cite index="29-1">Roughly 30 to 50 percent of viewers leave in the first three seconds; another 15 to 25 percent leave between 3 and 10 seconds if the hook does not extend into a payoff.</cite> <cite index="28-1">One pattern interrupt every 10 to 15 seconds resets the viewer's boredom clock, loop endings earn replays, and replays are the strongest watch signal available.</cite> These become composition constraints and QC rules, not suggestions. Milestone 27.

**2. Daily video is the wrong cadence.** <cite index="29-1">Three to five Shorts per week keeps the algorithm confident; below three, per-video reach shrinks because the account is treated as lower priority; above seven, quality drops and average retention degrades, pulling down the channel-level signal.</cite> The scheduler currently has no per-format cadence ceiling. It needs one.

**3. Paid news APIs are the wrong tool for founder content.** RSS is free and higher signal. <cite index="21-1">`hnrss.org/frontpage?points=100` filters Hacker News to posts above 100 points, dramatically cutting noise.</cite> <cite index="22-1">OpenAI, Anthropic, Hugging Face, MarkTechPost, MIT Technology Review AI, arXiv cs.AI and The Verge AI all maintain active RSS endpoints, covering official lab announcements, editorial analysis and primary research.</cite> Milestone 28.

**4. Halyard is missing four things every incumbent has.** <cite index="9-1">Style-matching AI trained on uploaded samples is now the differentiator over generic captions, auto-clipping long video into short is table stakes, and AI replies to comments and DMs is the 2026 frontier.</cite> <cite index="14-1">Best-time-to-post computed from your own audience data beats generic industry averages.</cite> <cite index="11-1">Buffer leads on Threads and Bluesky, and Bluesky has no native scheduling at all, so third-party tools are the only option.</cite> Milestone 31.

---

## Outside the repo, in parallel

| Task | Gates |
|---|---|
| Paste the RecipeFix overview into `/products/recipefix`, run `/onboarding` | Every generated post |
| Service-token path on the RecipeFix MCP server | Milestone 22 |
| RecipeFix P0-0 redeploy, then the UTM hour | Accuracy, then attribution |
| ElevenLabs Professional voice clone | Milestone 30 |
| Music licence | Milestone 30 |
| Photograph 20 dishes cooked from RecipeFix adaptations | Milestone 26 |
| 15 swipe-file posts with one line each on why they work | Milestone 27 |

---

# MILESTONE 21 — Dev environment, owned end to end

````
# Halyard — Milestone 21: Make the environment self-managing

I should never have to debug my own dev environment. Handle all of it.

## Build

1. `scripts/halyard` — a single launcher. Starts Postgres if down, creates and seeds the
   database on first run, repairs `DATABASE_URL` in `apps/web/.env.local` to match the
   role that actually exists on this machine (Homebrew names the superuser after the macOS
   account, not `postgres`), frees port 3200, starts the dev server, opens Chrome when the
   server actually responds. Flags: `--reset`, `--stop`, `--worker`.
2. `.claude/skills/halyard-dev/SKILL.md` so I can say "start halyard" in Claude Code.
3. **Install and verify Docker yourself.** OrbStack via Homebrew, not Docker Desktop.
   Confirm `docker ps` works before finishing.
4. `scripts/doctor` — checks Postgres, database exists, migrations current, env keys
   present, port free, Docker available, worker reachable. Prints a table of pass/fail
   with the exact fix command for each failure.
5. `pnpm dev:all` — web plus worker plus a log tail, one command.
6. Seed data good enough to evaluate the UI: 20 content items across every status,
   platform and format, with real rendered assets so the queue is not full of placeholders.

## Definition of done

From a clean clone on a machine with only Homebrew and Node, `./scripts/halyard` brings up
a working, populated app with no manual steps. Verify by testing it.
````

---

# MILESTONE 22 — Live RecipeFix connection

````
# Halyard — Milestone 22: Real product data

Milestone 3 built the MCP connector against a scripted server. It has never spoken to the
real one.

## Context

RecipeFix's MCP server lives at `supabase/functions/mcp` in the RecipeFix repo, 21 tools,
built for interactive OAuth clients. A service-token path is being added on that side;
assume a static bearer in `RECIPEFIX_MCP_TOKEN`.

## Build

1. Wire `RecipeFixConnector` to the live server.
2. **Adaptation takes 60 to 75 seconds.** Timeout at 150s, one retry, clear failure
   surfacing. The generate job must not assume a fast response.
3. **`estimate_nutrition` currently returns non-2xx in production.** Treat nutrition as
   optional enrichment — if it fails, content still generates without macros. Never let it
   kill a post.
4. Cache adaptations in `product_artifacts` keyed on the request. Never pay 75 seconds
   twice for the same source recipe.
5. Rate limit: 20 adaptations per hour. This spends my real credits.
6. Health check on `/settings/health` with per-tool status.
7. "Generate test sample" on `/products/recipefix` showing raw JSON.

## Definition of done

A generate job builds a draft from a real live adaptation, end to end.
````

---

# MILESTONE 23 — Multi-product, and a founder who is not a product

````
# Halyard — Milestone 23: Add any app, plus a personal persona

Two problems. Adding a product currently means writing code. And the founder account posts
about AI, tech, and industry news — not about a product — but `brand_voices` is scoped to
`products`, so there is nowhere for that content to live.

## Build

### Add-a-product wizard at `/products/new`

Five steps, no code:

1. Name, tagline, URLs, audience timezone
2. Brief — paste markdown or upload. Auto-derive `brief_summary`
3. Brand tokens — colour pickers, font upload, live preview against a real template
4. Connector — pick one of:
   - **MCP** (url + token, with a test-connection button)
   - **REST** (base url + auth header + an endpoint map)
   - **GitHub only** (repo, for changelog signals with no live product API)
   - **None** (manual — content comes only from ideas I write and RSS)
5. Voices — founder and brand, seeded from the brief, editable

Every connector type must work. A product with `connector_type: 'none'` is fully usable;
it just cannot call `generateSample()`, and the idea engine must route around that rather
than erroring.

### Personal persona

Add `products.kind`: `'product' | 'personal'`. A `personal` product has no connector, its
own voice, its own signal sources (RSS, milestone 28), and its own mix targets. Create one
called `founder`.

Founder mix targets, from the original brief: 70% non-promotional, 20% building and
operating, 10% direct promotion. The 10% draws from **any** product, so a founder post can
be about RecipeFix or Kinolog. Add `content_items.about_product_id`, distinct from
`product_id`, so a founder post about RecipeFix is attributable to RecipeFix in analytics.

### Cross-product view

`/` gets an all-products mode. The queue can filter by product or show everything.
Analytics can compare products.

## Definition of done

I can add Kinolog through the UI in five minutes with no code, and a founder post about an
AI news story exists with no product attached.
````

---

# MILESTONE 24 — GitHub connector

````
# Halyard — Milestone 24: Ship notes as content

Halyard has no awareness of what the products actually shipped.
`ProductConnector.getChangelog()` is an interface method with no implementation.

## Build

1. `GitHubConnector` on a fine-grained read-only PAT (`GITHUB_TOKEN`), scoped per product:
   `owner/repo`, branches, and paths considered user-facing.
2. Hourly poll: merged PRs, releases, tags, commits on watched paths.
3. **Summarise into shipped features.** Raw commit messages are not content. A Claude call
   converts a batch into user-facing capability statements, discarding refactors,
   dependency bumps, CI, and formatting. Store as `signals` with `source = 'changelog'`.
4. **Brief staleness detection.** When shipped features accumulate past a threshold since
   `products.brief_updated_at`, warn on the dashboard: the brief no longer describes the
   product, and every generation prompt is drifting from reality.
5. `/products/[id]/changelog` — reviewable list, each with "Turn into a post" and "Ignore".
6. Never leak commit SHAs, branch names, file paths, or internal naming into generated
   copy. Add slop-filter rules to reject them.

## Definition of done

A merged PR in the RecipeFix repo appears as a plain-English feature statement within an
hour, promotable to a draft.
````

---

# MILESTONE 25 — Worker container and first rendered video

````
# Halyard — Milestone 25: Render something

Four Remotion compositions exist as tested TSX and not one frame has ever been rendered.
This is the only part of the pipeline that has never executed.

## Build

1. Build the worker Dockerfile. Verify Chromium, FFmpeg and whisper.cpp inside it.
   Install Docker yourself if absent.
2. Render all four compositions from a real RecipeFix adaptation. Write MP4s where I can
   watch them.
3. Run the visual QC gate against real video, not fixtures.
4. Tune concurrency to container CPU. **Record actual render time per composition in the
   docs** — this determines whether the cadence in milestone 27 is achievable.
5. Verify caption burn-in and timing drift on real audio.
6. Deploy to Railway or Fly. Heartbeat on `/settings/health`.
7. Render timeout at 15 minutes, failing cleanly with a retry button in the queue.

## Definition of done

Four watchable MP4s from a real gluten-free bread adaptation, rendered by the deployed
worker, each having passed visual QC.
````

---

# MILESTONE 26 — Assets and capture

````
# Halyard — Milestone 26: Real material

Templates render brand tokens and text. No product screenshots, no photography, no b-roll.
Content built this way looks like a template because it is one.

## Build

1. `/assets` — upload, tag, search, bulk operations.
2. **Playwright capture flows**, finally:
   - `adapt_and_reveal` — paste URL, select gluten-free, wait, expand a SWAPPED badge
   - `swap_toggle` — one toggle changes ingredient, step text, title and macros together
   - `cook_mode_timer` — timer running, then a locked screen
   Handle the 75-second adaptation: capture at full speed, speed-ramp the wait to ~2s
   under a progress overlay in Remotion, full speed on the reveal.
3. Capture produces stills and video, auto-tagged, into the library.
4. Templates can reference assets. A carousel slide can carry a real screenshot; a video
   composition can use captured footage as a layer.
5. Re-capture job runnable on demand and after product releases, so screenshots never show
   stale UI.
6. Asset picker in co-pilot and queue detail, so I can swap an image without regenerating.

## Definition of done

A carousel renders containing a real screenshot of the RecipeFix result card, and a video
composition includes captured swap-toggle footage.

## Note

I will upload photographs of dishes cooked from real adaptations, tagged `photo` + `dish`.
Make them available to templates. They will outperform anything rendered.
````

---

# MILESTONE 27 — Content quality and retention engineering

````
# Halyard — Milestone 27: The milestone that decides if any of this is worth publishing

Take this one slowly. Everything else makes the machine run. This decides whether the
output is good.

## Part A — Split prompts by format, not platform

One prompt per platform is too coarse. A carousel, a single image and a Reel script are
three different crafts on Instagram alone.

```
prompts/copywriter/
  x/insight.v1.md              text only, link never in body, 1-2 hashtags
  x/thread.v1.md               first post must stand alone
  instagram/carousel.v1.md     slide by slide, one idea per slide
  instagram/single.v1.md       hook / body / turn / close
  instagram/reel_script.v1.md  written for motion and captions, not prose
  tiktok/script.v1.md          verbal hook lands inside 1.5 seconds
  pinterest/pin.v1.md          keyword-forward title, alt text, destination link
  youtube/short.v1.md          title, description first line above the fold
  threads/post.v1.md           conversational, inline links work
  founder/take.v1.md           news commentary, opinion-led
  founder/tip.v1.md            tool or technique worth sharing
```

## Part B — Caption architecture, explicit in every prompt

- **Hook** — first 3 to 5 words, works with no context. Never a question opener unless
  the question *is* the insight
- **Body** — the specific claim, traced to the artifact
- **Turn** — the counterintuitive part. This is what earns the save
- **Close** — no CTA on most posts. A CTA every time trains people to scroll

## Part C — Retention engineering, enforced in code

Research findings that become constraints, not suggestions:

**The 3-second rule.** The first 3 seconds drive ~80% of completion variance. 30-50% of
viewers leave in that window; another 15-25% leave by 10 seconds if the hook does not pay
off. Therefore:

- Video compositions **must** open on content. No logo bumper, no intro card, no title
  slide. Add a QC rule that rejects any composition whose first 90 frames contain no
  substantive content
- Script prompts hard-ban: "hey guys", "in this video", "let's talk about", "welcome back",
  any restatement of the title, any generic promise ("this will change how you cook")
- First frame is a thumbnail. 4 to 7 words of text, high contrast, inside safe area.
  Enforce in visual QC

**Pattern interrupts.** One every 10 to 15 seconds resets attention. Add a composition
constraint: any video over 20 seconds must have a visual state change at least every 15
seconds. Assert it in QC by frame-diffing.

**Loop endings.** Replays are the strongest watch signal available. TikTok and Reels
compositions should end on a frame that reads as a continuation of the opening. Add
`loop_ready: boolean` per composition and default it on for those platforms.

**Open loops.** The script prompt should structure as: hook opens a curiosity gap, body
answers in stages, each stage opening the next. Not one fact stated once.

**Hook sprints.** This is now its own subsystem — see Part I.

## Part I — The hook system

Hooks get their own architecture because they are the highest-leverage 3 seconds in the
product, and "generate 5 variants" undersells what is possible.

### I.1 — A hook is four things, not one

Currently the system treats "hook" as a single string. It is four coordinated artifacts
that must cohere without being identical:

| Layer | Constraint | Example |
|---|---|---|
| **On-screen text** (frame 1) | 4–7 words, high contrast, inside safe area | "Your GF bread is gummy" |
| **Spoken** (0–1.5s) | One sentence, lands inside 1.5 seconds, no throat-clearing | "Gluten-free bread goes gummy for one reason." |
| **Visual** (0–3s) | A pattern interrupt. Motion, cut, or state change — never a static title card | Loaf collapsing, then the fix |
| **Caption** (first line) | Works with no video context, because feeds truncate | "Nobody swaps this correctly." |

Generate all four per variant. QC rejects a variant where they contradict each other or
where the text hook is just the spoken hook transcribed.

### I.2 — Named hook types, tracked separately

A taxonomy, because "which hook won" is useless without knowing what kind it was:

| Type | Shape | Best for |
|---|---|---|
| `problem_state` | Name the reader's failure | Education, technique |
| `contradiction` | Something that shouldn't be true, is | Transformations |
| `specificity` | A precise number as the whole hook | Scaling, ratios |
| `myth_bust` | The common belief is wrong | Substitution guides |
| `open_loop` | Withhold the payoff explicitly | Any video |
| `segment_call` | Address one group directly | Dietary content |
| `confession` | I got this wrong | Founder |
| `demonstration` | Watch what happens | Video only |

Track performance per type per format per category. Eight types across six formats is
enough resolution to learn something and not so much that every cell is empty.

### I.3 — Generate 8, surface 5

Generate eight variants spanning at least four types, then filter to the five strongest
before showing me. The filter removes: near-duplicates, anti-patterns (below), and
anything whose four layers don't cohere.

Showing me eight is worse than five. Choice fatigue is real and I am doing this daily.

### I.4 — Hook anti-patterns, hard rejected

Beyond the general slop filter:

```
questions with obvious answers        "Want better bread?"
generic promises                      "This will change how you cook"
"How to ..." as an opener             flat, no tension
listicle counts without specificity   "5 tips for baking"
"Let me show you"                     preamble, not hook
restating the title                   wastes the window
brand name in the first 3 words       nobody cares yet
any hook over 12 words
```

### I.5 — Payoff verification

A hook that promises something the body doesn't deliver is clickbait, and it trains an
audience to distrust the account. Add a QC check: a model reads the hook and the body and
answers whether the hook's promise is delivered, and where. Fail closed.

This matters more than it sounds. It is the difference between a hook library that
compounds and one that burns the account down slowly.

### I.6 — Fatigue and rotation

- No hook **type** used twice consecutively on the same account
- A specific hook **pattern** cools down for 30 days after use
- Performance is recency-weighted, so a pattern that worked six months ago doesn't
  dominate forever
- Track `uses` and `last_used_at` per pattern

### I.7 — Extraction from the swipe file

When I save a swipe entry, extract its hook, classify the type, and add the *pattern* —
not the literal text — to the library. My taste enters the system as structure rather than
as a vague instruction.

### I.8 — Predicted stop rate in the queue

Each variant shows a predicted 3-second retention, based on historical performance of its
type in that format and category. Cold start shows "no data" rather than a fabricated
number. Never render a confident prediction over n=2.

### I.9 — Real experiments, once volume allows

A proper A/B: same body, same render, same slot, **only the hook varies**, across
comparable platforms or across two weeks. Store `experiment_id` and `variant_id` on
content items so results are attributable rather than anecdotal.

This is the loop that compounds. Everything else in Halyard makes production faster; this
makes the output better over time.

### I.10 — Schema

```sql
alter table hooks add column hook_type text not null;
alter table hooks add column layer text not null;      -- text|spoken|visual|caption
alter table hooks add column pattern_template text;    -- "Your {thing} is {problem}"
alter table hooks add column last_used_at timestamptz;
alter table hooks add column recency_weighted_score numeric;
alter table hooks add column source text;              -- generated|swipe|manual

create table hook_variants (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  hook_type text not null,
  text_hook text not null,
  spoken_hook text,
  visual_direction text,
  caption_hook text,
  predicted_stop_rate numeric,
  selected boolean not null default false,
  experiment_id uuid,
  created_at timestamptz not null default now()
);
```

## Part D — Optimise for saves, not likes

Saves are worth 2-3× likes to the algorithm, and save-bait for a recipe product is
obvious: reference material. Ratios, conversion charts, substitution tables,
"what eggs actually do in baking". The idea engine should weight save-optimised formats
higher, and the scoring function should weight `saves` above `likes` explicitly.

## Part E — Cadence ceilings per format

3 to 5 short videos per week is the sweet spot. Below 3 the algorithm deprioritises the
account; above 7 quality drops and average retention degrades, which pulls down the
channel-level signal. Add per-format weekly ceilings and floors to the scheduler, not just
per-platform daily caps.

## Part F — Swipe file, wired into generation

`/swipe` browsing UI. I paste URLs or screenshots with one line on why each works. The
copywriter receives 3 to 5 relevant entries as few-shot examples, matched on format and
category.

## Part G — Regeneration that learns

Capture every rejection reason. After 10 rejections in a category, surface "your rejections
in {category} cluster around {pattern}" and offer to add it to the slop filter.

## Part H — Slop rules for spoken copy

Written and spoken tells differ. Add: no "so there you have it", no sign-off, no "make sure
to", no restating the hook as the first spoken line, no "but first".

## Definition of done

One idea produces six drafts that read as six different pieces of writing. A 30-second
video opens on content within 3 frames, changes visual state every 15 seconds, ends
loop-ready, and ships with 5 hook variants I can choose between. Show me a side-by-side.
````

---

# MILESTONE 28 — Founder content engine

````
# Halyard — Milestone 28: The founder account

I post about AI, SaaS, tech news, tools I find, and occasionally my own products. Right
now nothing feeds that.

## Part A — RSS ingestion, not a paid news API

RSS is free and higher signal for this use case. Build an `rss_sources` table and an
hourly poller. Seed with:

| Source | Feed | Why |
|---|---|---|
| Hacker News, 100+ points | `hnrss.org/frontpage?points=100` | Community-filtered, dramatically less noise than the raw front page |
| Anthropic news | official feed | Primary source |
| OpenAI news | official feed | Primary source |
| Hugging Face blog | official feed | Model and tooling releases |
| arXiv cs.AI | official feed | Primary research |
| MIT Technology Review AI | official feed | Editorial analysis |
| The Verge AI | official feed | Mainstream framing |
| TLDR AI | newsletter/feed | Compressed daily digest |

Make sources editable in the UI. Dedupe by URL and by title similarity, because the same
story arrives from five feeds.

## Part B — Daily Take: an input-gated loop

Read `halyard_operating_model.md` §2 first. This is the canonical example of an
**input-gated** workflow: the system cannot proceed without my opinion, because it does not
have one, and generating a take unprompted would be fabrication.

**The system must never synthesise an opinion I did not express.** If I skip a day, no
opinion content goes out.

### B.1 — Morning: five stories

Rank the last 24 hours on relevance to my work (AI, dev tools, consumer apps, SaaS), how
contested the topic is, freshness, and whether I have posted about it recently. Surface
the top five on `/take`.

Each story shows:

- Two-line summary
- **Why it was ranked** — the actual reason, not a score
- Source links, and how many feeds carried it (convergence is signal)
- **What is contested about it** — the disagreement, if there is one. This is what makes
  a take possible
- A freshness indicator. News decays; a take on a four-day-old story is dead on arrival,
  and stories should expire rather than linger

### B.2 — My input: one line, typed or spoken

A text field and a mic button. Whisper transcribes. Speaking is faster and produces more
natural phrasing than typing, and my raw reaction is the raw material — messy is fine.

Optional second field: "who is this for" if I want to aim it.

### B.3 — What Halyard does with it, in order

**1. Fact-check my claim.** Web search to verify every factual assertion I made. If I am
wrong about something, **say so before drafting anything**. Show me what I got wrong, with
sources. This is the single most valuable step in the loop — it stops me posting something
false at speed, which is the characteristic failure of fast commentary.

**2. Verify the story itself.** Confirm the underlying news is accurate and not a
misreading of a headline. Check whether it has been updated, corrected, or denied since
the feed picked it up.

**3. Strengthen the argument.** Find supporting evidence for my position, and the
strongest honest counter. Surface both.

**4. Flag risk.** Before drafting, check whether this take:
   - names a real person or company critically
   - could age badly if the story develops
   - touches a contested political topic I have not chosen to be in
   - makes a claim I cannot personally support
   - is a hot take I would regret in a month

Show the flags. Do not refuse — that is my call — but do not let me walk into it blind.

**5. Draft in my voice, preserving the opinion.** Explicit instruction in the prompt:
*sand nothing. Do not neutralise the take into a summary. If the input is a strong claim,
the output is a strong claim.* The most common failure of AI-assisted commentary is
regression to a balanced non-statement, and it must be prevented deliberately.

**6. Clean up only.** Grammar, structure, length, rhythm. Not stance, not hedging, not
added caveats.

**7. Predict the pushback.** What will people reply with? Show me the two most likely
objections so I can decide whether to preempt them in the post or leave them as
conversation.

### B.4 — What I see back

```
MY TAKE (raw)
  "the moat isn't the model anymore its the workflow around it"

FACT CHECK                                                    ✓ 2 checked
  ✓ Claim about model commoditisation — supported, 3 sources
  ⚠ You implied {X} shipped this week. It was announced in June.
    Corrected in the draft.

STRONGEST COUNTER
  Frontier capability gaps still determine what workflows are
  possible at all. Worth acknowledging or you'll get this in replies.

RISK                                                          ✓ clear
  No named criticism. Not politically contested. Ages fine.

DRAFT                                                    [X · founder]
  ...

LIKELY PUSHBACK
  1. "Models still differentiate at the frontier"
  2. "This is just the commoditisation argument again"

[Approve]  [Edit]  [Regenerate with note]  [Discard]
```

### B.5 — Rules

- No draft without my input. Ever
- Fact-check runs **before** drafting, not after, so I can revise my own take
- If fact-checking contradicts my central claim, say so plainly and do not draft until I
  respond
- Store the raw take alongside the draft. The diff between them is voice training data
- Stories expire after 72 hours and drop off the list

## Part C — Tips, tools, and finds

A `finds` table plus three capture paths:

- A bookmarklet that posts the current URL to Halyard
- An iOS Shortcut hitting the same endpoint from the share sheet
- Paste into `/finds`

Each find gets an auto-generated summary and a suggested angle. I add one line on why it
is useful; it becomes a post. Same principle as Part B: the system does the assembly, the
opinion is mine.

## Part D — Building-in-public from GitHub

The 20% "building and operating" slice draws from the milestone 24 GitHub connector across
**all** products. "Shipped ingredient-anchored scaling this week, here is why it was harder
than it looks" is a founder post about RecipeFix, with `about_product_id` set so it is
attributable.

## Part E — Founder mix enforcement

70/20/10 enforced with a hard ceiling on the 10%, as with brand accounts. If I have posted
two product posts in the last fortnight, the engine will not queue a third regardless of
how good the idea is.

## Definition of done

`/take` shows 5 ranked stories each morning. One line from me produces a posted-ready
draft in my voice. `/finds` turns a pasted URL into a draft. Founder mix is enforced.
````

---

# MILESTONE 29 — End-to-end tests

````
# Halyard — Milestone 29: Prove the daily path

316 tests cover units and integration. Zero cover the path I use every day. Nobody has
clicked approve.

## Build Playwright E2E against a seeded database

1. **Daily path**: drafts appear → open detail → edit copy → approve → verify scheduled →
   run publish job → verify `publications` row and status transition
2. **Rejection**: reject with reason → stored → surfaces as negative example
3. **Regeneration**: note reaches the prompt, new draft replaces old
4. **Co-pilot**: message → stream → preview renders → send to queue with QC attached
5. **QC blocking**: seeded slop-filter failure never reaches the queue
6. **Kill switch**: toggled off, publish job runs, nothing publishes, item stays approved
7. **Mobile**: full approve flow at 390px
8. **Onboarding**: five steps complete → generation unblocks
9. **`draft_only` account**: publish → draft mode, `awaiting_manual_publish`, deep link
10. **Daily Take**: story ranked → one-line input → draft produced

Run in CI against a Postgres service container. Keep out of the default `vitest run`.

## Definition of done

`pnpm test:e2e` green in CI, covering every state transition I touch daily.
````

---

# MILESTONE 30 — Audio

````
# Halyard — Milestone 30: Voice and sound

Prerequisites I provide: an ElevenLabs Professional voice clone (`ELEVENLABS_VOICE_ID`)
and a licensed music library.

## Build

1. Wire ElevenLabs synthesis. ~30 lines; everything around it exists.
2. **Seed `voice_lexicon`** — built and tested but empty. Cooking terms that break TTS:
   tamari, ghee, za'atar, roux, quinoa, mise en place, plus "450°F" → "four hundred fifty
   degrees" and "1¾ tsp" → "one and three quarter teaspoons".
3. Audio QC against real synthesis: round-trip whisper, WER under 2%, 140-175 wpm,
   −14 LUFS, true peak under −1 dBTP, trailing silence under 300ms.
4. **Every WER failure adds a lexicon candidate** for review. The lexicon grows itself.
5. **Word-synchronised captions**, not just burned-in text. Word-level highlighting
   measurably increases watch-through by giving the eye something to track when audio
   attention drifts. Use whisper word timestamps.
6. Music bed in Remotion with ducking under voiceover.
7. `audio_mode` wired: `founder_cloned` (default, disclosed), `founder_recorded`,
   `text_only`.
8. **Disclosure enforcement**: `founder_cloned` sets `ai_components: ['voiceover']` →
   `requires_ai_label` true → publish job refuses without disclosure text. Test the refusal.

## Definition of done

A video renders with my cloned voice, correct pronunciation of five terms generic TTS gets
wrong, word-synced captions, a ducked music bed, and a verified disclosure line.
````

---

# MILESTONE 31 — The features every incumbent has

````
# Halyard — Milestone 31: Close the gaps

Research against Buffer, Hootsuite, Later and Sprout surfaced five capabilities Halyard
lacks. Build the four that matter for a solo operator.

## A. Best time to post, from my own data

Generic "best times" are inaccurate for any specific account. Once 30+ posts exist per
platform, compute optimal slots from actual engagement on my own posts and narrow the slot
windows automatically. Show the computation, not just the answer, and never override a
slot I have pinned manually.

## B. Auto-clipping, long to short

A tool without long-to-short clipping is behind in 2026. If I record a 5-minute walkthrough
or a founder talk, Halyard should transcribe it with whisper, identify 3 to 5 candidate
segments by topical coherence and hook strength, and render each as a 9:16 short with
captions. Segment selection is a Claude call over the timestamped transcript.

## C. Link-in-bio page

A hosted page at `/l/[slug]`, public, brand-themed per product, editable link list,
click-tracked with UTMs consistent with everything else. Instagram and TikTok captions
cannot carry clickable links, which makes this the actual conversion path on both.

## D. Competitor and topic watch, read-only

Not full social listening. A `watch_terms` table, a daily read-only pass over public
sources, surfacing recurring questions and complaints as `signals` for idea generation.
**No auto-engagement, no auto-reply, no DMs.** Discovery only.

Skip X here — reading is $0.005 per third-party post and the economics do not work. Use
RSS, Reddit's public JSON, and Pinterest trends instead.

## E. Bluesky and Threads

Bluesky has no native scheduling at all, so third-party tools are the only option, and
competition there is thin. Both are cheap to add on top of the existing adapter interface.

## Not building

Auto-reply to comments and DMs. It is where the incumbents are heading and it is the wrong
call for a founder-led brand. Halyard drafts; I send.

## Definition of done

Slot windows narrow from my own data. A 5-minute recording produces 3 captioned shorts.
`/l/recipefix` is live and click-tracked. Watch terms produce ideas.
````

---

# MILESTONE 32 — Production hardening

````
# Halyard — Milestone 32: First contact

Every adapter is contract-tested and none has met a real API. Expect one bug per platform.

## Build

1. **Request/response logging** for every platform call, tokens redacted, 7-day retention.
2. **Dry-run mode per adapter** — build the exact request, log it, do not send. Lets me
   inspect what X or Instagram would receive before spending money or posts.
3. **Adapter self-test** on `/accounts`: verify token, scopes, and a trivial read. On
   demand and daily.
4. Fix the three predicted first-contact issues: X v2 media upload, Instagram `alt_text`
   on carousel children, Pinterest analytics envelope.
5. **Milestone 19 UI** — browsing screens for series, hooks, submissions, swipe file.
6. Sentry in both tiers with source maps.
7. Data export to JSON. Token rotation UI.
8. **Rehearse build pack §3 failures** in staging: malformed publish response, token expiry
   mid-publish, render timeout past a slot, connector unreachable. Confirm each behaves as
   specified.

## Definition of done

Every adapter passes self-test against a real credential, dry-run shows the exact request
before sending, and the four failure rehearsals behave as documented.
````

---

# Order

| Week | Send | Do yourself |
|---|---|---|
| 1 | 21, 22, 23 | Paste brief, run `/onboarding` calibration, register six dev apps |
| 1 | 24 | Record demo session, submit four reviews |
| 2 | 25, 29 | Photograph 20 dishes, RecipeFix UTM hour |
| 2 | 26 | Build the swipe file, 15 posts with notes |
| 3 | **27** | Voice clone recording session |
| 4 | 28, 30 | Music licence |
| 5 | 31, 32 | Flip capability states as approvals land |

**27 is the one that matters.** Everything else makes the machine run correctly. 27 decides
whether what comes out is worth publishing, and it is the only milestone where I would
happily spend a week.
