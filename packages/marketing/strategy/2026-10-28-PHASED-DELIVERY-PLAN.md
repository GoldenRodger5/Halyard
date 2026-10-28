# RecipeFix Social Studio — Phased Build and Validation Plan
Date: 2026-10-28 | Status: proposed phases for founder review, NOT blanket implementation or production publishing approval.
Inputs: deep research, founder 14-day operating model, Halyard PR #100 / #101 / #102, rejected cut reviews, current Halyard active dirty worktree. Treat the research note as current sources and confidence levels.

## North star
Build a premium, versatile creative + operating workflow: founder spends 1–2 collaborative days producing and approving the next 14 days, then the system schedules exactly those pieces through valid RecipeFix-owned channels, collects analytics and researches upcoming opportunities. Growth target is qualified followers, genuine RecipeFix first-use and retained cookers, ultimately verified paid subscribers. Creative quality comes first: no more uniform dark slideshow stock lists or robotic voice defaults.

## Architecture and ownership decision
- **Halyard remains the single coordination home:** verified facts, source quotes, media/right hashes, editorial plans, multiple production engines, render manifests, preview calendar, exact asset/caption/account approval, publication states, analytics/weekly research report. Reuse existing files and CLI, not another orchestrator, web app or database.
- **Creative production is plug-in-like but minimal:** existing Remotion for primary videos, Sharp/Satori for graphic art, Playwright for genuine app screens, optional HyperFrames proof, conditional Motion Canvas/AI-video clips. An engine must export a common manifest, preview and delivered MP4/image set; never require rebuilding all formats to adopt one engine.
- **Publishing is adapter-like:** keep Halyard's Blotato publisher and account-provenance guards; compare Buffer/native only at a real provider capability gate. No MomentCircuit destination for RecipeFix.
- **Market research is a bounded research workflow, not a spam bot:** source-linked trend queries, own comments and interesting open conversations; draft engagement suggestions for the founder, never bulk autonomous outreach.
- **No new DB initially:** run records and content manifests with stable IDs; only add storage if queue reliability and analytics demand it. Avoid duplicate tracking with RecipeFix/PostHog/Blotato.

## Phases, dependencies, and exit gates

### Phase 0 — Snapshot truth, rights, and director bar (documentation/read-only)
**Own:** Product owner + editorial lead + repo steward. **Depends on:** none.
- Reconcile active Halyard PR #100, current creative worktrees, dirty changes, rejected seven-cut hold, current format modules, sources and the PR #101/#102 decisions. Preserve all unrelated worktrees.
- Build a small brand creative brief: RecipeFix core use cases, verified claims, prohibited claims, legal/rights/privacy notes, tone, typography palette, distinct genre-specific look options, motion references, no mandatory voice, suitable app test examples.
- Select five to eight actual reference posts (TikTok/Instagram/YouTube/X) by observed action, opening, rhythm and payoff; archive URLs, dates, screenshots where rights permit, and critique of what to borrow conceptually—not ripped media.
- Baseline current performance/render time/spend using existing local media and actual current footage. Reject automodel "post" as approval authority.
**Exit:** audited capability matrix with Keep/Replace/Prototype/Defer, baseline reel review board, source-rights manifest and no accidental live requests. Do not start new renderer before this gate.

### Phase 1 — Creative research & ENGINE BAKEOFF (highest-leverage R&D)
**Own:** creative director + motion engineer + independent skeptical reviewer. **Dependencies:** phase 0.
Produce **four substantially different watched pilots**, NOT four skins of one list:
1. **Product magic demo (conversion):** real safe RecipeFix screen, starting with user problem/recipe, actual input → Adapt result → one meaningful quantity AND method change; focus zooms, purposeful visual timing. Compare Remotion vs HyperFrames using identical truth/story and assets. Use no real customer data, no invented nutrition number.
2. **Food game/trivia (engagement):** strong visual question + satisfying reveal; playful board or animated ingredient comparison. Try Remotion first; use Motion Canvas only if it clearly earns a benefit. Include native X poll and Instagram swipe layout as alternate executions.
3. **Premium editorial carousel (saves):** 5–7-frame food history or real recipe/adaptation comparison; test current Sharp layouts vs Satori styling, strong cover, engaging progression, real final takeaway, mobile-readable source.
4. **Moving illustrative scene (experimental):** 2–5s stylized ingredient/food motion to integrate into an actual coherent idea. Proposed comparisons: zero-cost code animation vs LTX 2.3 Fast hosted (720x1280 $0.03/sec) and, only if useful, one Kling alternative. No fake label, physical measurement or cooked recipe proof. No live inference until explicit spend authorization.

