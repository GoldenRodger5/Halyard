# Per-platform coverage: what exists, what doesn't, and what to build

Written 14 August 2026, against the code rather than against intent. Every claim
here was checked before it was written.

---

## 1. The honest answer

**Mechanically, coverage per platform is real.** Strategically, there is one
brain wearing seven hats.

| | Status |
|---|---|
| Publishing per platform | **Built.** Seven adapters, 246–470 lines each, with real per-platform knowledge |
| Constraints per platform | **Built.** Formats, hashtag ceilings, aspect ratios, link strategy, transport |
| Format choice per platform | **Built** (this week). Reads each adapter's declared capability |
| Manual handover where no API exists | **Built** (this week) |
| Research agents per platform | **None**, and deliberately — see §7. P2 added a per-platform *strategy* model instead, because Halyard has published nothing for a research agent to study |
| Reach/distribution agents | **None** |
| Product understanding | **Built (P1).** The Product Brain crawls the public site, reads the App Store listing and the connector's own tool surface, and stores facts that cite the evidence behind them. The hand-written brief is now one evidence source among several rather than the only one |
| Intelligent layer choosing what to show off | **Partial.** Mix debt and novelty, now over a Product Brain rather than a hand-written brief |
| Outreach | **None** — and deliberately, see §5 |

### What "one brain in seven hats" means concretely

At generation time the only things that differ per platform are: the format, the
hashtag ceiling, and a prompt variant. The *idea* — what to talk about, which
feature to show, what angle to take — is chosen once, per product, and then
dressed for each destination.

That is not obviously wrong. It is a real strategy, and for a small brand it may
be the right one. But it is a decision that was never made deliberately, and it
is the ceiling on quality right now: a TikTok that would work is not a Pinterest
pin with different dimensions.

---

## 2. Product understanding: the largest gap

The system's entire model of RecipeFix is `products.brief_markdown` — a document
**you wrote** — plus a connector that calls RecipeFix's own API for artifacts
(adaptations, substitutions) to build posts from.

That means:

- It knows what you told it. It cannot discover a feature you forgot to mention.
- It cannot notice that a feature changed, except through `detect_release`,
  which watches the homepage for edits.
- `shipped_features` exists as a table with **zero rows in production**, and the
  only thing that writes it is a prompt constant in `connectors/github.ts` that
  nothing calls.

`AGENTIC_PLAN.md` Phase 3 (the Explorer) is exactly this, and it is unbuilt:
crawl the product with Playwright, sign in with supplied credentials, walk the
real flows, read the code, reconcile the three into a feature inventory where
each entry is `verified` or honestly marked `unverified`.

**The plan's ordering is right and worth restating: build the verifier first,
then the crawler.** An inventory nobody can check is worse than no inventory,
because it reads as knowledge.

---

## 3. What per-platform agents would actually be for

Not "an agent per platform because there are several platforms." The question is
what differs enough between them to be worth a separate loop.

Three things genuinely do:

1. **What performs.** Pinterest rewards evergreen searchable pins with a
   months-long tail. TikTok rewards a hook in the first second and forgets you
   in three days. These are not the same content strategy with different crops.
2. **What is allowed.** Each platform's rules on links, disclosure, and
   promotional framing differ, and they change.
3. **What is already there.** The same substitution posted to a feed where it
   did well last month is a different decision from posting it somewhere new.

A per-platform loop is worth building where it reads *measured* results for that
platform and changes what gets made for it. Everything else is a prompt variant,
and prompt variants do not need agents.

**Which means this cannot be built usefully before Phase 0.** With no published
posts there is nothing per-platform to learn from, and a "TikTok strategist"
would be a model asserting best practices from its training data — the exact
thing this project has spent days removing.

---

## 4. The intelligent layer

There is one: `ideaEngine.ts` scores candidates on mix debt (are we
under-posting education?) and novelty (have we said this recently?).

What it lacks is any notion of **what is worth showing off**. It cannot rank
"the scaling maths is genuinely unusual" above "we also have a shopping list",
because it has no model of which features are differentiating — only the brief's
prose.

That is downstream of §2. A verified feature inventory, with each feature marked
for how unusual it is and what evidence supports that, is what would let the
strategist rank. Building the strategist first would produce confident rankings
over nothing.

---

## 5. Outreach — a direct conflict worth naming

Outreach was asked for. It conflicts with a standing rule set earlier in this
project:

> No auto-reply, no auto-DM, no engagement automation.

That rule is why `collect_comments` collects and the inbox states plainly that
it never sends. It is also the rule most likely to keep these accounts alive:
automated DMs and replies are the fastest route to a platform ban, and on
several of these platforms they violate the terms directly.

