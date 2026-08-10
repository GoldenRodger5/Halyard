# Halyard — Round 3 (Final)

**This round ends with a production system I use daily.** No deferrals, no stubs, no
"needs a human later" except the four things that genuinely require my hands: platform
review recordings, the voice clone, my calibration, and my photographs.

Round 2 left six things open. Round 3 closes them and adds the account model, which has
been referenced throughout and never specified.

---

# PART A — The completion mandate

Read this before the milestones. It changes how to work, not just what to build.

## A.1 — Fix, do not defer

If you hit a bug, a gap, a wrong assumption, or a spec that does not survive contact with
reality: **fix it correctly.** Do not work around it, do not stub it, do not add a TODO,
do not defer it to a later round. There is no later round.

If a design decision in any document is wrong, say so and implement the right thing. The
documents are a starting point, not a contract. Round 2 improved on the spec twice — `null`
instead of a fabricated stop rate, and payoff verification failing closed — and both were
correct.

## A.2 — What "done" means here

At the end of this round, every one of these is true:

- No `TODO`, `FIXME`, `HACK`, or `throw new Error('not implemented')` anywhere in `src`
- Every table has a screen, or a documented reason it does not need one
- Every schema field is either written and read, or removed
- Every button does something
- Every empty state explains what to do, not just that there is nothing
- Every error state names the cause and the fix
- Every adapter has run against a real API at least once, or is documented as blocked on a
  named external approval with the submission date
- Every failure case in build pack §3 has a passing test
- CI green: typecheck, lint, unit, integration, E2E

## A.3 — When genuinely blocked

Four things need me, and only these four:

1. Recording platform review demos
2. The ElevenLabs voice clone
3. `/onboarding` calibration and the swipe file
4. Photographs

For anything else — a missing credential, a package that will not build, an API that
behaves differently than documented, a wrong selector — investigate and solve it. If a
credential is missing, build the code fully, add it to `scripts/doctor` with the exact
acquisition steps, and make the failure message tell me precisely what to do.

**Never leave a code path unwritten because a credential is absent.**

---

# PART B — The account model

Referenced constantly, never specified. Here it is.

## B.1 — The shape

Two account types, and the distinction is not cosmetic.

**Brand accounts are per-product.** `@recipefix` on X belongs to RecipeFix. If Kinolog gets
an X account, that is a separate row, separate tokens, separate voice, separate mix.

**The founder account is one account, shared across everything.** `@isaacmineo` on X is not
duplicated per product. It belongs to the `founder` product (`kind: 'personal'`), and a
founder post about RecipeFix sets `about_product_id` so it still attributes to RecipeFix in
analytics.

```
products
├── recipefix   (kind: product)
│   ├── X          @recipefix        persona: brand
│   ├── Instagram  @recipefix        persona: brand
│   ├── TikTok     @recipefix        persona: brand
│   ├── Pinterest  @recipefix        persona: brand
│   └── YouTube    @recipefix        persona: brand
│
├── kinolog     (kind: product)
│   └── (accounts added when it launches)
│
└── founder     (kind: personal)
    ├── X          @isaacmineo       persona: founder
    ├── LinkedIn   Isaac Mineo       persona: founder
    └── Threads    @isaacmineo       persona: founder
```

The existing unique constraint on `(product_id, platform, persona)` already supports this.
What is missing is the connection flow and the safety rails.

## B.2 — How OAuth actually works per platform

This is where people get stuck, and it differs meaningfully.

| Platform | Connecting two accounts |
|---|---|
| **X** | One developer app, one authorization per account. To connect the second, log out of X or use a separate browser profile, then authorize again. Tokens are per-account |
| **Instagram / Threads** | One Meta app. **Facebook Login returns every Page and IG account the user manages**, so a single authorization can grant access to several accounts — the app picks which. Each IG account must be Professional and linked to a Page, all under one Business Manager |
| **TikTok** | Separate authorization per account. Separate browser session |
| **Pinterest** | Separate authorization per account |
| **YouTube** | Google OAuth, but one Google account can own several channels. The channel is chosen **during** the consent flow — easy to pick the wrong one |
| **Bluesky** | App password per account, not OAuth |

**Practical guidance the UI should state plainly:** use a separate browser profile per
account. Connecting the wrong account because you were already logged in is the single most
common failure in this flow.

## B.3 — Confirm before saving — the footgun guard

After every OAuth callback, **before writing tokens**, fetch the authenticated account's
identity and show it:

