# MomentCircuit Launch + Automation Runbook — 2026-09-27

## Account choices

### TikTok
Use a **Personal account**, not Business.
Reason:
- TikTok positions Personal accounts for creators and creator tools.
- Creator Rewards requires a Personal account.
- TikTok analytics become available after at least one public post.

Anonymity:
- disable Contacts / Facebook friends / link-sharing suggestions;
- disable contact/Facebook sync;
- remove previously synced contacts if needed;
- deny OS Contacts permission.

### Instagram
Use a **Creator account**.
Reason:
- Content Rewards OAuth supports Instagram Professional/Business or Creator accounts.
- Creator account preserves a creator identity while still allowing professional analytics/scheduling integrations.

Do not join the same Meta Accounts Center as personal accounts.

### YouTube
Use the dedicated media Google account and create the MomentCircuit channel/Brand Account identity.

## Connection order

1. Create MomentCircuit Google account.
2. Create MomentCircuit TikTok Personal account.
3. Create MomentCircuit Instagram and switch to Creator.
4. Create MomentCircuit YouTube channel.
5. Connect TikTok/Instagram/YouTube to Content Rewards.
6. Connect the same accounts to Blotato.
7. Optionally connect Instagram/YouTube/TikTok to Metricool for planner/analytics visibility.
8. Do not connect personal socials.

## Publishing transport

Primary:
**Halyard -> Blotato -> social platforms**

Blotato currently supports scheduling/publishing and analytics across TikTok, Instagram, YouTube and other networks. Halyard already has a unified Blotato adapter.

Metricool is secondary:
- planning visibility;
- best-time data where account/platform APIs expose it;
- additional analytics.

Do not build a new scheduler.

## Initial timing experiment

There is no account-specific perfect schedule before MomentCircuit has data.

Use these 2026 research priors only as starting points:

### TikTok
Global strong window: **6 PM–9 PM**, with **8 PM** strongest in Metricool's 2026 study.

Initial primary slot: **8:00 PM ET**.
If a second strong post exists: test **6:15 PM ET**.

### Instagram Reels
General strongest window: **6 PM–9 PM**, with 8–9 PM strongest.

Initial primary slot: **8:15 PM ET**.
Exploration slot for a second strong post: **2:00 PM ET**.

### YouTube Shorts
General strong window: **2 PM–6 PM**.

Initial primary slot: **4:00 PM ET**.
Exploration slot: **2:30 PM ET**.

These are hypotheses. Replace them with MomentCircuit performance data.

## Learning loop

For each post record:
- platform;
- content pillar;
- paid campaign vs organic;
- source/campaign;
- hook family;
- first-frame text;
- duration;
- scheduled/published time;
- views at 1h / 6h / 24h / 7d;
- watch time / retention when available;
- completion rate when available;
- likes;
- comments;
- shares;
- saves;
- follows/subscriber change;
- campaign approval;
- approved/qualified campaign views;
- payout;
- policy/copyright flags.

Do not optimize for raw views alone.

### Decision score
Judge performance across:
1. retention/watch quality;
2. shares;
3. follow/subscriber conversion;
4. campaign payout where applicable;
5. repeatability;
6. policy/rights safety.

## Schedule adaptation

After enough comparable posts exist:
- concentrate most posts in the best-performing time windows;
- keep a smaller exploration share in alternative windows;
- compare only like with like where practical (same platform, similar niche/format);
- do not conclude a time slot is bad from one post.

No new engineering is required. The daily operator review can update the next queue based on measured performance.

## Daily automation

The ChatGPT automation "MomentCircuit Daily Review" runs daily and:
- checks connected Halyard/Blotato/Metricool/Content Rewards data;
- compares new posts;
- identifies winner/loser patterns;
- revises publishing-time recommendations;
- revises content priorities;
- surfaces campaign/account issues;
- stays quiet when there is no meaningful new data/action.

## Native monetization note

Paid/sponsored Content Rewards clips can earn campaign money but TikTok Creator Rewards separately requires original, high-quality videos longer than one minute and excludes sponsored content from qualifying videos.

Therefore:
- campaign clips = direct campaign cash + account growth;
- original 60–120s MomentCircuit explainers/story cuts = native-monetization candidates after the account qualifies.

Keep those roles separate.

## Current campaign state

### CoCo Jones
Active and accepting clips.
Current page:
- TikTok $2 / 1K;
- Instagram $2 / 1K;
- YouTube $2 / 1K;
- $2 min payout;
- $350 max payout per platform clip;
- about $2.7K remaining at last verified crawl.

This is the first executable campaign once owner/account and WeTransfer legal checkpoints are complete.

### COD Warzone Operator Skin Toggle
Active and economically attractive:
- TikTok $2 / 1K;
- Instagram $1.25 / 1K;
- max $750/clip;
- about $18.5K remaining at last verified crawl.

Do not produce until the official campaign source-media link is confirmed working.

## Sources

TikTok account types:
https://support.tiktok.com/en/using-tiktok/growing-your-audience/switching-to-a-creator-or-business-account

TikTok suggested accounts:
https://support.tiktok.com/en/account-and-privacy/account-privacy-settings/suggested-accounts

TikTok Creator Rewards:
https://support.tiktok.com/en/business-and-creator/creator-rewards-program/creator-rewards-program

YouTube channel creation:
https://support.google.com/youtube/answer/1646861

YouTube audience analytics:
https://support.google.com/youtube/answer/9314416

Content Rewards creator terms:
https://contentrewards.com/terms

Content Rewards creator pricing:
https://contentrewards.com/pricing/creators

Blotato:
https://www.blotato.com/

Metricool best times:
https://help.metricool.com/best-time-to-post-on-social-media-in-metricool-w7ll9