**This is your call to reverse, not mine to quietly work around.** Three
distinct things sit under "outreach", and they are not equally risky:

| | Risk | Recommendation |
|---|---|---|
| Drafted replies to real comments, shown for approval, sent only on your click | Low | Reasonable to build |
| Automated DMs to strangers | Bans accounts, violates terms | Do not build |
| Finding relevant conversations to join, surfaced as suggestions you act on | Low if it never posts | Reasonable to build |

The first and third preserve the rule's substance — nothing leaves without a
human — while removing the drudgery. If that is what "outreach" meant, say so
and it gets built. If it meant automated engagement, I would push back once and
then do what you decide.

---

## 6. How it looks in the UI

The approval model is now: **you see it, you press the button.** That shipped
today.

```
/queue/[id]
├── Copy, media, claims, destination        (existing)
├── QC — copy · claims · visual · audio · coherence
│
├── ▸ Post now                    [approved/scheduled only]
│     "Otherwise it goes out Thursday 09:20."
│     [ Post it now ]
│
└── ▸ Post this yourself          [awaiting_manual_publish]
      "This account cannot post through an API."
      [Copy caption] [Copy alt text] [Copy link] [Open tiktok ↗]
      ┌──────────────────────────────┐
      │ caption, already joined to   │
      │ its hashtags, as reviewed    │
      └──────────────────────────────┘
      1. Download video
      Paste the link once it is up:  [_________] [ I posted it ]
```

Two rules hold in that design, and both are load-bearing:

- **The caption is pre-joined to its hashtags.** Assembling it by hand is
  exactly where the posted version drifts from the reviewed one.
- **The URL back is required.** Without it nothing can collect metrics and
  nothing proves the post exists — the item would claim `published` on an
  assertion, which is the shape of every "it looked done" bug found here.

### What the remaining phases would add

- **Per-platform panel** on `/analytics`: what works here, measured, with sample
  sizes shown and the honest "not enough data yet" until there is.
- **Feature inventory** at `/product`: every feature the Explorer found, each
  marked verified or unverified, with the evidence and the date it was checked.
  Unverified entries visibly distinct — this is the screen most likely to be
  believed by accident.
- **Suggested replies** in the inbox, if §5 is approved: drafted, never sent,
  each needing a click.

---

## 7. Recommended order

1. **Phase 0 — publish.** Blocked on you. Everything below is unmeasurable
   without it, and a strategy agent with no data is a confident guess.
2. **Phase 3 — the Explorer**, verifier first. The largest real gap, and the one
   that does not need published posts to be worth building.
3. **Per-platform strategists**, once there is measured per-platform data.
4. **Suggested replies**, if the rule in §5 is relaxed.

The thing to resist is building 3 before 1. It would produce a system that
sounds authoritative about what works on TikTok, having never posted to TikTok.


---

## 7b. What P2 changed, and the specialist question

P2 added the strategic layer this document called for in §1 — the answer to
*"one brain wearing seven hats"* — and deliberately did **not** add the eight
platform specialist agents the implementation plan names.

### The capability model

Two capability words already existed and both were right about different things:
`CapabilityState` is account lifecycle, `Capability` is a transport observation.
P2 added no third vocabulary. It added `resolveCapability`, a pure function that
reads both — plus platform constraints and product policy — and returns one
verdict with the reason that produced it. It has no store of its own, on the
same reasoning as P1's `deriveFactStatus`: a resolver with state becomes a
fourth opinion that can drift from the three it reconciles.

The verdict distinguishes `declared` from `verified`, and only `verified` is
actionable. An adapter's claim about itself is the weakest evidence in the
system and must not read like a probe.

### Why no specialists were built

Every proposed specialist had to answer: *what does a model perceive here that
deterministic code cannot?* None could.

A platform specialist would be asked what it believes about TikTok's algorithm.
It has no evidence to perceive — Halyard has published nothing, so there is no
performance data — and the answer would come from the model's training rather
than from an observation. That is fabrication with an agent contract attached,
and the Auditor would correctly report it as an agent whose output nothing
verified.

The honest alternative is what P2 built: platform strategy as **declared
knowledge with a stated basis**. Every claim is a `platform_fact` (checkable
against documentation) or an `industry_heuristic` (widely believed, unmeasured
here). The third basis, `halyard_empirical`, exists in the type and is
deliberately empty — a test asserts it stays that way until a scorer produces
one from real published results.

When Halyard has its own performance data, a specialist that reads *that* would
pass the test. Today one would not.

### Engagement

