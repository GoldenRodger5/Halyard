# TikTok Developer Portal — final checklist

Two lists. The first is finished; the second is yours.

---

## AUTOMATED / CODE COMPLETE

- [x] Login Kit OAuth (`client_key`, code exchange, refresh) — was already correct
- [x] Scopes in code match the portal exactly: `user.info.profile`, `user.info.stats`,
      `video.list`, `video.publish`
- [x] `video.upload` and the inbox path removed — the scope was never granted, so that
      path could not have worked
- [x] `creator_info/query` called before the posting UI renders
- [x] Creator nickname, username and avatar displayed
- [x] Privacy options rendered from TikTok's response, **nothing pre-selected**
- [x] Comment / Duet / Stitch controls, all off by default, disabled where TikTok says
      the account has them off
- [x] Commercial content disclosure — off by default, own-brand and branded-content
      kinds, branded content blocked on a private post
- [x] Music Usage Confirmation required before posting
- [x] `max_video_post_duration_sec` enforced against the actual video
- [x] Preview of the video and editable caption on the same screen
- [x] Approval blocked while the panel is incomplete
- [x] Worker re-validates against the stored `creator_info` before posting
- [x] `PULL_FROM_URL` from `https://halyard-ten.vercel.app/media/<assetId>` — verified
      prefix, no redirect, no auth, correct MIME
- [x] Refuses to post if a verified media URL cannot be built
- [x] `status/fetch` polling; published only on `PUBLISH_COMPLETE`; retryable and
      permanent failures separated
- [x] No watermark, logo or promotional text added to content
- [x] Verification file served at the domain root, unmodified
- [x] App icon, 600×600, square, no baked corner radius
- [x] Portal copy drafted (`docs/TIKTOK_APP_REVIEW_COPY.md`)

## MANUAL PORTAL ACTIONS

Do these in order.

### 1. Verify the URL prefix
- Go to your app → **URL properties**
- Add prefix `https://halyard-ten.vercel.app/`
- Click **Verify** and confirm it succeeds
- The file is already live; nothing to upload

### 2. Confirm products
- **Login Kit** — already added, leave as is
- **Content Posting API** — already added; open it and turn on **Direct Post**
- Do **not** add Share Kit, Webhooks or Data Portability

### 3. Add the missing scope
- In Content Posting API, add **`video.publish`**
- Confirm the full set is exactly: `user.info.profile`, `user.info.stats`,
  `video.list`, `video.publish`

### 4. App details
| Field | Value |
|---|---|
| App name | Halyard |
| App icon | `apps/web/public/branding/halyard-app-icon.png` (600×600) |
| Category | Productivity / Business tools |
| Website URL | `https://halyard-ten.vercel.app` |
| Terms of Service URL | `https://halyard-ten.vercel.app/terms` |
| Privacy Policy URL | `https://halyard-ten.vercel.app/privacy` |
| Web/Desktop URL | `https://halyard-ten.vercel.app` |
| Redirect URI | `https://halyard-ten.vercel.app/api/oauth/tiktok/callback` |

### 5. Review copy
Paste from `docs/TIKTOK_APP_REVIEW_COPY.md`: app description, one block per product,
one block per scope, and the user-flow description.

### 6. Connect TikTok in Halyard
Sign in at `https://halyard-ten.vercel.app/accounts`, click Connect on TikTok, authorize,
and confirm the account. **This must happen before the demo video can be recorded** — the
video has to show the real flow.

### 7. Record and upload the demo video
Follow `docs/TIKTOK_DEMO_SCRIPT.md`. One video, 30–120s, MP4, under 50 MB.

### 8. Submit for review

---

## Do not add

These are not used by the code, and claiming them invites rejection:

- Share Kit
- Webhooks (see the audit for why this is deferred rather than dismissed)
- Data Portability API
- `video.upload`, `user.info.basic`
