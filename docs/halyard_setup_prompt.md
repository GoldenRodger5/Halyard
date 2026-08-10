# Halyard — Final Setup Prompt

Paste this whole thing into Claude Code. It covers deployment, the unified publishing
layer, the account-setup kit, launch content, and a final quality sweep.

CLI is fine here — this is your setup work, not mine. The goal is that **after this, I
never open a terminal again.**

---

````
# Halyard — Final setup: deploy, publish, and prepare for launch

Four milestones plus a sweep. After this I create social accounts and start posting, so
everything must be genuinely ready, not nearly ready.

## Read first

- `docs/halyard_deployment_and_access.md` — deployment and platform-access strategy
- `docs/halyard_operating_model.md` — canonical on autonomy and approval
- `docs/halyard_round3.md` Part A — the working mandate
- `docs/halyard_first_run.md` — the operator flow this must support

## The mandate, unchanged

**Fix, do not defer.** Bug, gap, wrong assumption, spec that does not survive contact with
reality — fix it correctly. No stubs, no TODOs, no working around. If a design decision in
any document is wrong, say so and implement the right thing.

Use the CLI freely for setup — Vercel CLI, Supabase CLI, Railway CLI, Docker, whatever is
needed. **But the end state is that no operator flow requires a terminal.** Setup,
connecting accounts, approving, composing, checking health: all browser, all working on a
phone.

---

## MILESTONE 48 — Deploy to production

1. **Vercel.** Web app deployed, custom domain if I have one configured, otherwise the
   vercel.app domain. Environment variables set through the CLI or dashboard, never a
   committed file.

2. **Supabase hosted.** Migrate the full schema. Enable point-in-time recovery. **Verify
   RLS actually holds in the hosted environment** — the local test asserted a non-admin
   role reads every table as empty; prove the same against hosted.

3. **Worker on Railway** (or Fly if Railway resists the Chromium/FFmpeg/whisper image).
   Deployed container, restart policy, heartbeat visible on `/settings/health` within 60
   seconds.

4. **Cron must actually fire in production.** This surface was entirely dead once already
   because nothing called `/api/cron`. Verify every recurring job runs in the deployed
   environment and prove it: verify-flows, metrics collection, token refresh, RSS
   ingestion, idea generation, release detection, daily digest. List each with its observed
   first execution time.

5. **Secrets.** Dashboards only. Write `docs/DEPLOY.md` recording where each secret lives,
   how to rotate it, how to roll back a deploy, and how to check what version is live.

6. **Version stamp in the UI.** Commit SHA and deploy time, visible on `/settings/health`.
   The product this markets ran sixteen days out of sync with its repo because nothing
   surfaced that. Do not repeat it.

7. **Installable on my phone.** Web manifest, icons, correct theme colour, standalone
   display. The approval queue is a phone task and I want it on my home screen.

8. **Verify the deployed app end to end**, not just that it builds. Log in, load every
   screen, confirm the worker picks up a job, confirm a render completes in production.

**Done when:** I open a URL on my phone, log in, and everything works. No CLI in any
operator flow.

---

## MILESTONE 49 — Unified publishing layer

Five of six platforms gate public posting behind a review. Providers exist that have
already passed all of them.

1. **Research and recommend.** Compare current options: Buffer's personal-key API (free
   plan includes one API key, 11 channels — **verify whether the free plan separately caps
   connected channels**, which is a different limit), Post for Me ($10/mo, 1,000 posts),
   Outstand ($0.01/post), Blotato, PostPeer, Postiz (open source, self-hostable).

   Compare on: platform coverage, cost at ~60 posts/month, **whether TikTok is genuinely
   pre-audited**, video and Reels support, carousel support, alt-text support, and
   read/metrics coverage. Recommend one with reasoning.

2. **`UnifiedAdapter`** implementing the existing `PlatformAdapter` interface. No changes
   to the queue, QC, scheduling, or attribution. Only the transport changes.

3. **`social_accounts.transport`**: `direct` | `unified`. X and Bluesky default direct, the
   rest default unified, switchable per account in the UI with no code change.

4. **Honest metrics degradation.** If the provider's read coverage is thinner than direct,
   name the missing metrics per platform in `/analytics` rather than silently reporting
   zeroes.

5. **TikTok stays draft-first regardless of transport.** Trending audio cannot be attached
   by any API and sound is a large share of TikTok distribution.

6. **Test the Instagram direct path before defaulting to unified.** Standard Access may
   cover accounts I own. If a real post to my own account succeeds, keep Instagram direct
   for the richer fields and better metrics.