**Creative QA:** render real full 9:16 deliverables plus native static variants. Listen and watch the WHOLE clip at phone size, muted and audio-on. Score independently: opening, visual novelty, visible activity, clarity, story progression, satisfying payoff, originality, food appeal, typography, footage/rights, readability, honest RecipeFix demonstration, production effort/cost and revisability. Clearly differentiate "technically rendered" from "looks worth posting".
**Decision gate:** choose winning engine per creative family (Remotion may win everything). Reject models/tools not producing a clear gain. Keep multiple looks available; no mandatory look shared by every family. Document exact test media, source hashes, reviewer notes and actual costs. No public posting.

### Phase 2 — Production-ready flexible creative studio
**Own:** video engineer, design director, QA. **Dependencies:** winning phase 1 pilots.
- Keep reusable scene mechanisms rather than forcing identical template structure: camera/zoom around real UI, kinetic type, comparison frames, illustrative cutaways, animated counts, scene transitions, music/foley with rights, image/video masks, expressive graphic motion and platform safe zones.
- Build/repair only the needed current Halyard components: one safe App Recording Capture helper (seed, cookies/privacy, playback determinism, no fabricated app responses), a style token set for *distinct genres*, common manifest and per-output QC. Use existing package code. Support image/carousel X assets as first-class, not second-class video screenshots.
- Allow editorial choices per post: narrative/silent/music/optional voice, humor/serious/interactive, actual app footage/food visual/illustrated AI; arrange 4–9 scenes when appropriate, not mechanically every 3 seconds.
- Visual QA must check 390px and 360px feed scale, title placement, high-contrast but appetizing food, correct crop, no black bars, responsive transitions, tiny citations moved into truthful caption where needed, style consistency within episode, captions/hashtags/links and no unsupported diet safety claims.
- Preserve exact source/copyright and synthetic provenance for every clip and voice. Guard AI scene fantasy from being misrepresented as literal meal or label evidence.
**Exit:** at least one reviewed premium example in each chosen genre, reproducible edits and deterministic export, source/rights ledger, standard output formats, unchanged existing tests. No vast new editor.

### Phase 3 — One idea -> platform-native execution and fortnightly editorial calendar
**Own:** growth product lead + frontend engineer. **Dependencies:** phase 2; may build non-destructive previews in parallel.
- Treat one **Idea** as parent; produce zero or more **Platform Variants**. Each variant has independent media type, exact caption, visual, CTA, hashtags, platform metadata, rights notes, account and scheduled time.
- Define supported types: TikTok standard video and photo/swipe post; Instagram Reel, feed photo and carousel, Stories when supported; YouTube Shorts video; X text, image/thread, video and native poll only if provider capability is established.
- The founder selects a VARIED slate, not a machine-generated obligation to mirror identical material to every network.
- Proposal for **first 14-day editorial mix** (can adjust after actual research): 3 real RecipeFix intros/features, 3 real recipe transformations or ideas, 3 trivia/history/games, 3 helpful cooking tips, 2 humor/community/poll. This means 14 main ideas and around 20–35 platform executions; it's a starting mix, NOT an auto-generated quota or quality compromise.
- Add a clean single calendar/review board with full video playback and slide inspection, captions/hashtags, native platform previews, rights/AI disclosure, exact destination and timing, approve/revise/reject. Hash approval binds all media/copy/account/time (changing ANY requires new approval). Allow draft calendar export.
- Ensure timezones (America/New_York), DST, queue windows and alt text. No public posting until exact batch authorization.
**Exit:** complete mock 14-day calendar with actual approved-quality assets where available, correct platform compatibility and no ambiguous queued state. Founder's signoff required before phase 4 public execution.

### Phase 4 — Reliable four-network scheduling, publication and status
**Own:** integrations + release engineer. **Dependencies:** candidate provider selection; RecipeFix-owned account connection/approval.
- First compare exact Blotato Starter (API status, 4 accounts, supported media, analytics, own-post comments/DMs, price) against Buffer paid/free/native hybrid. Test with provider account IDs and a test or unpublished draft where supported, never MomentCircuit. If no direct API trial and paid access is necessary, stop at founder decision.
- Prefer reusing Blotato if its owned analytics/engagement plus full four-network API justifies $29/month; otherwise use the cheapest **verified** plan capable of a full 14-day unattended queue. Do not build Postiz automatically. Clearly mark notification-only posts as requiring human intervention.
- Use item/account/variant deterministic idempotency keys; schedule only APPROVED hash, status pending→scheduled→published/failed/notification-needed; read provider URLs, recover safely after rate limits/crashes, never post twice on retry. Before test publish confirm exact account and file. Record direct platform time and provider timezone.
- Validate scheduling constraints per platform and a future safe timed post (owner-approved). Record cancellation/update/revocation mechanism, failure alerts and rollback. No silent paid subscription.
**Exit:** one successful owner-approved safe publish per supported platform OR explicit provider/account blocker, actual readback, duplicate protection and 14-day queuing capability proven. No "auto works" from mock API alone.