`PlatformEngagementCapability` is modelled read-only, and the two write-shaped
actions are listed in `platform/policy.ts` as permanently refused so the refusal
is a value in the model rather than an absence somebody later reads as an
oversight. §5 above remains the open product question, unchanged and still
yours.


---

## 8. Meta coverage: Instagram and Threads (2026-08-19)

Recorded from the adapters, not from Meta's dashboard. Meta's app UI advertises
"publish posts", "respond to comments", "answer direct messages" and "gather
insights"; those are permission scopes, and none of them makes an operation
actionable in Halyard.

Verdicts come from `resolveCapability`. **`declared` is not executable** — only
`verified` is, and verification requires a probe that has watched the operation
work. Nothing below is verified, because nothing has been probed.

| Action | Instagram | Threads | Why |
|---|---|---|---|
| `publish` | declared | declared | `publish()` in both adapters |
| `publish_public` | review_required | review_required | both set `requiresReviewForPublicPosting` |
| `carousel` | declared | declared | carousel container in both |
| `video` | declared | declared | video container in both |
| `alt_text` | declared | declared | both set `fields.alt_text` |
| `read_comments` | declared | declared | `listComments()` in both |
| `read_mentions` | **unknown** | **unknown** | the Graph API exposes mentions; Halyard has no method |
| `scheduling` | **unknown** | **unknown** | Halyard schedules in its own queue; no provider-side hold |
| `short_video` | **unknown** | **unknown** | Reels/Shorts are separate container types nothing builds |

`unknown` is deliberate. Marking these `unsupported` would blame the platform for
a gap that is ours, and `declared` would be a claim no code supports.

**Not modelled at all:** replying to comments, sending DMs, reading DMs. These are
refused by product policy (`platform/policy.ts`), and a capability entry for them
would reopen a closed safety decision. Insights stay in the metrics architecture
(`SCORED_METRICS` / `DIRECT_METRICS`), not in `CAPABILITY_ACTIONS`.

**Facebook Pages is intentionally absent.** It is not a `PlatformId`, has no
adapter, and is excluded by the `social_accounts.platform` check constraint.
Adding it is a deliberate platform addition — adapter, eleven `Record<PlatformId,…>`
registries, a migration, and tests — and belongs in its own slice when Facebook
publishing is actually built.

### A note on the two architecture documents

`docs/Halyard_Social_Intelligence_Architecture.md` §11 proposes autonomous
"platform specialists" with `discover()`, `search()` and `getRelationships()`.
**No such specialists exist**, and §7 above records why none were built: a
specialist has no evidence to perceive until Halyard has published something.
`HALYARD_MASTER_ARCHITECTURE.md` remains canonical; the capability model
described here is the current mechanism. The conflict is recorded rather than
resolved — resolving it is a product decision, not a documentation edit.


---

## 9. Meta App Review readiness (2026-08-19)

### Permission → code path, complete (2026-08-19)

Every Graph endpoint the Instagram adapter calls, and the scope each needs. Read
out of `packages/core/src/adapters/instagram.ts`, not from Meta's docs.

| Endpoint (call site) | Scope it exercises | Exercised live? |
|---|---|---|
| `/oauth/access_token` ×3 (83, 98, 159) | none — token exchange/refresh | **yes** |
| `/me/permissions` (141) | any valid token | **yes** |
| `/me/accounts?fields=…instagram_business_account{…}` (179) | `pages_show_list` | **yes** |
| `/{ig-user}?fields=username,media_count` (241) | `instagram_basic` | **yes** |
| `/{ig-user}/media` ×4 (307, 319, 328, 343) | `instagram_content_publish` | no — no media published |
| `/{ig-user}/media_publish` (352) | `instagram_content_publish` | no |
| `/{container}?fields=status_code,status` (428) | `instagram_content_publish` | no |
| `/{post}?fields=permalink` (362) | `instagram_basic` | no |
| `/{post}/insights?metric=…` (374) | `instagram_manage_insights` | no — no media exists |
| `/{post}/comments?fields=…` (400) | `instagram_manage_comments` | no — no media exists |

**Two requested scopes have no call site at all.**

| Scope | References in the repository | Verdict |
|---|---|---|
| `business_management` | `oauth.ts:130` only | **no code path** |
| `pages_read_engagement` | `oauth.ts:129` only | **no code path** |

`pages_read_engagement` has exactly the same status as `business_management` and
had never been flagged — the previous version of this section named only one of
them. Both are requested, both were granted on 2026-08-19, and **neither is
reachable from any code in this repository.**

