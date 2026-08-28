# Where Halyard stands, platform by platform

**As of 2026-08-28.** Everything here was verified against production, not inferred.
`publishing_enabled = false`. **0 publications recorded.** Nothing has been posted publicly.

---

## The one-line answer

Five accounts are connected and every credential is alive. **One real upload succeeded**
(YouTube, private). Every remaining blocker is a setting in a provider's dashboard, not code.

---

## A. Connections

| Platform | Account | Credential | Capability | Verified how |
|---|---|---|---|---|
| **YouTube** | `@recipefix` | live, refresh token stored | `draft_only` | **real private upload succeeded** |
| **TikTok** | `@recipefix` | live (sandbox app) | `live` | live read; Direct Post blocked, see C |
| **X** | `@Recipe_Fix` | live | `live` | live read |
| **Threads** | `@recipe.fix` | live | `live` | live read |
| **Instagram** | `@recipe.fix` | live | `live` | live read |
| Pinterest | `@recipefix` | none | `pending_auth` | no developer app |
| X (founder) | `@IsaacMBuilds` | none | `pending_auth` | never connected |

Each row's "live read" is `selfTest`: the token exists, carries scopes, and performed a real
read against the platform. That is evidence, not a stored flag.

## B. What was actually posted

**YouTube — succeeded.** A real 1080×1920 render, uploaded as `privacyStatus: private`:

```
video id  v5Ty6K5BuqE
mode      private
```

This is the most complete proof in the system. It exercised the whole chain end to end:
the asset served from `halyard-ten.vercel.app/media/<id>` on the verified origin, the
adapter's resumable upload, and YouTube accepting it. An unaudited Google client can only
upload as private, which is why `capability_state` is `draft_only` — that is the expected
state on day one, not a fault.

**Delete it when you like**: YouTube Studio → Content → the video → Delete.

**TikTok — failed, informatively.**

```
HTTP 403  url_ownership_unverified
```

TikTok verifies the `PULL_FROM_URL` domain **per app**, and `halyard-ten.vercel.app` is
verified on the **Production** app only. The post went through the **Sandbox**, which keeps
its own URL properties. See C.

**X, Threads, Instagram — deliberately not posted.** None of the three has a draft or private
mode: a test post is immediately public on a brand account, and on X it is billed per call
(~$0.015, ~$0.20 with a link). A rehearsal was attempted instead and could not run — see E.

## C. What each platform still needs

### TikTok — one setting
In the developer portal, switch **URL properties** from *Production* to **Sandbox** and verify
the prefix `https://halyard-ten.vercel.app/` there too. The signature file is already served
and unchanged. Without it, every Direct Post returns `url_ownership_unverified`.

Also before submitting for review: **remove Share Kit**. It is still selected and Halyard does
not implement it; unused products delay review.

### Threads — reconnect once
Its stored scope list is **empty**. Threads returns granted scopes on the short-lived exchange
and omits them from the long-lived upgrade; §180 fixed that, but this account connected before
the fix deployed. Nothing gates on it today — the publish path does not read scopes — so it is
cosmetic until something does. Reconnecting repopulates it.

### Instagram — Meta App Review
Connected and reading. Publishing publicly needs review, which is weeks. Two callback URLs are
already live and must stay registered:
`/api/webhooks/meta/deauthorize` and `/api/webhooks/meta/data-deletion`.

### X — nothing technical
Connected, no review gate. Posting is live and billed immediately. The only reason nothing has
gone out is that it would be a real public post.

### YouTube — working, with a ceiling
Uploads land private until Google's compliance audit passes. That audit is what lifts
`draft_only` to `live`.

### Pinterest — no developer app
Register one, then set `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`.

## D. Safety

- `publishing_enabled` **false**, and the kill switch was **not** flipped for these tests. It
  governs autonomous publishing; arming it to test one thing would arm every path for as long
  as it stayed on. Both tests called the adapter directly, once, under explicit authorisation.
- **0 publications recorded** — nothing entered the publication ledger.
- The one artefact that exists on a platform is a **private** YouTube video.

## E. A known gap in the tooling

`dryRunPublish` — build the exact request, record it, send nothing — cannot currently rehearse
Instagram, TikTok or YouTube. All three poll a media container until the platform reports it
finished; the dry-run fetch answers with a stub that never says finished, so the loop runs to
its five-minute ceiling recording every poll until the heap dies.

That is worth fixing, because rehearsal is exactly the right instrument for X and Threads,
where a real test post is public and irreversible. The fix is to let the adapters accept an
injected clock rather than calling `setTimeout` directly — a contained change, and not one to
make while pointing at live accounts.

## F. What to do next, in order

1. **TikTok**: verify the URL prefix under **Sandbox**; remove Share Kit. Then the demo video
   at `docs/tiktok-review/halyard-tiktok-demo.mp4` (61.8s, 1.02 MB) can be submitted.
2. **Rotate the Halyard password** — two values passed through a chat transcript.
3. **Threads**: reconnect to repopulate scopes.
4. Decide about X and Threads test posts. Both are irreversibly public; the honest options are
   a real post you then delete, or fixing the rehearsal harness in E first.
5. **Instagram**: submit Meta App Review when ready.
6. **Pinterest**: register a developer app.
