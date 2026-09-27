# Anonymous Channel OPSEC — 2026-09-27

## Goal

Keep the clipping operation publicly pseudonymous and reduce the chance that personal contacts, coworkers, friends, or existing followers are algorithmically connected to the new channels.

This is **viewer anonymity**, not anonymity from the platforms, payment processors, or tax authorities.

A public account can never guarantee that a person the operator knows will never encounter it organically.

## Identity separation

Use a dedicated media identity:
- working brand: **MomentCircuit**;
- dedicated email used only for the media operation;
- dedicated logo/avatar;
- no real name;
- no personal portrait;
- no personal voice unless deliberately voice-changed/generated;
- no employer, hometown, school, birthday, or personal-project references;
- no links to personal profiles.

Do not reuse:
- personal usernames;
- personal profile images;
- existing bios;
- personal Linktree;
- personal recovery email as public contact;
- unique phrases strongly associated with personal accounts.

## Browser/device separation

Preferred:
- separate browser profile for social/media operations;
- do not import browser history, bookmarks, saved logins, or contacts;
- do not grant Contacts permission to the social apps;
- do not search/follow personal friends from the brand account;
- do not interact with the brand account from personal accounts.

Using the same physical device cannot guarantee complete recommendation-graph separation. The objective is to remove the strongest explicit identity/contacts signals.

## TikTok hard settings

TikTok's current support documentation says adult accounts have account-suggestion settings enabled by default.

Immediately after creating the account:

### Privacy → Suggest your account to others
Turn OFF:
- Contacts
- Facebook friends
- People who open or send links to you

### Privacy → Sync contacts and Facebook friends
Turn OFF:
- Sync contacts
- Sync Facebook friends

If any sync ever occurred:
- choose **Remove previously synced contacts**.

At the iPhone/OS level:
- Contacts permission = OFF.

Use a dedicated email address that friends/family do not already have saved.

Prefer email-based signup. If a phone number is required, use a legitimate dedicated number if practical rather than a number widely stored in personal contacts.

TikTok itself notes that even with these settings disabled, recommendations may still occur through follows, interactions, or mutual connections. Therefore:
- do not follow personal accounts;
- do not send TikTok links from the brand account to personal contacts;
- do not interact with friends' content from the brand account.

Source:
https://support.tiktok.com/en/account-and-privacy/account-privacy-settings/suggested-accounts

## Instagram / Meta separation

Do not add the anonymous Instagram account to the same Meta Accounts Center as personal Facebook/Instagram accounts.

Meta states that Accounts Center can use information across added accounts for personalized experiences and account suggestions.

Therefore:
- standalone signup;
- dedicated email;
- no Facebook login;
- no profile-info sync;
- no contact upload;
- no cross-post to personal Facebook;
- no personal profile picture/username reuse.

Keep contact-upload settings disabled.

Sources:
https://www.facebook.com/help/943858526073065
https://www.facebook.com/help/messenger-app/561688620598358

## YouTube

Use a YouTube Brand Account/channel with:
- brand name;
- brand avatar;
- brand handle.

Google states that a Brand Account can use a different name/photo than the managing Google Account, and the personal name/email is not publicly shown as the channel identity.

For stronger separation, manage it through the dedicated media Google account rather than the personal Google account.

Sources:
https://support.google.com/youtube/answer/1646861
https://support.google.com/youtube/answer/7278798

## Media hygiene

Before upload:
- strip location metadata from original phone media if any;
- do not use personal screenshots containing names, notifications, bookmarks, or tabs;
- do not show home/work surroundings;
- do not mention local routines;
- use generated/brand voice or source audio instead of operator voice where anonymity matters;
- remove usernames from unrelated personal accounts visible in captures.

## Payment/KYC

Platforms may require:
- legal name;
- date of birth;
- address;
- tax information;
- bank/PayPal details;
- ID.

Provide these truthfully only inside the platform/payment provider.

Do not publish them in:
- bios;
- captions;
- public storefronts;
- GitHub;
- Halyard content;
- campaign submissions except where privately required.

## Public-contact email

If the channel eventually needs a public business email, create a second public-facing brand mailbox or alias.

Do not publish the login/recovery mailbox used to control the social accounts.

## Cross-brand separation

Do not connect MomentCircuit publicly to:
- LogicAndLayers;
- personal apps/projects;
- professional LinkedIn;
- personal TikTok/Instagram/YouTube;
- employer identity.

The fact that one operator owns them stays private.

## Incident response

If a personal contact follows/comments and anonymity matters:
- do not respond from a personal account;
- do not confirm ownership;
- block/hide only when appropriate and without drawing attention;
- review account-suggestion and contact-sync settings;
- review whether a personal account interacted with/shared the brand.

## Non-guarantee

These controls materially reduce obvious identity-linking signals.

They cannot guarantee that a public video will never be shown to someone the operator knows. Organic recommendation systems can independently surface popular content.