**What the successful live connection does and does not prove.** Connection,
identity resolution (`@recipe.fix`) and the self-test succeeded with **all seven
scopes granted**. That demonstrates the flow works; it isolates nothing about
which scopes were necessary, because none was withheld. `granted` is not
`exercised`, and a successful authorisation is not evidence that every permission
in it was load-bearing.

**What this repository cannot establish.** Whether Meta's `/me/accounts` requires
`pages_read_engagement` in practice is a provider fact, not a repository fact.
Determining it means reconnecting with the scope withheld and observing whether
the call still succeeds — an operator action with App Review consequences.

**Risk of keeping either:** Meta reviewers reject permissions an app cannot
demonstrate, and no user action in Halyard would justify these two. They weaken
an otherwise clean submission.

**Neither removed.** Requesting scopes is a decision with review consequences.
Recorded in `DECISIONS.md` §98 with the exact experiment that would settle it.

### What a reviewer would need shown

| Scope | Demonstration | Blocked on |
|---|---|---|
| `instagram_basic` | Connect flow resolving `@recipe.fix` | ready |
| `pages_show_list` | The same flow listing the Page | ready |
| `instagram_content_publish` | Publishing one image to the connected account | **media + App Review** |
| `instagram_manage_comments` | Reading comments on that post | **needs a post to exist** |
| `instagram_manage_insights` | Reading insights on that post | **needs a post to exist** |
| `business_management` | — | **nothing to show** |
| `pages_read_engagement` | — | **nothing to show** |

### Threads scopes (2026-08-19)

Threads is a Meta product reviewed through the same App Review, and this section
covered only Instagram — so four requested Meta scopes had no audit at all. All
four have call sites, which is the good outcome; what was missing was anything
that would notice if one stopped.

| Scope | Call site in `threads.ts` | Exercised live? |
|---|---|---|
| `threads_basic` | `/me?fields=id,username` | **yes** — connect + self-test |
| `threads_content_publish` | `/{user}/threads` then `/{user}/threads_publish` | no — nothing published |
| `threads_manage_replies` | `/{post}/replies?fields=…` | no — needs a post to exist |
| `threads_manage_insights` | `/{post}/insights?metric=…` | no — needs a post to exist |

No Threads scope is unexercised by code, so there is no Threads equivalent of the
`business_management` question. `metaScopes.test.ts` now pins all four the same
way it pins Instagram's: deleting a call site without removing its scope fails.

### The experiment that settles the two Instagram scopes

Stated per scope rather than generically, because they are authorised by
different calls and a single test would not settle both.

| Scope | Withhold it, then | A pass means | Cost |
|---|---|---|---|
| `pages_read_engagement` | reconnect and call `/me/accounts?fields=…instagram_business_account{…}` | the scope is not load-bearing and can be dropped from the submission | one OAuth round trip, no App Review |
| `business_management` | reconnect and run the same connect + self-test end to end | ditto | one OAuth round trip, no App Review |

Both are operator actions against a live account: a failed reconnect leaves the
account needing another. Neither has been run, and neither scope has been
removed — `DECISIONS.md` §98.

### Legal pages

`/privacy`, `/terms` and `/data-deletion` exist, are public and unauthenticated,
and are covered by `e2e/legal.spec.ts`. They are **not yet deployed**, so the
Meta App Dashboard fields cannot be populated until a deploy happens.

`/data-deletion` states plainly that Halyard has **no automated deletion
callback**, because the repository has no webhook endpoint at all — a claim to
the contrary would be one nothing could honour.

### Webhooks — implemented 2026-08-19, registration still external

`/api/webhooks/meta` exists: the `hub.challenge` handshake, `X-Hub-Signature-256`
verification over the raw body, payload parsing, and enqueue of
`collect_comments` for publications this install actually made.

The ownership question recorded here — web tier versus worker — **was not a
decision**. The worker has no HTTP surface, so only the web tier can receive a
callback. See `DECISIONS.md` §80.

Still external, and not claimed: setting `META_WEBHOOK_VERIFY_TOKEN`, registering
the callback URL and subscribing to fields in the App Dashboard, and the App
Review that gates the subscription. Both verbs refuse until their secret is
configured, so an unconfigured deploy cannot complete a handshake.

---

## 10. Engagement reads can now be verified (2026-08-19)

`read_comments` and `read_mentions` were in `CAPABILITY_ACTIONS` and had no entry
in `TRANSPORT_FIELD`, so no amount of evidence could move them past `declared`.
§9's audit recorded this as a real architectural hole and left it.

It is closed. `capability_probes` gained `account_id` (migration 0032) and
`resolveCapability` gained an `observation` input, because the missing piece was
a **scope**, not a vocabulary: a transport capability is a fact about a provider,
while an engagement read is a fact about one connected account's own permissions.
See `DECISIONS.md` §65.

