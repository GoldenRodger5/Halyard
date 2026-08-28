# YouTube

**Status as of 2026-08-28.** Connected, uploading, `draft_only`. One real
private upload has succeeded end to end. Public publishing is blocked by two
separate Google processes, neither of which is code.

---

## The one thing to understand first

YouTube is **two products behind one endpoint**. `videos.insert` takes the same
request for a 30-second Short and a twelve-minute tutorial, and they are not the
same job — different length ceilings, different title strategy, different
description, different feed, different analytics.

**Halyard does not choose which one it is. YouTube does, at ingest.** Since
15 October 2024 any upload that is square-or-taller and runs three minutes or
less is a Short, and nothing in the API overrides that. The `#Shorts` hashtag
stopped being a classifier on the same date.

So a `long_form` intent carried on a 45-second vertical render is not a setting
YouTube will honour — it is a mistake that only surfaces after publication.
`resolveVariant` returns both what was intended and what will actually happen,
and the mismatch is a warning rather than a block. See
`packages/core/src/youtube/variant.ts`.

---

## A. What Halyard implements today

| | Status | Where |
|---|---|---|
| OAuth (offline + consent, refresh token stored) | works | `adapters/youtube.ts#getAuthUrl` |
| Token refresh | works | `#refresh` — carries the refresh token forward, which Google does not re-send |
| Channel identity, incl. brand channels | works | `#fetchIdentity` — `mine=true` returns whichever the consent screen selected |
| Resumable upload, 8 MB chunks | works | `#resumableUpload` — proven by video `v5Ty6K5BuqE` |
| Shorts / long-form variants | **new, §199** | `youtube/variant.ts` |
| Scheduled publish (`status.publishAt`) | **new, §199** | reachable on `youtube.upload` alone |
| Per-item category | **new, §199** | was hardcoded to Howto & Style for every upload |
| Synthetic-media disclosure | works | `status.containsSyntheticMedia` |
| Comments read | works | `#listComments` |
| Metrics | partial | Data API `statistics` only — see D |
| Thumbnail, playlist, chapters, captions | **not implemented** | needs a scope Halyard does not hold — see C |

### Variant rules, as enforced

| | Short | Long-form |
|---|---|---|
| Duration | ≤ 180s | ≤ 12h (15 min until the channel is verified) |
| Shape | square or taller | anything; landscape guarantees it |
| Title | ≤ 60 chars advised, `#Shorts` appended | ≤ 70 chars advised, front-load search terms |
| Description | link first — few expand it | summary first — this is the SEO surface |

Hard API limits, enforced by `validateYouTubeUpload`: title ≤ 100 chars, description
≤ 5000, tags ≤ 500 chars **in total across the array**, and no `<` or `>` in
either title or description — YouTube rejects rather than escaping.

---

## B. Scopes — what is granted, and what it buys

Granted in production, verified against the live token:

```
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

| Scope | Needed for | Used today |
|---|---|---|
| `youtube.upload` | `videos.insert`, including `status.publishAt` | yes |
| `youtube.readonly` | `channels.list`, `videos.list` statistics, `commentThreads.list` | yes |
| `yt-analytics.readonly` | YouTube **Analytics** API — watch time, retention | **no** |

`yt-analytics.readonly` is granted and nothing calls it. `collectMetrics` reads
`videos?part=statistics` from the **Data** API, which is a different service.
It is kept rather than dropped because watch time and completion rate exist
nowhere else, and those are the two metrics that make long-form measurable —
but until something calls it, it is a scope asked for and unused. See D.

### The scope Halyard does *not* have, and what that costs

`videos.update`, `thumbnails.set` and `playlistItems.insert` all require
`https://www.googleapis.com/auth/youtube` or `.../youtube.force-ssl`.

**Consequence: a private upload cannot be made public over the API.** The
delivery note claimed it could, from §156 until §199 corrected it. Flipping a
private video today is Studio work.

This matters less than it sounds *right now*, because the compliance audit
blocks public uploads anyway. It will matter the moment the audit passes.

---

## C. What Google requires, in three separate piles

The brief's distinction, kept strictly — these are three different processes and
conflating them is why "YouTube verification" sounds like one task.

### 1. CODE REQUIREMENTS — done, or deliberately deferred

- Scopes requested are minimal for what is implemented. ✔
- Refresh handled with `access_type=offline` + `prompt=consent`. ✔
- Uploads land private while unaudited, by construction. ✔
- Synthetic media declared natively. ✔
- **Deferred:** `youtube.force-ssl` for thumbnails/playlists/privacy flips.
  Adding a scope enlarges the verification surface, so it should be added
  *deliberately*, when there is a feature that needs it — not pre-emptively.