```
You connected:

     [avatar]  @isaacmineo
               Isaac Mineo · 1,204 followers

You were connecting:  RecipeFix · X · brand account

⚠  This looks like your founder account, not the RecipeFix brand account.

[Yes, this is correct]   [No, let me reconnect]
```

Warn when the handle does not resemble the product name, or when the same platform user id
is already connected under a different product. Do not block — sometimes it is deliberate —
but never save silently.

Store `platform_user_id` and require it to be unique per platform unless I explicitly
confirm a deliberate duplicate.

## B.4 — Routing safety

A content item must never reach the wrong account. Enforce in code, not convention:

- `content_items.account_id` must belong to `content_items.product_id`
- A founder-persona item may only target a `kind: 'personal'` product's accounts
- A brand item may only target its own product's accounts
- A database check constraint plus a pre-flight assertion in the publish job
- A test that attempts a cross-product publish and asserts it fails

**A brand post landing on the founder account is the worst non-destructive failure
available.** Make it structurally impossible.

## B.5 — The `/accounts` screen

Grouped by product, then persona:

```
RECIPEFIX                                        [+ Connect account]
  ● X          @recipefix       live         expires in 58d   [Test] [⋯]
  ◐ Instagram  @recipefix       draft_only   review submitted Aug 12
  ◐ TikTok     @recipefix       draft_only   by design — see note
  ○ Pinterest  —                not connected               [Connect]

FOUNDER                                          [+ Connect account]
  ● X          @isaacmineo      live         expires in 58d   [Test] [⋯]
  ○ Threads    —                not connected               [Connect]
```

Each row: capability state with a plain-language reason, token expiry with a warning inside
seven days, last successful publish, last self-test result. Actions: test connection,
reconnect, revoke, flip capability state manually when an approval lands.

Connecting shows a pre-flight checklist per platform — for Instagram: Professional account,
linked Page, Business Manager, app review status.

## B.6 — Founder cross-product attribution

A founder post about RecipeFix publishes to `@isaacmineo` and attributes to RecipeFix.
`/analytics` must let me answer both "how did the founder account perform" and "how much
RecipeFix activation came from founder content", which are different questions over the
same rows.

---

# MILESTONE 40 — Account connection system

````
# Halyard — Milestone 40: Connect accounts properly

Full model in `halyard_round3.md` Part B. Build all of it.

1. `/accounts` grouped by product then persona, with capability state, token expiry, last
   publish, and self-test result per row
2. **Post-OAuth identity confirmation before tokens are saved.** Fetch the authenticated
   handle and avatar, show it, warn if it does not match the expected product or duplicates
   an existing connection. This prevents the most common failure in the whole flow
3. Per-platform pre-flight checklists in the connect dialog
4. Guidance in the UI to use a separate browser profile per account
5. **Routing safety**: a check constraint plus a publish-time assertion that an item's
   account belongs to its product and matches its persona. A test that attempts a
   cross-product publish and asserts failure
6. Token expiry warnings at 7 days, and a refresh job an hour before expiry
7. Manual capability-state override for when a platform approval lands
8. Meta multi-account handling: one Facebook Login can return several IG accounts and
   Pages, so present a picker rather than assuming one

## Definition of done

I can connect a brand X account and a founder X account to the same developer app, the
system confirms each identity before saving, and a test proves a brand post cannot publish
to the founder account.
````

---

# MILESTONE 41 — Selector discovery, then capture

````
# Halyard — Milestone 41: Real screenshots and footage

Milestone 26 was deferred because guessing selectors produces code that works on nothing.
That was correct. Here is the unblock.

## Part A — Discover, do not guess

recipefix.app is live and public. Build `scripts/discover-selectors.ts`:

Playwright navigates a URL, dumps every interactive element with text, `data-testid`,
`aria-label`, stable class fragments and a candidate selector, then screenshots the page
with candidates numbered and overlaid. Writes `.discovery/<page>.json` plus an annotated
PNG.

Run against `/`, `/adapt`, `/recipes`, `/discover`, `/shopping-list`, and a result state.
Then write flows against **real** selectors.

Preference order: `data-testid` → stable `aria-label` → role plus accessible name → text.
Never a generated class hash.

## Part B — Verification gate

Each flow declares its selectors. A `verify-flows` job runs them against the live site
weekly and after any RecipeFix release. A missing selector fails with its name and a
screenshot of what the page actually looked like. Never record blind.

## Part C — The flows