**What actually writes one.** `collect_comments`. A successful `listComments`
against a real publication *is* the observation, so the evidence costs nothing
extra — no new job, no new schedule, no extra API call. Nothing else writes an
account-scoped observation today, and no `read_mentions` observation exists
because nothing reads mentions.

**Current state of the claim: still zero.** @recipe.fix has no Instagram media,
so there is no publication to read comments on, so no observation exists. The
capability reads `declared` on the Accounts screen and that is correct. What
changed is that it *can* now become `verified` the moment a real read happens —
before this, it could not have, however many succeeded.

### Table

| Platform | `listComments` implemented | Observation possible | Observed |
|---|---|---|---|
| Instagram | yes | yes | no — no media exists |
| Threads | yes | yes | no — nothing published |
| X | yes | yes | no — publication blocked on credits |
| Pinterest / YouTube / TikTok / Bluesky | see adapters | yes | no |

## 11. Credentials, erasure, and jobs that outlive them (2026-08-19)

Halyard has a real **Disconnect** now (`DECISIONS.md` §64): it erases the stored
credential and everything observed through it, keeps the account row so
published history stays explicable, and does **not** revoke the grant at the
platform — which the UI and both legal pages say plainly.

Building it exposed a defect that predated it. `loadAccount` and `publishHandler`
both read `access_token_enc ? openToken(…) : ''`, and an empty string is a
*value*: with no credential stored, the request was built, sent, and refused by
the platform with an empty bearer. A real API call — on X, a billed one — plus
its retries, to discover what the row already said.

It was never exotic. The seeded accounts are `capability_state = 'live'` with no
token at all, because `live` has never meant "connected". Disconnect simply makes
it routine.

All three call sites now fail closed before any network call:

| Path | Behaviour with no credential |
|---|---|
| `publish` | Throws, naming the account to reconnect. No publication row is claimed. Checked *after* the `draft_only` handover, so a hand-published post still reaches the operator |
| `collect_metrics` | Logs and returns. Does not reschedule — a missing credential is not transient |
| `collect_comments` | Records an `unavailable` observation explaining the silence, logs, returns, does not reschedule |

The `unavailable` observation is inert to the resolver in both directions, so an
erased credential explains why a verified read went quiet without ever
demoting it to "not supported".

## 12. Does Halyard learn? (2026-08-19)

Audited against the code, not the roadmap. The chain the question asks about is:

```
input → generated decision → execution → observed result → attribution → evaluation → feedback → better next decision
```

| Link | State |
|---|---|
| input → decision | **Real.** `ideaEngine.scoreIdeas` over mix debt, novelty and cooldowns; deterministic |
| decision → execution | **Real.** `generate` → QC gates → queue → `publish` |
| execution → observation | **Real but unexercised.** `collect_metrics` on a decay schedule; nothing has published, so `post_metrics` is empty |
| observation → attribution | **Partial.** `attribution` needs PostHog *and* the product to record `utm_content` on signup. Not configured |
| attribution → evaluation | **Real, and now honest.** `scorePosts` — which until today scored posts it had never measured (§68) |
| evaluation → feedback | **One path, and it had never run** — `loadHookHistory`, fixed today (§70). Nothing else reads an outcome back |
| feedback → better decision | **Not yet.** `scoreIdeas` reads mix and novelty; it does not read `performance_scores` |

**So: no.** Halyard does not learn today, and there is exactly one wire where it
could — hook selection — which was broken from the day it was written.

What it *does* have is the substrate: append-only observations, beliefs that cite
them, scoped attribution, and a scorer that now refuses to score what it has not
measured. Two of the three defects found today were in that substrate, and both
were invisible: a dead query explained away by a plausible comment, and a
fabricated zero that moved every real score beside it. Both would have produced
confident, wrong numbers the moment the first post landed.

The honest per-item loop that *does* work is rejection → `brand_voices.anti_examples`,
which changes the next prompt. It is not learning; it is a memo. `rejection-clusterer`
would turn a body of those into a pattern and has no caller, correctly, because
there is no body of rejections yet.

**What not to build next.** Anything that reads `performance_scores` back into
`scoreIdeas`. There are zero scores, and a weight tuned on zero observations is a
constant with extra steps. The prerequisite is one real publication.

## 13. Media quality: three gates, one of which had never seen a frame (2026-08-19)