**Done when:** every platform publishes through either transport, selectable per account,
and a real post reaches at least one review-gated platform without a review being
submitted.

---

## MILESTONE 50 — Account setup kit

**New gap.** I am about to create six social profiles. Right now Halyard would leave me
inventing bios and finding avatars by hand, and the link-in-bio page needs to exist
*before* I create the profiles, because I paste its URL into each one.

1. **`/setup-kit` per product.** Generates, for each platform:
   - **Bio copy** at that platform's character limit, in brand voice, three variants
   - **Display name** suggestions
   - **Profile image** rendered from brand tokens — the RecipeFix mark on terracotta,
     exported at each platform's required size
   - **Banner / header images** where the platform has one (X, YouTube, LinkedIn)
   - **Link-in-bio URL** — the `/l/[slug]` page, which must be live before I make profiles
   - **Pinned-post draft** explaining what the account is, per platform

2. **Handle availability check.** Given a desired handle, check each platform and report
   which are free. Read-only, public endpoints only, no scraping behind auth. If a platform
   cannot be checked cleanly, say so rather than guessing.

3. **Download-all**, so I get a folder of correctly sized images plus a text file of every
   bio and pinned post, ready to paste while creating accounts.

4. **Platform-specific setup checklists** rendered in the UI — for Instagram: Professional
   account, linked Facebook Page, Business account. For each platform, what must be true
   before Halyard can publish to it.

**Done when:** I can create six profiles in one sitting, pasting bios and uploading images
Halyard produced, with the link-in-bio page already live.

---

## MILESTONE 51 — Launch batch and honest cold start

**New gap.** On day one there is no performance data, no audience, and no history. The
system must be useful anyway and must not pretend otherwise.

1. **Launch batch generator.** "Generate my first two weeks" — produces a full staggered
   schedule across every connected platform, respecting mix targets and per-format cadence
   ceilings, so I review a launch's worth of content in one sitting rather than six a day
   for a fortnight.

   Include a first post per account that establishes what the account is.

2. **Cold-start honesty.** Everywhere the system would normally show learned data:
   - Best-time-to-post shows sensible defaults **labelled as defaults**, with how many
     posts are needed before it computes from my own data
   - Predicted stop rate stays `null` below n=3, as already built
   - `/analytics` says what is not yet measurable and why, rather than rendering empty
     charts
   - The opportunities panel says "not enough data yet" rather than inventing an insight

3. **Seed the hook library** with the named patterns from milestone 27 so hook selection is
   not starting from nothing.

4. **A "first 30 days" view** — a simple checklist of what to expect and what to do, drawn
   from `halyard_first_run.md`. Not a tutorial overlay, just a page I can read.

**Done when:** I click one button and get a reviewable two weeks of content, and no screen
shows a confident number it does not have the data for.

---

## FINAL SWEEP

Before you report back, walk the deployed app as a user would, on desktop and on a phone.
Not a test pass — a use pass.

- Every button does something
- Every empty state says what to do next, not just that there is nothing
- Every error names the cause and the fix
- Loading states are skeletons, never a bare spinner over an empty page
- Every list handles 0, 1, and 200 items
- Forms validate before submit and preserve input on failure
- Mobile: nothing overflows, tap targets 44px, the queue is fully operable one-handed
- Dark mode correct everywhere

Then grep the whole repo for `TODO`, `FIXME`, `HACK`, `not implemented`, empty catch
blocks, and `any`. **Fix every one.**

Confirm still true after deploy:
- Publish idempotency, and no retry on a malformed publish response
- Cross-product publish blocked at the database
- No adapter exposes a reply method
- AI-disclosure constraint enforced
- Kill switch works in production
- All five failure rehearsals pass

## Report

What you built. What you fixed that was not in the spec. Which unified provider you chose
and why. Whether Instagram direct worked. What is still blocked on me, with the exact
steps. And the production URL.
````

---

## What I do after this prompt

1. Open the URL, log in, install to home screen
2. `/setup-kit` — download bios and images
3. Create the six accounts, paste everything, set the link-in-bio URL
4. Sign up for the recommended unified provider, connect accounts there, paste the API key
5. Register the X developer app, connect both X accounts directly
6. `/products/new` — paste the RecipeFix brief, brand tokens, MCP connector
7. `/onboarding` — voice questions, 20 calibration drafts
8. `/swipe` — 15 entries
9. **Generate my first two weeks**, review, approve
10. Post
