# TikTok Developer Portal — copy to paste

Each block below goes in the field named above it. Everything here describes what the
code actually does today.

---

## App description

Halyard is a social media management platform for creators and businesses. A user
connects the accounts they own — TikTok, X, Instagram, Threads and others — then
plans, writes, reviews and schedules content for those accounts from one place, and
tracks how each post performs after it goes out.

Halyard is built around explicit human approval. Content is prepared and queued, but
nothing reaches a social platform until the user reviews that specific post and
approves it. There is no autopilot and no bulk posting.

---

## Product: Login Kit

Login Kit is how a Halyard user connects their own TikTok account.

From the Accounts screen the user clicks Connect on TikTok, is sent to TikTok to
authorize, and returns to Halyard. Halyard then calls `/v2/user/info/` and shows the
user exactly which TikTok account was authorized — nickname, username and avatar — and
asks them to confirm it is the right one before the credential is saved. This exists
because the most common connection error is authorizing whichever account the browser
happened to be signed into.

Halyard stores the access token server-side, encrypted. It is never exposed to the
browser and never leaves Halyard's backend.

---

## Product: Content Posting API

The Content Posting API is how a Halyard user publishes a video they have prepared in
Halyard to their own TikTok account, using Direct Post.

Before showing any posting controls, Halyard calls
`/v2/post/publish/creator_info/query/` and builds the interface from that response:
the creator's nickname, the privacy levels TikTok currently offers that account,
whether comments, Duet or Stitch are turned off, and the maximum video duration
allowed. Nothing is assumed or cached in place of that call.

The user then chooses, for that specific post:

- who can see it, from the privacy levels TikTok returned — nothing is pre-selected
- whether to allow comments, Duet and Stitch — all off unless the user turns them on,
  and any option TikTok reports as disabled is shown disabled
- whether the post is commercial content, and if so whether it promotes their own
  brand, is a paid partnership, or both — off by default
- confirmation that they agree to TikTok's Music Usage Confirmation

Only when those are complete can the post be approved. Halyard then calls
`/v2/post/publish/video/init/` with `PULL_FROM_URL`, serving the video from Halyard's
own verified domain, and polls `/v2/post/publish/status/fetch/` until TikTok reports
the post complete. A post is recorded as published only on `PUBLISH_COMPLETE` — an
accepted initialization is not treated as success.

Halyard adds no watermark, logo, caption or promotional text to the video.

---

## Scope: user.info.profile

Used to identify the account the user connected and to display it in Halyard.

At connection Halyard calls `/v2/user/info/` for `open_id`, `username`, `display_name`
and `avatar_url`, shows them on the confirmation screen so the user can verify the
right account was authorized, and stores `open_id` as the account's identity. That
stored id is what Halyard checks on every later reconnection, so a user cannot
accidentally attach a different TikTok account to an existing one.

## Scope: user.info.stats

Used to show the user their follower count on the account card, so they can confirm
they connected the intended account and see its reach alongside their other connected
platforms.

## Scope: video.list

Used to retrieve performance metrics for videos Halyard published on the user's behalf.
Halyard calls `/v2/video/query/` with the ids of posts it created, and shows views,
likes, comments and shares back to the user so they can see how their content performed.
Halyard only queries videos it published.

## Scope: video.publish

Used to publish a video to the user's TikTok account through Direct Post, after the
user has reviewed that specific post and explicitly approved it.

This is the scope the whole integration exists for: a Halyard user prepares a video,
configures the TikTok settings described above, approves it, and Halyard sends it via
`/v2/post/publish/video/init/`. Halyard never posts without that per-post approval.

---

## App review description — the user flow

1. A user signs in to Halyard and opens Accounts.
2. They click Connect on TikTok and are sent to TikTok to authorize.
3. They return to Halyard, which shows them which TikTok account was authorized and
   asks them to confirm it.
4. They create or select a video in Halyard and choose TikTok as the destination.
5. Halyard queries `creator_info` and shows the TikTok posting panel: creator name,
   the privacy options TikTok offers, comment/Duet/Stitch controls reflecting the
   account's settings, commercial content disclosure, a preview of the video and its
   caption, and TikTok's Music Usage Confirmation.
6. The user chooses the settings and confirms. Halyard will not accept the post until
   a privacy level is chosen and the music confirmation is given.
7. The user approves the post.
8. Halyard calls `/v2/post/publish/video/init/` with those exact settings, pulling the
   video from Halyard's verified domain.
9. Halyard polls `/v2/post/publish/status/fetch/` and shows the user the result —
   processing, published, or the reason it failed.