| Gate | Runs where | State before today | Now |
|---|---|---|---|
| `visual` | `review_media` | Wired, but `frameLuminance` was always `[]` — every luminance rule silently unrun, gate stored `passed` with `examined: 0` | Sampling fixed; stores `skipped` when nothing was sampled |
| `coherence` | `review_media` | Working | Unchanged |
| `retention` | nowhere | 310 lines, tested, **zero callers** | Wired into `review_media`; unrunnable rules named, not passed |
| `audio` | `tts` | Working | Unchanged |

The luminance bug is the one worth remembering: `ffmpeg`'s
`metadata=print:file=-` writes to **stdout**, and the code read **stderr** —
copied from `measureLoudness` twenty lines below, where reading stderr is
genuinely right. Nothing caught it because an empty sample array and a video with
nothing wrong produce the same verdict.

**What `retention` still cannot measure**, named in every result rather than
folded into a pass:

- `retention.first_frame_words` / `first_frame_contrast` — needs OCR of frame 1.
  `review_media` describes frames with a vision model but does not extract text
  bounds or contrast.
- `retention.not_loop_ready` — needs first-to-last frame similarity.
- `retention.no_content_in_opening` — needs sampling finer than the three-second
  window. At twelve frames per sixty seconds, any render longer than ~36s is
  reported unmeasured rather than failed.

### Do not "fix" the opening rule by sampling harder — measured, 2026-08-19

> **Superseded in part by `DECISIONS.md` §74.** The table below was measured with
> a different ffmpeg invocation than `probeVideo` uses, and its headline claim —
> that every render would be rejected — is wrong. One of four is affected. The
> direction holds: the mean is a poor motion signal for this content, and the
> tonal range (free, from the same `signalstats` output) is better. The
> magnitude does not.


The obvious next move is to sample the first few seconds densely and switch the
opening rule on. **It was measured, and it would fail every render Halyard
produces.** All four fixture videos, sampled at 2fps over their first six
seconds:

| Render | Mean luminance across the first 6s |
|---|---|
| `ChefNoteCard` | 247.75 → 246.08, then flat |
| `ScalingMath` | 247.10 → 245.64, then flat |
| `SubstitutionExplainer` | 247.45 → 247.20, then flat |
| `TransformationDiff` | 246.88 → 246.38, then flat |

Largest consecutive delta anywhere: **0.0039 normalised**, against a
`STATIC_DELTA_THRESHOLD` of `0.01`. Most deltas are exactly zero. Every render
would be scored as opening on a static card, `retention.no_content_in_opening` is
an **error**, and `review_media` sets `status = 'failed'` on an errored gate — so
the whole content pipeline would start rejecting its own output overnight.

**The verdict would also be wrong.** `firstSubstantiveSecond` uses mean-frame
luminance as its proxy for "something is happening", and Halyard's entire visual
style is a light card with a small area of changing text. Swapping every word on
the card barely moves the frame mean. The videos may well open on content and
change constantly; the metric cannot see it.

So the gap is not sampling density. It is that **this rule has no usable motion
signal for this content style**, and denser sampling would only have made it
confidently wrong more often. Reporting it as `unmeasured` is the correct state,
for a second and stronger reason than the one originally recorded.

What it would actually need: a motion signal that survives a mostly-static frame
— regional frame differencing, or the per-frame `visibleText` the vision
describer **already returns** in `media_observations`, which would answer "did the
words change" directly and costs nothing extra. That is a real slice; sampling
harder is not.

---

## 14. Social Intelligence audit: OBSERVE (2026-08-19)

Traced through execution paths, not filenames. The architecture's OBSERVE layer
against what the code does.

| Architecture asks for | Implemented | Verified | Evidence |
|---|---|---|---|
| posts (third-party) | **no** | — | no adapter method exists on any platform |
| replies/comments on own posts | yes (5 of 7 adapters) | no | `listComments`; blocked on having published |
| comments on others' posts | **structurally no** | — | `comments.publication_id` is not nullable |
| mentions | **no** | — | no adapter method; Bluesky's "mentions" is a facet comment |
| profiles | **no** | — | `fetchIdentity` reads *our* account only |
| follower/following relationships | **no** | — | nothing reads or stores them |
| engagement (own posts) | yes | no | `collectMetrics`; blocked on having published |
| topics / hashtags | partial | no | `watch_hits` over reddit/rss/pinterest |
| search | **no** on social | — | reddit/rss/pinterest only |
| trends | **no** | — | `findRecurringQuestions` is recurrence, not trend |
| media metadata | own renders only | n/a | `probeVideo` |
| competitor activity | **no** | — | nothing models a competitor |

### What this means