### Phase 5 — Automatic analytics and market intelligence
**Own:** data analyst + research lead; **Dependencies:** approved accounts & at least one real post for metrics; research can start using public sources earlier.
- Scheduled read-only reports at 48 hours, 7 days and fortnight end. Persist actual provider post ID/metrics and observed timestamps. Keep TikTok Reels Shorts X measures distinct; do not divide mixed denominators.
- Combine with RecipeFix owned UTM traffic, real successful first adaptations, real signups and verified paid conversions only where attribution is possible. Review QA/bot exclusions. Report per family/format/platform, avoid false causal claims from tiny samples.
- Research agent uses official/public authorized resources: TikTok Creative Center, YouTube API and Studio, Google Trends (API alpha not assumed), relevant public creator posts/questions, own IG/FB comments through authorized Blotato, RecipeFix's first-party search/FAQ signals; fact-check and cite date/source.
- Output a SHORT actionable opportunity digest: 5–10 trends/creator examples, 3 best ideas to produce, 3 audience questions/own comments to address, 2–5 accounts/communities to watch, recommended human-reviewed replies/DMs where appropriate, one experiment for next fortnight.
- No automatic unsolicited DMs/follows/comments, no invented "viral" conclusions, no unauthorized social scraping or customer PII in LLM prompts.
**Exit:** one actual published-post report with evidence timestamps, one real research digest with defensible URLs, recommendations separated from any actions, no fake MRR. Schedule periodic repeats only when authorized and service capabilities confirmed.

### Phase 6 — First complete owner-led 14-day release
**Own:** founder/editorial/growth lead and release engineer. **Depends:** phases 2–5 and owner channel approval.
- Spend up to 2 collaborative production days generating/refining a balanced 14-day calendar, using only the engines and genres proven in Phase 1. Make 14 ideas the *ceiling for first experiment* if quality/resources warrant; don't publish filler. Every variant is subject to the same individual review/approval.
- Queue supported posts; check live status at publication. Notification-only steps surfaced clearly. Avoid resurrecting the October 28 held stock-list exports.
- Deliver report after 48h/7d; bring actual learning into the next fortnight's research brief. A post can be intentionally fun/community-oriented rather than forced to link directly to the app, but evaluate whether series-level brand lift results in qualified app engagement.
**Exit:** verified published slate without wrong-account events/duplicates, honest metrics, record of first app actions where measurable, and prioritized content changes. Never claim organic growth success merely because a queue ran.

## RACI / parallelism
| Area | Accountable | Execution | Independent verification | Need founder approval |
| --- | --- | --- | --- | --- |
| Content slate, individual creative quality | Founder + creative director | Halyard / creative engineers | Skeptical independent reviewer + founder | Yes, exact final batch |
| New libraries, scene/graphic engine pilots | Technical creative lead | isolated Halyard branches | licensing/privacy + inspected video/file QA | Before any paid provider |
| Publishing connector | Integration lead | minimal provider adapter | security/release engineer checks accounts + idempotency | Yes, account connection & first live post |
| Research + analytics summaries | Research/data lead | read-only agent with source links | source/data reliability reviewer | Before outbound engagement |
| Spend | Founder | budget guard & ledger | expense reconciliation | Yes, before new subscriptions and non-free AI trials |

## Non-negotiable acceptance criteria
1. **Actual beauty and usefulness:** founder watched output and explicitly approves, not a model score or mere build green.
2. **Accuracy/provenance:** never show generated food evidence as real cooked RecipeFix output; never fabricate measurements, labels, paid reviews, customer quotes or nutrition.
3. **Meaningful variety:** four first pilots are genuinely different concepts and creative mechanisms; no default five-fact dark slide loop.
4. **Channel fit:** choose if an idea belongs on each network; different captions/edits/formats; no unsupported native poll/Story claims.
5. **Operations:** approval-to-post hash validation, brand/account safety, timezone/duplicate protection, allowed API behavior, recoverable queue.
6. **Measurement:** actual per-platform metrics with timestamps, RecipeFix first-value data where valid and segregated from QA; honest unknown states.
7. **Cost discipline:** $0 preferred recurring; around $20/month ideal; Blotato $29 requires explicit value case. One-time AI scene pilot proposed <= $12 variable total with founder approval, no automatic spending.
8. **Existing code protection:** preserve Halyard PR #100 and dirty worktree, no destructive resets or branch merge sweeps, no recipe backend changes from marketing source.
9. **Output documentation:** every completed phase adds a short decision record: keep/replace/reject, actual QA media, costs, provider receipts, current status and next experiment.

## The first concrete execution order I recommend
A. Resolve creative reference brief and rights → B. Build authentic RecipeFix product-demo footage plus two competing cuts in Remotion/HyperFrames → C. Produce premium image/swipe and animated-game companion → D. Decide whether a $0.15–$2 AI motion scene adds genuine value → E. Reuse the winners in a draft 14-day calendar → F. Prove distribution/accounts → G. Activate approved posting and analytic/research loops.

**No new generic marketing platform. No fully autonomous content generator requirement. No public scheduling during research/planning.**
