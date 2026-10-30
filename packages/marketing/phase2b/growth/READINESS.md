# Phase 2B commercial readback

Checked October 29, 2026. Read-only. No account connection, live posting, scheduling, outreach, adaptation, checkout or customer-record query was performed. Existing Halyard submission/approval contracts remain frozen.

## Destination and attribution

Fresh 390px browser contexts independently opened the tagged `/adapt` and `/original-recipes/chicken-tikka-masala` destinations. Both returned HTTP200, displayed the correct recipe/input surface and retained `utm_source=tiktok`, `utm_medium=social`, `utm_campaign=rf_first_fortnight`, and the QA `utm_content` in first/last attribution storage. All non-GET/HEAD requests were blocked. The screenshots and exact route receipt are on T9; `check-destinations.mjs` reproduces this bounded check. It proves route/UTM behavior, not a server-side acquisition join or conversion. Native profile-link placement remains deferred with the accounts.

The finishing CTA should point directly to the Chicken Tikka Masala Original when it says “Open the recipe and tap Make it fit.” A “bring your recipe” CTA could instead use `/adapt`; both routes work, but they are different actions. The finished caption must use the chosen variant ID as `utm_content`, rather than reuse the QA tag. Neither QA visit submitted an adaptation or a signup.

## Attention to verified customer

Source authority for the previously inspected release is RecipeFix `81a6bd9e8c892b08c2510fe1bfe9ea0681a51842`; exact files were reread using `git show`, without changing the dirty RecipeFix working tree. The current local auth-development checkout is a different commit and is not evidence of the deployed acquisition implementation.

| Outcome | Existing source evidence | What remains unproven |
| --- | --- | --- |
| Qualified visit | First/last UTM capture and the public route readback above. | A real post's unique visits, link eligibility and consented first-party join. |
| First successful adaptation | `Adapt.tsx` emits `first_value_success` after setting the successful result; `acquisitionEvents.ts` uses possession-bound session/account RPCs and mirrors GA4 `first_value`. | A minute dedupe is not lifetime uniqueness. Derive earliest eligible success per session/account, exclude automation/QA and keep event/people counts distinct. |
| Repeat cooking/use | Later eligible successful events and retained-artifact signals could support return cohorts after lawful identity/session reconciliation. | No campaign return cohort was measured. `acquisition_retention.sql` is a **90-day data-retention cleanup**, not proof of returning cooks. Saving a recipe is not proof it was cooked. |
| Verified Plus customer | `billing_charge_facts` source accepts successful positive Stripe invoice facts owned by the signed webhook. Client `trial_started`/`purchase_verified` signals are distinct. | No paid conversion, revenue amount or campaign-to-invoice join was queried or demonstrated. Trial/entitlement must not be called a paid invoice. Native-store verification remains a separately scoped authority. |

The later launch report should retain denominators and join coverage: published post → actual tagged visit → earliest successful adaptation → later eligible return → verified paid fact. Unmatched/consent-excluded populations stay explicitly unmatched. No new analytics service or production instrumentation was added in this checkpoint.

## Four-platform export and provider delta

Rechecked [Blotato media requirements](https://help.blotato.com/rest-api-reference/publish-post/media): H.264 MP4/AAC is the practical common export; TikTok does not receive automatic video conversion, so final files must already fit. Preserve the 720p source distinction even when composing 1080×1920 exports. The four static families already have JPEG IG/X assets; X text limits remain separate from video duration. [TikTok's direct-post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) documents `is_aigc` and own-business disclosure fields; later provider/account support must be verified, not inferred from a caption. [YouTube](https://support.google.com/youtube/answer/15424877) treats vertical/square uploads up to three minutes as Shorts, and [its AI disclosure guidance](https://support.google.com/youtube/blog/424874071/updates-to-ai-content-disclosure-and-labels?hl=en) covers realistic generated scenes. No platform upload/compression or live UI test was performed.

[Blotato analytics](https://help.blotato.com/rest-api-reference/analytics) still returns cached snapshots. Starter collects at days1/7/14/30; a 48-hour report must report snapshot age. [Buffer's current API guide](https://support.buffer.com/articles/using-buffers-api-GtIYIQilz5) still says metrics are experimental and unsuitable for dependable reporting. [Buffer pricing](https://buffer.com/pricing) lists Free up to three channels; four target channels need a paid/native-manual combination or paid coverage. The displayed annual Essentials equivalent is $5/channel/month, not a no-commitment monthly quote. No subscription replacement, trial or provider account action was made.

## Source-linked opportunities

The previous six opportunities remain in `phase2/growth/OPERATIONS-DELTA.md`. Two additional sources were directly inspected for relevance, not popularity or permission to reuse media:

- [r/Cooking: double oven versus stronger broiler](https://www.reddit.com/r/Cooking/comments/1udg1li/double_oven_worth_it_vs_more_powerful_broiler/) is a real capacity/appliance tradeoff discussion. It supports the audience problem, not appliance advice or a claim that RecipeFix detects hardware. No freshness/viral ranking is inferred from changing relative dates.
- [Budget Bytes: Chicken Tenders](https://www.budgetbytes.com/chicken-tenders/) explicitly varies added water with dairy-free yogurt thickness. This is a useful future texture/method angle alongside the yogurt carousel, not universal brand equivalence, an endorsement or a footage license.

No comments, follows or DMs were sent. Final exact media/copy, human listening and creative selection, account ownership, platform capability and a future concrete time remain separate release decisions. Rejected science is removed from the Phase2B typed candidate packet entirely and retained only as an explicitly blocked gallery reference.