Halyard can observe **its own posts** and **three non-social public sources**. It
cannot currently observe a social platform for anything it did not publish
itself. That is a substrate gap, not a bug — and it is the gap that everything
above DISCOVER in the architecture rests on.

`watch_hits` is already the normalized observation model the architecture
describes, so closing the gap is a matter of sources, not schema. See
`DECISIONS.md` §83 for the per-platform blocker table.

### DISCOVER is currently human

`finds` is written by exactly two callers, both operator input: a paste box and
an API route. Nothing discovers anything. `find-drafter` drafts *from* a find; it
does not find one.

### Status vocabulary used here

`implemented` · `fixture-verified` · `live-tested` · `declared` · `verified` ·
`review_required` · `blocked_external` · `unknown`. Nothing in this section is
`verified`, and nothing should be recorded as such until a real read happens.

---

## 15. The causal chain, arrow by arrow (2026-08-19)

Classified by following callers, not by files existing.

| Arrow | State | Evidence |
|---|---|---|
| watch term → `watch_hits` | implemented, **unexercised** | handler + 3 sources; reachable since the `/finds` UI, no term has run a full day |
| find → `signals` | **implemented + exercised** | §85; E2E drives the real screen |
| `watch_hits` → `signals` | implemented, unexercised | needs a question to recur over 30 days |
| `signals` → `ideas` | implemented, **unexercised** | §84; fixture-verified, no live model call — **blocked: LLM credits** |
| `ideas` → draft | implemented + exercised | `generate` + copywriter, real-DB tests |
| draft → media/QC | implemented + exercised | `review_media` against real renders |
| QC → approval | implemented + exercised | `/queue` + `approveItem`, E2E |
| approval → publish | implemented + exercised | rehearsal suite, three idempotency layers |
| publish → provider | implemented, **refused** | real `POST /2/tweets` → HTTP 402 — **blocked: X credits** |
| publication → metrics/comments | implemented, unexercised | no publication exists to collect from |
| metrics → `performance_scores` | implemented, unexercised | §68 |
| `performance_scores` → idea scoring | **implemented, unexercised** | §86 — connected today, carries data the moment a post is scored |
| hook outcome → hook selection | implemented, unexercised | §70 |

**No arrow is now genuinely unimplemented.** Every remaining gap is either
unexercised for want of real data or blocked on an external dependency — credits
for the model and for X. That is a different state from three days ago, when
`ideas` had no writer and `signals` had no reader.

**RECOMMEND/opportunity modelling is still absent**, and is still the right thing
to leave absent: it would sit between `signals` and `ideas`, and that link now
works. Building it before a single idea has been generated from a real signal
would be modelling a step whose inputs have never been observed.

---

## 16. Activation runbook — what only Isaac can do (2026-08-19)

Everything below is external. None of it is engineering work, and none of it can
be faked from inside the repository. Ordered so each step unblocks the next.

### 1. LLM credits — unblocks the largest surface

