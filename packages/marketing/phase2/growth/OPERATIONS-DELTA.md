# Phase2 distribution and measurement recheck

29 October 2026. Read-only source/documentation verification. Account connection remains the founder's later step; no account questions, linking, posts, drafts, schedules, comments, follows, DMs or production changes occurred. The earlier account inventory is not reinterpreted as RecipeFix ownership. Existing baseline: `production-checkpoint/growth/RESEARCH.md`.

## Findings that change the eventual operating choice

**Blotato has documented analytics for all four target networks on paid plans.** It exposes list, platform, summary and per-post read endpoints. Its Starter collection checkpoints are day1,7,14,30; a request reads the cached snapshot rather than forcing a fresh network fetch. A48-hour report must state snapshot age and must not label the cached day1 figure a new48-hour measurement. See [current analytics reference](https://help.blotato.com/rest-api-reference/analytics). Subscription/account operation has not been live-tested in this phase.

**Buffer's publishing API does not imply dependable analytics API access.** Its current [official API guide](https://support.buffer.com/articles/using-buffers-api-GtIYIQilz5) supports post/idea/channel operations, but explicitly calls post-metrics queries experimental and unsuitable for dependable production reporting. Therefore a lower publishing price may still require native/manual analytics. Its [pricing](https://buffer.com/pricing) remains Free3channels or Essentials$6/channel/month monthly; four channels total$24/month, or$20/month equivalent with annual billing. No purchase or replacement is selected. Native manual posting costs no new subscription and remains viable after creative approval.

**Status readback needs the actual create receipt.** Blotato's [status documentation](https://help.blotato.com/rest-api-reference/publish-post/get-post) says an unmatched ID can fall back to `in-progress`; that is not proof of a queued job. Reuse the original submission ID and destination; distinguish scheduled from published; retain unresolved state at a polling deadline rather than submitting a duplicate. This is a refinement to the future adapter design, not an implemented live path.

## Formats and exact-approval design

The [media requirements](https://help.blotato.com/rest-api-reference/publish-post/media) still distinguish X text/images/video/threads, Instagram images/carousels/Reels/Stories, TikTok video/image posts and YouTube video upload. Relevant limits for this batch: X post280characters with up to4photos or1video; Instagram carousel up to10items in this provider; TikTok still exports should use JPEG/WebP, not assume our PNG masters are submission-ready. YouTube Shorts remains a video format. Current files are authoring/review candidates; provider conversion and actual account eligibility are separate later checks. The individual TikTok platform page was unavailable to this browser, so no unobserved declarations/format settings are marked verified.

Keep the existing PR108 contract frozen. The smallest future integration remains one authenticated approval/submission boundary: bind exact media/order/hashes, full copy/title/thread, target account and time; prove RecipeFix identity/capability; reject legacy default IDs and stale approvals; retain create receipt and read back status/public URL without blind retries. No live CLI was invoked. `KEEP` is an editorial selection, not an `ExactApproval`, and no concrete schedule/account is fabricated here.

## Actual measurement authority

Source rechecked at RecipeFix release pin `81a6bd9e8c892b08c2510fe1bfe9ea0681a51842`:

- `src/pages/Adapt.tsx:2267` emits `first_value_success` on its successful result path. `src/lib/acquisitionEvents.ts` sends it through possession-bound first-party acquisition RPCs and mirrors `first_value` to GA4. It is not expected to magically appear as the same event in PostHog.
- `drizzle/migrations/0014_paid_funnel_gate_events.sql` suppresses some success signals only within one minute. The name `first_value_success` is not itself a guarantee of one lifetime first; calculate the earliest genuine eligible success per session/account and exclude QA/automation. Repeated event counts are not new people. Session claim and account joins exist in source, but a consented live campaign-to-account join was not proven here.
- That migration describes `billing_charge_facts` as recurring revenue authority. `supabase/functions/stripe-webhook/index.ts` verifies signatures and treats a positive invoice separately from a$0trial invoice; Apple verified entitlements are a different route. Client success-page or subscription-cache events are not payment receipts. No customer/payment records were queried or written.
- Exact first/last UTMs remain useful: `utm_source=<platform>`, `utm_medium=social`, `utm_campaign=rf_first_fortnight`, `utm_content=<variant-id>`. Coarse first-party source can group social under referral. Do not join different aggregate populations to claim a paid conversion. Future measurement needs actual tagged landing, successful adaptation, later return and provider-verified paid facts joined through the same lawful identity/time scope.

The prior PostHog ingestion result (9adaptation events in its explicit Oct22–29/product filter, unknown QA/repeat coverage) is historical evidence, not an updated count or proof this unpublished batch acquired customers. No claim of campaign performance is made. Creative work is not blocked by account setup.

## Six relevant source-linked opportunities

These sources informed actual pieces or the remaining calendar. They are observed conversations/teaching patterns, not verified viral rankings. Do not copy footage, manufacture testimonials or send unsolicited replies. Search dates and rendered relative dates can disagree; no exact freshness/growth claim is made.

| Observed source | Production implication / potential founder-led follow-up |
| --- | --- |
| [Cooking: yogurt marinade with lactose intolerance](https://www.reddit.com/r/Cooking/comments/1qxogac/i_want_to_make_a_yogurtmarinated_chicken_but_im/) asks whether a vegan yogurt performs the same function. | The new marinade carousel answers the ingredient's role with a real recorded RecipeFix example, without guaranteeing every brand's tenderizing performance. Potential future own-audience question: which recipe ingredient's job is hardest to replace? |
| [Cooking: tomato fridge versus counter](https://www.reddit.com/r/Cooking/comments/1thr78f/how_do_you_guys_actually_store_tomatoes_fridge_or/) contains conflicting household habits. | A clear ripeness/whole/cut decision is more useful than a blanket fridge taboo. New produce carousel uses primary extension/FDA guidance, not comment anecdotes. |
| [Budget Bytes / Beth Moncel: Greek chicken](https://www.budgetbytes.com/greek-marinated-chicken/) uses a concrete marinade and practical substitution framing. | Keep our shopping/method consequence understandable and food-led. It is a source/possible collaboration prospect, not an endorsement or a license to reuse the creator's footage. |
| [AskBaking: two8-inch pans versus one10-inch](https://www.reddit.com/r/AskBaking/comments/1jep0i8) asks about the consequence of changing pan geometry. | The tested pan prototype answers a real question but was not selected for this checkpoint's entertainment slot. Revisit with stronger physical visual action; pan area alone is not baked-yield proof. |
| [King Arthur: why pan size matters](https://www.kingarthurbaking.com/blog/2025/08/18/baking-pan-size) shows depth/capacity complications beyond a diameter number. | A later baking episode needs same-depth scope, baking-time consequences and actual recipe evidence; do not reuse the broiler example as universal baking success. |
| [Science Buddies: fruits and gelatin](https://www.sciencebuddies.org/science-fair-projects/project-ideas/FoodSci_p004/cooking-food-science/which-fruits-can-ruin-your-gelatin-dessert) frames a visible practical question. | The selected pineapple concept needs a satisfying cause-and-consequence animation and a real kitchen takeaway. Original illustration stays distinct from a performed experiment. No presenter or experiment footage was copied. |

No account access, recurring subscription or live publication is needed to review these media and choose the next batch.