### 2. GOOGLE CLOUD CONSOLE ACTIONS — yours, and mechanical

**Enable the APIs**

```
CLICK → console.cloud.google.com → APIs & Services → Library
      → "YouTube Data API v3"      → Enable      (required; everything uses it)
      → "YouTube Analytics API"    → Enable      (only when D is implemented)
```

**Check the OAuth client's redirect URI matches exactly**

```
CLICK → APIs & Services → Credentials → the OAuth 2.0 Client ID
FIELD   Authorised redirect URIs
VALUE   https://halyard-ten.vercel.app/api/oauth/youtube/callback
```

Exact match, including scheme and no trailing slash. Halyard builds this from
`OAUTH_REDIRECT_BASE_URL`, falling back to the request origin
(`lib/oauthRedirect.ts`).

**Check the publishing status of the consent screen**

```
CLICK → APIs & Services → OAuth consent screen
FIELD   Publishing status
```

- **Testing** — only listed test users can connect, refresh tokens expire after
  7 days, and the connection dies weekly. If it says Testing, either add
  `isaacmineo@gmail.com` as a test user *and expect weekly reconnects*, or
  publish the app.
- **In production** — unverified apps show an "unverified app" interstitial and
  are capped at 100 users. For a single-operator tool that cap is irrelevant;
  the warning screen is cosmetic.

### 3. GOOGLE VERIFICATION / AUDIT ACTIONS — two *different* reviews

These are frequently confused. Both are needed for public publishing.

| | OAuth verification | YouTube compliance audit |
|---|---|---|
| Run by | Google Trust & Safety | YouTube API Services team |
| Triggered by | requesting sensitive/restricted scopes | uploading via API |
| Lifts | the unverified-app warning, the 100-user cap | **the private-only upload restriction** |
| How | Console → OAuth consent screen → *Prepare for verification* | the *YouTube API Services — Audit and Quota Extension Form* |
| Needs | privacy policy URL, homepage, scope justification, demo video | a demo of the integration and compliance with the Developer Policies |

**The audit is the one that matters for Halyard.** Apps created after
28 July 2020 that have not passed it can only upload as `private` — which is
exactly what `capability_state = 'draft_only'` records. That is the expected day-one
state, not a fault.

Default quota, for reference: 100 `videos.insert` per day, 100 `search.list`,
and 10,000 units/day shared across everything else.

---

## D. The analytics gap, stated honestly

`collectMetrics` returns:

```ts
videoViews:  statistics.viewCount
impressions: statistics.viewCount   // ← not impressions
likes:       statistics.likeCount
comments:    statistics.commentCount
```

**`impressions` is set to view count, and those are different numbers.** An
impression is a thumbnail shown; a view is one watched. Reporting one as the
other makes click-through rate — the single most useful long-form metric —
silently meaningless.

Real impressions, watch time, average view duration and retention come from the
**YouTube Analytics API** (`youtubeAnalytics.reports.query`), which is the
service `yt-analytics.readonly` was granted for and which nothing calls.

Not fixed in this pass because it belongs with the cross-platform analytics
normalisation, where "this platform cannot see it" and "this platform measured
zero" have to stay distinguishable — gotcha 9, and the difference between `null`
and `0`.

---

## E. What is left

| | What | Whose |
|---|---|---|
| 1 | Enable YouTube Data API v3 in Cloud Console | you |
| 2 | Confirm redirect URI matches exactly | you |
| 3 | Confirm consent-screen publishing status (Testing = weekly reconnects) | you |
| 4 | Submit the YouTube API Services audit — this is what lifts `draft_only` | you |
| 5 | Replace `impressions = viewCount` with real Analytics API figures | code |
| 6 | Add `youtube.force-ssl` **when** a feature needs thumbnails or privacy flips | code, deliberately deferred |
| 7 | Long-form render path — no composition produces landscape video yet | code |

Item 7 is worth naming plainly. The adapter, the copywriter spec and the
validation all support long-form now, but **nothing renders landscape video.**
`CANVAS` in `packages/render/src/brand.ts` defines `16:9` as 1920×1080, and no
template declares it — all twelve rows in `templates` are 9:16, 4:5, 1:1 or
2:3, in both the local and production databases, and all five video templates
are 9:16.

So long-form is reachable today only by attaching an externally produced
landscape asset. That is a real capability, and `resolveVariant` will classify
it correctly — but Halyard cannot yet *make* one. Adding a 16:9 template is the
smallest thing that closes it, and the canvas already supports the dimensions.