**Missing:** a funded `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) in
`apps/web/.env.local` **and** the worker's environment. The Anthropic key in the
root `.env.local` is a comment line, not a key; OpenAI returns 429.

**Then run:** add a watch term on `/finds`, press *Collect now*, and let
`generate` run.

**Expected evidence:** a `signals` row, then `ideas` rows carrying
`source_signals`, then a draft in `/queue`.

**Capability state:** `idea-generator` moves from `implemented_partial` to
`implemented_exercised` — the Auditor decides that from `agent_runs`, not from
this document.

**A failure would mean:** the prompt or the validation in `proposeIdeas` is wrong
against a real model. Everything up to the model call is fixture-verified
(§84, §87, §88).

### 2. X API credits — the execution proof

**Missing:** credits on the X developer account. The last real attempt returned
**HTTP 402 credits-depleted** on 2026-08-19.

**Then run:** approve exactly one queued item for `@Recipe_Fix`.

**Expected evidence:** the full chain in `DECISIONS.md` §89 — a `platform_post_id`,
a `published_at`, the provider reply in `raw_response`,
`needs_reconciliation = false`, and a queued `collect_metrics` **and**
`collect_comments`. Rehearsal 6 is that chain as an executable specification.

**Cost:** ~$0.015 without a link, ~$0.20 with one.

**A failure would mean:** a provider-shaped defect the rehearsals could not model.
Do not retry blindly — §79 makes an auth failure permanent by design.

### 3. Legal-page deployment — gates Meta review

**Missing:** a production deploy, then the three URLs pasted into the Meta App
Dashboard: `/privacy`, `/terms`, `/data-deletion`.

**Already true:** the pages exist, are public and unauthenticated, and are
covered by `e2e/legal.spec.ts` including that they do **not** claim an automated
deletion callback or platform-side revocation.

### 4. Meta webhook registration

**Missing:** `META_WEBHOOK_VERIFY_TOKEN` set in the deployed environment, the
callback URL registered in the App Dashboard, and field subscriptions chosen.

**Already true:** `/api/webhooks/meta` does the `hub.challenge` handshake and
`X-Hub-Signature-256` verification over the raw body, and **refuses both verbs**
until its secret is configured — so an unconfigured deploy cannot complete a
handshake. It enqueues `collect_comments` rather than trusting payloads (§80).

**A failure would mean:** the signature or the payload shape differs from what
`metaWebhook.test.ts` asserts against thirteen malformed inputs.

### 5. Meta App Review

**Missing:** the submission itself, plus a decision on §98's two unexercised
scopes first.

**Blocked until:** Instagram media exists to demonstrate
`instagram_content_publish`, `instagram_manage_comments` and
`instagram_manage_insights`. §9 lists what a reviewer would need shown for each.

### 6. Production deployment

**Missing:** Vercel (web) and Railway (worker) configuration, including
`X_CLIENT_ID`/`X_CLIENT_SECRET` in **both** — the worker needs them for token
refresh, which gotcha 4 exists to remember.

### What none of this changes

No capability moves to `verified` because a credential arrived. Verification
requires a real observation, and the capability model decides it from
`capability_probes` and `agent_runs` rather than from configuration.

## 13. Delivery capability: what each API can receive short of a public post (2026-08-22)

Three different things get called "draft", and they ask the operator for three
different things. The distinction is enforced in code by
`PlatformConstraints.delivery` (`packages/core/src/adapters/types.ts`) and
asserted by `adapters/delivery.test.ts`.

- **Native draft** — the platform holds an object the *creator* sees in their
  own app and finishes there. Halyard cannot publish it afterwards.
- **Private upload** — real content on the platform, unpublished, which
  **Halyard can still publish** over the API.
- **Media container** — a transient step inside publishing. The creator never
  sees it, it expires, and it exists to be published seconds later. This is
  **not** a capability and is recorded as `false` for both flags.

| platform | native_draft | private/unpublished | direct_publish | schedule (API) | needs creator completion | media | notes |
|---|---|---|---|---|---|---|---|
| x | ✗ | ✗ | ✓ | ✗ | — | text, image, video | `POST /2/tweets` publishes immediately; no draft, unpublished or scheduled parameter. Articles have a separate draft endpoint that does not apply to posts. |
| tiktok | **✓** | ✗ | ✓ | ✗ | **✓** | video, photo | `/v2/post/publish/inbox/video/init/`, scope `video.upload`. Lands in the creator's TikTok inbox for them to finish; upload URL valid 1 hour. Direct post is a separate endpoint under `video.publish`. |
| youtube | ✗ | **✓** | ✓ | **✓** | ✗ | video | `videos.insert` with `status.privacyStatus=private`; `videos.update` publishes it later. `status.publishAt` schedules, and requires the video to be private and never published. No draft object exists. |
| instagram | ✗ | ✗ | ✓ | ✗ | — | image, carousel, video | Two-step `/media` → `/media_publish`. The container is invisible to the creator and expires after **24 hours**. 100 API posts per rolling 24h. |
| threads | ✗ | ✗ | ✓ | ✗ | — | text, image, video, carousel | Same two-step container: `POST /threads` → `/threads_publish`. No draft capability documented; ~30s processing wait recommended. |
| pinterest | ✗ | ✗ | ✓ | ✗ | — | image, video pin | v5 `pins/create` adds the Pin to a board immediately. No draft, unpublished or scheduled state via the API, whatever the web UI allows by hand. |
| bluesky | ✗ | ✗ | ✓ | ✗ | — | text, image | `createRecord` writes a public record. **Not re-verified against AT Protocol documentation in this pass** — treated as no-draft, which is what the adapter already did. |

**Not supported for publishing at all**, and deliberately not emulated:
**Facebook** has no adapter here and is absent from the `social_accounts`
platform check constraint. **Reddit** is an observation/discovery source only.
Neither gained a capability in this pass.

### Sources

Official documentation, read 2026-08-22:

- TikTok — [Content Posting API: Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started/), [Upload (inbox) reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video)
- YouTube — [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [videos resource: `status.publishAt`](https://developers.google.com/youtube/v3/docs/videos)
- X — [Create or Edit Post](https://docs.x.com/x-api/posts/create-post)
- Instagram — [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- Threads — [Threads Posts](https://developers.facebook.com/docs/threads/posts)
- Pinterest — [Create boards and Pins](https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/)