- `adapt_and_reveal` — paste URL, select gluten-free, submit, wait, expand a SWAPPED badge.
  **60 to 75 seconds.** Record full speed, ramp the wait to ~2s under a progress overlay in
  Remotion, full speed on the reveal
- `swap_toggle` — one toggle changes ingredient, step text, title and protein together.
  The strongest 10 seconds the product has
- `cook_mode_timer` — timer running, then a locked screen

## Part D — Asset library

`/assets` with upload, tag, search, bulk. Captures auto-tagged with flow, date and app
version. Templates and compositions reference assets by tag. Asset picker in queue detail
and co-pilot.

## Part E — Staleness

Re-capture on demand and on release detection. Assets over 60 days marked stale, with a
warning when a template is about to use one.

## Definition of done

Discovery output for six pages. All three flows run live and produce stills and video. A
carousel renders containing a real screenshot of the result card.
````

---

# MILESTONE 42 — Destinations and link routing

````
# Halyard — Milestone 42: Send people to the right place

Analysis in `halyard_phase3.md` Part 1.

1. `products.destinations` jsonb: web, app_store, play_store, universal_link_domain,
   deep_link_scheme, app_analytics_provider_token
2. **Smart router at `/r/[content_item_id]`.** iOS → the web share URL, because
   `applinks:recipefix.app` is already configured and the installed app opens via universal
   links. No App Store bounce. iOS plus a native-only feature → App Store with campaign
   parameters. Android → web/PWA. Desktop → web. Always forward UTMs, always log to
   `link_clicks` with device class, platform, referrer, content item
3. `content_items.destination_type`. Resolution: real adaptation with a share link →
   `share_link`; native-only feature → `app_store`; else `web`. Overridable, and the
   resolved destination shown on the detail screen before I approve
4. **App Store attribution.** Verify Apple's current App Analytics campaign parameter names
   before implementing. Without them every install reads as organic and mobile-first
   platforms are systematically under-scored. Show web and App Store conversions as
   **separate columns** in `/analytics` — different systems, never summed
5. QC warning when a specific-transformation post points at the bare homepage

## Definition of done

A gluten-free bread post links to that exact recipe, opens in the app on iOS if installed,
and the click is logged with device class and attributed.
````

---

# MILESTONE 43 — Close every open loop

````
# Halyard — Milestone 43: Finish what is half-built

No deferrals. All six.

**1. `/products/new` wizard.** Five steps: identity and timezones; brief with auto-summary;
brand tokens with live preview; connector (mcp | rest | github | none, each with a
test-connection button); voices seeded from the brief. Every connector type must work — a
`none` product is fully usable and the idea engine routes around the missing
`generateSample()` rather than erroring.

**2. Rejection-cluster screen.** `rejectionClusters.ts` runs and nothing displays it.
Surface on the dashboard when a cluster crosses threshold, with the proposed slop rule and
accept or dismiss. Accept writes the rule; dismiss suppresses for 30 days.

**3. Milestone 19 browsing UI.** `/series`, `/hooks`, `/submissions`, `/swipe`. `/hooks`
matters most: performance by type, format and category, plus cooldown state. That is where
I see the hook system learning.

**4. Watch terms.** A `watch_terms` table, a daily read-only pass over RSS, Reddit public
JSON and Pinterest trends. Recurring questions become signals. **Discovery only** — no
engagement, no replies, no DMs. Skip X; reads are $0.005 each and the economics fail.

**5. Sentry.** Both tiers, source maps, release tagging.

**6. Failure rehearsals as tests.** Build pack §3:
- Malformed publish response → row with `platform_post_id: null`, **no retry**
- Token expiry mid-publish → refresh once, retry once, then auth error and pause account
- Render timeout past a slot → reschedule up to three times
- Connector unreachable → generation pauses for that product only
- Duplicate publish attempt → hard abort, logged

The malformed-response case is the most important: a retry there double-posts to a real
account.

## Definition of done

Kinolog can be added through the UI in five minutes. Every table has a screen or a
documented reason. All five rehearsals pass.
````

---

# MILESTONE 44 — Launch mode

````
# Halyard — Milestone 44: Campaigns

`campaigns` table (product, name, kind, starts_at, ends_at, goal, destination_override,
status) and `content_items.campaign_id`.

**Planner** at `/campaigns/[id]`: describe it in a sentence, get a multi-day multi-platform
sequence — teasers, a staggered launch-morning burst, mid-day follow-ups, thank-you,
results post. Timeline I rearrange before anything generates.

