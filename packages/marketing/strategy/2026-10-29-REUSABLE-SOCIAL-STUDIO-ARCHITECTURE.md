# RecipeFix Social Studio — Reusable production architecture and team
**2026-10-29 | Status:** typed authoring contract implemented; publisher/calendar/analytics integration NOT completed; no new public posts or purchases authorized.
Read with [Founder operating model](../FOUNDER_OPERATING_MODEL_2026-10-28.md), [15 content categories](2026-10-29-CONTENT-CATEGORIES-AND-GROWTH-STRATEGY.md), [first fortnight plan](2026-10-29-FIRST-FORTNIGHT-EDITORIAL-EXPERIMENT.md), [PR #107](https://github.com/GoldenRodger5/Halyard/pull/107).

## Goal and mental model

A **small creative agency inside Halyard**: founder spends one or two days preparing and approving each two-week batch. Specialist producers may work on videos, Instagram carousels, native X copy, food entertainment and research simultaneously without competing for the same renderer files. Later, approved material schedules, publishes, collects metrics and generates research reports automatically. The business goal is relevant cooks who discover RecipeFix, successfully adapt recipes, return, and ultimately subscribe—not video volume or empty views.

**Three independent decisions, never one template:**
1. **Idea/content category:** Who cares, what cooking problem or curiosity, why watch, what actual visual event happens, what is the payoff, how does RecipeFix fit if appropriate? Fifteen categories (P01–P06 product/problem, E01–E05 useful food/education, C01–C04 games/trivia/humor/community) are recorded in the October 29 category canon.
2. **Format/output:** Based on concept, choose cinematic video, carousel, static image, interactive question, native thread, illustrated history or game. Create platform-native variants with original media and captions rather than resizing a generic clip.
3. **Platform/account:** TikTok, Instagram, YouTube Shorts and X only initially. An idea may be on one, two, three or four networks. Each variant has independently verified media rights, exact post copy, destination, founder approval and real provider capability.

## Four core platforms: authoring opportunities, NOT verified automatic publishing

| Platform | Different deliverables | What quality means | Official platform evidence |
| --- | --- | --- | --- |
| TikTok | Vertical short, photo carousel | Immediate visual event and payoff, sound where appropriate, original and accurately disclosed media | TikTok Direct Post video and photo APIs; unaudited direct API clients are private-only. https://developers.tiktok.com/docs/en/content-posting-api-get-started |
| Instagram | Reel, 4:5 image carousel, feed image, Story when appropriate | Reels tell a story; carousels are original magazine-style swipe sequences with real value, not frames exported from a video | Instagram professional content publishing requires media containers and proper account capabilities; verify format support. https://developers.facebook.com/docs/instagram-platform/content-publishing/ |
| YouTube Shorts | Vertical self-contained video, title, description | A complete useful story with a satisfying conclusion, searchable context and honest profile destination | YouTube video upload metadata, status and publish-at are supported; no text/carousel Shorts. https://developers.google.com/youtube/data/reference/rest/v3/videos/insert |
| X | Native text, image/graphic, short thread, video, poll when available | Stand-alone contribution to a real cooking conversation, not a video caption copied verbatim | X API supports posts and media/polls, subject to provider/account capability. https://github.com/xdevplatform/docs/blob/main/x-api/posts/manage-tweets/introduction.mdx |

## Reusable contract delivered in this branch

Module: packages/marketing/src/socialStudioContract.ts
Tests: packages/marketing/src/socialStudioContract.test.ts

- A CreativeIdea carries unique ID, category, audience, watch promise, visual event, payoff, fact/source links, and a product bridge if relevant.
- A PlatformVariant carries independent format, media files with digests, rights/source, image alt text, platform-specific caption/title/CTA, account/brand verification, and scheduled time.
- The static registry prevents nonsense such as a YouTube carousel or text-only TikTok short and lists *potential* native formats; final platform/provider support is separately verified.
- A CreativeQualityReview records full visual/audio/source inspection, current media hashes, known defects and founder verdict. Automatic creative scores cannot approve.
- The ExactApproval fingerprint binds media hashes, copy, link, account and time; any modification invalidates the prior declaration.
- ProviderCapability distinguishes verified automatic delivery versus notification-only. Offline checkQueueReadiness fails closed for unverified account/capability, missing exact approval, missing schedule, mismatched media, unreviewed audio or known defects.
- **Important limitation:** this is an *authoring data/validation model*, NOT authenticated human signoff and NOT an integrated publisher. The supplied approval object must eventually be backed by verified founder identity in a separate owner-review interface. The checks cannot independently prove a human signed it. No provider calls are performed.

## The complete production line

**Market and first-party research → Creative brief → Storyboard → Original video/still design → Independent watching/listening/claims and rights QA → Native variants → Exact authenticated founder review → Verified platform/account scheduling → Provider status/public URL → Real analytics / first adaptation → Next two-week research brief.**

Do not let one creative agent invent a script, render it, grade its own work and approve it. Each stage has a separate owner and clear artifact/handoff.

## Specialists and parallel source ownership

| Specialist | What it owns | Deliverable | Hard constraint |
| --- | --- | --- | --- |
| Creative Director / integration lead | Audience, concepts, editorial mix, style independence and production coordination | Content slate and approvals, concept kills, brand consistency; independently edited final selection | Never force every idea through the same template; real founder veto |
| **Video/Motion specialist** | Script, appetizing food art, true product capture, custom animation, sound and expressive narration | Complete watched video, source/rights log and media exports | Avoid flat icon-only chicken circles, clipped text, static recipe-proof cards, robotic narrator |
| **Instagram/X specialist** | Distinct IG carousels/images, native X threads/polls/graphics, captions, layout | High-quality swipe stories and concise real conversation drafts | Never turn captions into legal receipts or reuse lazy screenshot contact sheets |
| **Food entertainment specialist** | Sourced trivia/history/teaching, recipes, games, humor, own community questions | Different kinds of watchable, source-linked content | Do not invent cooking facts, faked comments/testimonials, or divert whole account to unrelated entertainment |
| **Distribution/research/growth specialist** | Connected accounts, provider capability, scheduled posts, UTM/first-value, social/listening research | Dry-run capability proofs, verified account table, analytics/research reports | Never publish through MomentCircuit account or DM/comment/follow without explicit approval |
| **Independent quality reviewer** | Actual exported media, accessibility, rights, audio perception where possible, product truth | Precise defects, reject/revise/eligible recommendation | Model score cannot overrule founder; disclose if cannot truly hear audio |

One isolate per stream; no destructive resets or parallel edits to shared files. Lead integrates each small batch after review. Next target is up to 14 parent ideas with relevant variants over a fortnight, not 14 near-identical videos or a required post count. Candidate first-pass mix ~50% product and useful recipe problem-solving, 30% educational/cooking, 20% community/games/humor, revisable using outcomes.

## Gate: premium and not cringe

- Viewer who doesn't know RecipeFix has a reason to stop and stay: visual action or a real challenge, meaningful development and payoff.
- Excellent scene design: typography readability at phone size, clean safe zones, creative and appetizing subject, appropriate lighting, responsive cuts, meaningful motion, strong editing.
- Natural expressive narration when it improves a story, with full genuine sound-on listening approval. Optional narration rather than a robotic default. Licensed music and tasteful synchronized effects.
- IG carousels have graphic/food richness, legible information and a swipe payoff, not giant paragraphs. X contributes something useful/interesting even without the app.
- Truthful copy: real RecipeFix source, adapted ingredients/method, honest nutrition estimates and dietary safety, properly licensed media; generated scenes labeled as illustrative, not cooked outcomes or real package labels.
- Business: product variants include an actual usable CTA/route, measurable first-adaptation intent, no fake attribution. Fun/educational content earns relevant trust without forced sales lines.
- No full batch generation before the first small creative review. If a concept still feels boring after a meaningful revision, change concept or visual medium—not font/overlay tweaks.

## Important integration/safety gap discovered

Existing packages/marketing/src/publish.ts contains hardcoded DEFAULT_ACCOUNTS and relies on AI critique verdict plus platform/account ID membership. That **does not verify a RecipeFix-owned identity or the founder's exact final approval**. The authenticated Metricool brand inventory earlier showed MomentCircuit only, not RecipeFix. DO NOT use existing legacy live publisher until separately qualified, account owner verified and the exact-approval gate is integrated with an authenticated founder UI. The new authoring contract is not connected to live publisher in this PR.

Blotato still deserves verification against Buffer/native APIs for all four networks and analytics. Earlier access was subscription-expired; source capabilities and $29/month current Starter price are not proof the owner's connected account is available. No purchase authorized. Publication status readback, idempotency, notification-only handoffs and real account URL proof are future tasks.

## Proposed production cadence and next work

- **Batch A:** product/recipe problem pilot with a substantial premium motion/narration upgrade (preserve the real Broiler Tetris cooking constraint if useful, but do not keep the current dull flat animation), plus a distinct IG carousel/X treatment and one fun or teaching piece. Full real visual/audio review at this checkpoint.
- **Batch B:** four to five different concepts across feature magic, recipe inspiration, cooking tips, trivia/history. Platform formats chosen individually; artistic comparisons against real reference posts, not automated rating thresholds.
- **Batch C:** fill remaining meaningful category gaps and curate the exact 14-day calendar with media proofs, captions, links, costs, approvals and scheduling metadata. No filler.
- In parallel, the distribution/research specialist verifies only RecipeFix-owned accounts and observes current comments/questions/trends where authorized; founder approves any outbound engagement.
- Only after founder signs the exact full batch and the provider proof works: schedule approved posts, read back real status/URLs, collect metrics and report qualified visits → first successful adaptations → return/use → provider-verified Plus.

Halyard stays the production workspace. Reuse Remotion/FFmpeg/Sharp/Playwright and experiment with HyperFrames/Satori/Motion Canvas/hosted AI scenes only where actual watched creative visibly benefits. No subscriptions, provider calls or public posts are approved by this architecture.

**This branch includes reusable foundation and tests, not an operative full social marketing agency or published first fortnight.**
