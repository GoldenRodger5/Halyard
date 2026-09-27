# Clipping Operation — Human-Only Checklist

**27 September 2026**

This file defines the actions that **only the account owner should perform**. Everything else belongs to the operator/agent workflow.

## Rule

If an action requires the operator's:
- legal identity;
- acceptance of a binding platform/campaign agreement;
- CAPTCHA;
- MFA/SMS/email verification;
- recovery credentials;
- payout/KYC/tax information;
- OAuth consent while logged into a social account;

the human does that action.

Do **not** make the human edit video, research campaigns, calculate CPM economics, write captions, monitor analytics, or decide which source moment to use.

## One-time owner setup

### 1. Create a dedicated media Google account

Create a new Google account used only for the anonymous media operation.

Public-facing brand name: **MomentCircuit**.

Do not use:
- personal Google account;
- personal recovery email as a public contact address;
- real name in the public profile;
- personal profile image.

A recovery email/phone may still be used privately if Google requires it. Never publish it.

This account also becomes the owner of the anonymous YouTube channel.

### 2. Create TikTok and Instagram

Create:
- TikTok: `MomentCircuit` or closest available handle;
- Instagram: same handle where practical.

Use the dedicated media email.

The human handles:
- CAPTCHA;
- age/legal acknowledgements;
- email/SMS verification;
- MFA.

Immediately apply the privacy checklist in `ANONYMOUS_CHANNEL_OPSEC_2026-09-27.md`.

TikTok:
- turn off Contacts suggestions;
- turn off Facebook-friends suggestions;
- turn off people-who-open-or-send-links suggestions;
- turn off contact/Facebook sync;
- remove previously synced contacts if any;
- deny iOS Contacts permission.

Instagram:
- do not add the account to the same Meta Accounts Center as personal accounts;
- no Facebook login;
- no contact upload/sync.

### 3. Create the YouTube brand channel

On the dedicated Google account:
- create channel: **MomentCircuit**;
- secure closest matching handle;
- use brand avatar, not personal photo.

No videos need to be uploaded manually during setup.

### 4. Link social accounts to Content Rewards

Content Rewards' current terms require a connected social account to verify ownership and read analytics.

The human completes the official OAuth/verification consent for:
- TikTok;
- Instagram;
- YouTube when we use YouTube-eligible campaigns.

The connection is read-only according to current Content Rewards terms; Content Rewards says it does not publish on the creator's behalf.

The human also accepts the current Content Rewards Creator Terms if prompted.

### 5. Complete payout/KYC checkpoints

If Whop/Content Rewards asks for:
- legal name;
- DOB;
- address;
- tax information;
- bank/PayPal details;
- ID/KYC;

the human enters truthful information directly in the provider.

Never send IDs, bank credentials, passwords, recovery codes, or tax documents through GitHub/chat.

### 6. Asset-provider terms when required

Some campaigns host approved footage on third-party file services.

Example: the first clean backup campaign, CoCo Jones, hosts source footage on WeTransfer. The WeTransfer page currently asks the visitor to agree to its Terms of Service/Privacy acknowledgement before download.

That agreement is a human checkpoint. After it is accepted, the operator can handle the actual asset download/processing where normal download controls permit it.

## Recurring human actions

After setup, recurring human involvement should be limited to:

1. CAPTCHA/MFA/login challenge if a platform asks.
2. A new legal/campaign agreement if terms materially change.
3. KYC/payment verification.
4. Platform-specific manual approval where an API does not permit automation.
5. Final content approval only when the operator deliberately keeps a human gate for safety/quality.

Everything else is delegated.

## Operator/agent responsibilities

The agent/operator handles:
- campaign discovery;
- campaign ranking;
- terms/brief extraction;
- source-rights checks;
- asset organization;
- transcription;
- candidate-moment mining;
- hook scoring;
- clip editing;
- captions and titles;
- on-screen text;
- FTC disclosure placement;
- platform packaging;
- campaign compliance QA;
- duplicate detection;
- publishing preparation;
- analytics logging;
- payout reconciliation;
- next-clip selection;
- kill/pivot decisions;
- documentation.

## Current setup blocker

Until the anonymous TikTok/Instagram accounts exist and are linked to Content Rewards, no paid CPM clip can be submitted.

That is the only meaningful launch blocker under our control right now.