**Mix override.** The 15% product ceiling lifts to a campaign number during the window and
reverts at `ends_at`. The trailing-21-day mix calculation **excludes campaign days**, so a
launch does not distort normal cadence for three weeks after.

**Campaign analytics** by `campaign_id`. **Launch-day view**: what has gone out, what is
next, live metrics, incoming comments, one prominent pause control.

## Definition of done

A sentence describing a Product Hunt launch produces a reviewable 5-day, 6-platform
sequence, generated and staged.
````

---

# MILESTONE 45 — Owned audience and social proof

````
# Halyard — Milestone 45: Email and testimonials

**Newsletter.** Draft from the period's best content plus the substitution guides, into the
same approval queue. Send through RecipeFix's existing Resend integration — do not build a
second email system. Opens and clicks into `post_metrics`. The link-in-bio page gets an
email field and a lead magnet; the 39 substitution guides as a downloadable reference is
the obvious one and already exists.

**Reviews.** Pull App Store reviews via App Store Connect. Pull `user_feedback` and
`beta_feedback` from RecipeFix over MCP. `/social-proof` with "Turn into a post".

**Rules, in code:** never invent or embellish a testimonial; no full name or photo without
consent; attribute as the platform shows it; never edit a quote beyond a marked trim; a
slop rule rejecting any quoted testimonial that does not resolve to a real row.

Fabricated social proof is the one unrecoverable content failure. Verify it the way claims
are verified.

## Definition of done

A weekly newsletter drafts and sends through Resend. A real App Store review becomes a
post, verified against its source row.
````

---

# MILESTONE 46 — X live end to end

````
# Halyard — Milestone 46: Prove the chain on one platform

Seven adapters, none has met a live API. Do not debug them simultaneously.

X has no review gate and can be fully live today. Take it all the way:

1. OAuth against the real developer app, both the brand and founder accounts
2. Dry-run first — inspect the exact request before spending a post
3. Publish one real post, **link in the first reply**, not the body
4. Verify the `publications` row, permalink, idempotency
5. Collect real metrics
6. A comment arrives in the inbox with a drafted reply
7. A click routes correctly and logs to `link_clicks`
8. `/analytics` shows the post with real numbers

**Document every difference between the contract test and reality** in
`docs/FIRST_CONTACT.md`. That list is the debugging map for the other six adapters.

Then apply the same pattern to Instagram in dev mode, since that is the next one testable
without waiting on approval.

## Definition of done

One real X post published by Halyard, appearing in analytics with a routed logged click,
and `FIRST_CONTACT.md` written.
````

---

# MILESTONE 47 — Production polish and readiness

````
# Halyard — Milestone 47: Actually done

## Part A — The sweep

Go through the whole application as a user would, on desktop and mobile, and fix what you
find. Not a test pass — a use pass.

- Every button does something
- Every empty state says what to do next, not just that there is nothing
- Every error names the cause and the fix
- Every loading state is a skeleton, never a bare spinner over an empty page
- Every destructive action confirms
- Every list handles 0, 1, and 200 items
- Every form validates before submit and preserves input on failure
- Keyboard shortcuts work and are discoverable
- Mobile: nothing overflows, tap targets are 44px, the queue is fully operable one-handed
- Dark mode correct everywhere

**Grep for `TODO`, `FIXME`, `HACK`, `not implemented`, `any` and empty catch blocks. Fix
every one.**

## Part B — Readiness gate at `/settings/readiness`

Refuses to go green until each check genuinely passes. Every unchecked item links to the
screen or document that resolves it.

**Product** — brief pasted and under 30 days old; connector health passing; destinations
configured; `create_share_link` reachable.

**Calibration** — wizard complete; 20 drafts reviewed; 10+ approved voice examples; 10+
swipe entries; hook library seeded.

**Accounts** — each passes self-test; capability state accurate; token expiry beyond 7
days; identity confirmed at connect time; link-in-bio live where captions are not
clickable.

**Pipeline** — worker heartbeat inside 60s; a video rendered end to end; all four QC gates
operational; voice clone working and lexicon seeded; kill switch tested this week.

**Attribution** — RecipeFix UTM capture live; link router logging; App Store campaign
parameters configured; `attributionReadiness()` reports both halves.

**Safety** — publish idempotency passing; no adapter exposes a reply method; cross-product
publish blocked; AI-disclosure enforced; dry-run verified per adapter; all five failure
rehearsals passing.

## Part C — Operator documentation

`docs/OPERATING.md`, written for me six months from now having forgotten everything:

- The daily loop, step by step
- How to connect each platform, including the browser-profile guidance and the pre-flight
  checklist per platform
- What each capability state means and how to advance it
- What to do when a publish fails
- How to add a new product
- How to update the brief and why it matters
- What runs on what schedule
- Where the kill switch is

## Definition of done

The readiness screen is accurate. `OPERATING.md` is complete. No TODOs. Every screen usable
on a phone. CI green across typecheck, lint, unit, integration and E2E.
````

---

# PART C — The prompt to send

````
# Halyard — Round 3, final

Round 2 (21–32) is complete. This round ends with a production system I use daily.

## Read first

- `docs/halyard_round3.md` — this round. **Part A is a working mandate, not context**
- `docs/halyard_operating_model.md` — canonical on autonomy and approval
- `docs/halyard_phase3.md` Part 1 — destination-routing analysis behind milestone 42
- `docs/halyard_addendum_ondemand_and_connectors.md` — connector types, on-demand generation
- `docs/social_engine_addendum_v2.md` — platform API facts
- `docs/halyard_build_pack.md` — failure policy, timezone, testing

## The mandate

**Fix, do not defer.** Bug, gap, wrong assumption, spec that does not survive contact with
reality — fix it correctly. No stubs, no TODOs, no working around, no deferring to a later
round. There is no later round.

If a design decision in any document is wrong, say so and implement the right thing.

**Never leave a code path unwritten because a credential is absent.** Build it fully, add
the acquisition steps to `scripts/doctor`, make the failure message tell me exactly what to
do.

Only four things need me: platform review recordings, the voice clone, my calibration and
swipe file, and photographs. Everything else, solve it.

## Build, in order

**40 — Account connection.** The model is in Part B and has never been specified. Brand
accounts are per-product; the founder account is one account shared across all products.
Post-OAuth identity confirmation before tokens save, because connecting the wrong account
is the most common failure in this flow. Cross-product publish must be structurally
impossible.

**41 — Selector discovery, then capture.** Build the discovery script, run it against the
live recipefix.app, write flows against real selectors with a verification gate.

**42 — Destinations and link routing.** `applinks:recipefix.app` is already configured, so
the default is the web URL, not the App Store. Verify Apple's current campaign parameter
names before implementing.

**43 — Close every open loop.** All six. No deferrals.

**44 — Launch mode.** Campaigns as first-class objects.

**45 — Owned audience and social proof.** Newsletter via RecipeFix's Resend. Verified
testimonials only.

**46 — X live end to end.** One platform all the way through. Write `FIRST_CONTACT.md`.

**47 — Production polish and readiness.** A use pass, not a test pass. Then the readiness
gate and `OPERATING.md`.

## Also

Measure and record **wall-clock render time** per composition if `TIMINGS.md` lacks it.
Output duration is not the number that decides cadence feasibility.

## Constraints

- Publish idempotency; never retry a malformed publish response
- Cross-product publish blocked structurally
- No auto-reply, no auto-DM, no engagement automation
- Slop filter and claim verifier before the queue
- Tokens server-only, identity confirmed before save
- Never fabricate a testimonial, statistic, or opinion
- CI green: typecheck, lint, unit, integration, E2E

## How to work

Read everything first. Ask rather than guess on contradictions. Say so before implementing
if something looks wrong. Install and verify dependencies yourself. Commit in logical units.

Report: what you built, what you fixed that was not in the spec, what turned out
underspecified, and what still blocks me.
````

---

# PART D — My four jobs

| Task | Blocks | Effort |
|---|---|---|
| **RecipeFix P0-0 redeploy + verify** | Accuracy of everything | 1 hour |
| **RecipeFix UTM capture** | All attribution | 1 hour |
| **MCP service token + `persist: false`** | Milestone 22 verification | 1 Lovable session |
| **`data-testid` on capture targets** | Durable flows in 41 | 30 min |
| Paste brief, run `/onboarding` | Every generated post | 30 min |
| Register six developer apps, connect both X accounts | Milestone 46 | 1 hour |
| Demo session, four review submissions | Public posting | 2 hours + 2–6 weeks |
| ElevenLabs Professional clone | Milestone 30 audio | 30 min recording |
| 15 swipe-file entries | Copy quality | 1 hour |
| 20 dish photographs | Visual quality | ongoing |

The first two are still the highest-leverage two hours available and have been outstanding
since we started.
