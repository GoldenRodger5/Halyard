# TikTok integration — audit and changes

**Status:** code complete for Direct Post. Blocked on portal configuration and one
real TikTok connection. Nothing about the integration is faked.

---

## What existed before

| Area | Where | State |
|---|---|---|
| Login Kit OAuth | `packages/core/src/adapters/tiktok.ts` | Correct — `client_key`, code exchange, refresh |
| Account connection | `/api/oauth/[platform]/start` + `/callback` | Shared with every platform; pending-connection + human confirmation |
| Token storage | `social_accounts.access_token_enc` | Sealed before touching Postgres; server-side only |
| Publishing | `TikTokAdapter.publish()` | **Inbox upload by default**, direct post behind two flags |
| `creator_info/query` | `TikTokAdapter.creatorInfo()` | Existed, but only used inside `verifyCapabilities` |
| `status/fetch` | `TikTokAdapter.fetchStatus()` | Existed, **never called** |
| Scheduling | `apps/worker/src/handlers/publish.ts` | Generic; no TikTok-specific consent model |
| Media | `assets.public_url` | Supabase Storage or local dev paths |

## Gaps found

1. **Privacy was hard-coded.** `privacy_level: 'PUBLIC_TO_EVERYONE'` on every direct
   post, with `disable_comment/duet/stitch` all `false`. This is the single most
   likely rejection: TikTok requires the *creator* to choose, and forbids a default.
2. **No publishing UI at all.** `creator_info` never reached a screen, so nothing
   displayed the nickname, the available privacy levels, the interaction settings,
   or the duration limit.
3. **No music-usage confirmation**, which TikTok requires before posting.
4. **No commercial-content disclosure** — neither `brand_content_toggle` nor
   `brand_organic_toggle` was ever sent.
5. **Init treated as success.** `publish()` returned on `publish_id`; nothing polled
   `status/fetch`, so a post that failed during TikTok's asynchronous processing
   would have been recorded as published.
6. **Scope mismatch.** Code requested `user.info.basic` and `video.upload`; the portal
   grants `user.info.profile`, `user.info.stats`, `video.list`. The inbox path
   depended on `video.upload`, which was never granted — **it could not have worked.**
7. **No TikTok-fetchable media URL.** `PULL_FROM_URL` needs a URL under a verified
   prefix, with no redirect and no auth. `/r/[id]` is the click router and *is* a
   redirect; Supabase URLs are on a domain Halyard cannot verify.
8. **Verification file in the wrong place** — repo root, which Vercel does not serve.

Not found, and good: no TikTok secret reaches the client, and the integration already
sits inside Halyard's identity/routing/idempotency architecture.

## Changes made

| Change | Where |
|---|---|
| Scopes → `user.info.profile`, `user.info.stats`, `video.list`, `video.publish` | `adapters/oauth.ts` |
| Direct Post option model + validation + status interpretation | `core/src/tiktok/directPost.ts` |
| Adapter **refuses** to post without a completed panel | `adapters/tiktok.ts` |
| `verifyCapabilities` reports `live` only on real `video.publish` + public option | `adapters/tiktok.ts` |
| `creatorInfo` / `fetchStatus` added to the adapter interface | `adapters/types.ts` |
| Publishing panel driven by live `creator_info` | `components/TikTokPanel.tsx` |
| Two server actions: refresh creator info, save choices | `queue/tiktokActions.ts` |
| Approval blocked while the panel is incomplete | `queue/actions.ts` |
| Worker re-validates against stored `creator_info` before posting | `handlers/publish.ts` |
| Media served from the verified origin | `app/media/[id]/route.ts` |
| TikTok asset URLs rewritten to `/media/<id>`, refused if not verifiable | `handlers/publish.ts` |
| Columns + DB-level check constraint | `migrations/0044_tiktok_direct_post.sql` |
| Verification file moved to `apps/web/public/` | — |

### Deliberately not done

- **Share Kit** — not needed; Direct Post covers the flow.
- **Webhooks** — see below.
- **Data Portability API** — not needed.

**On webhooks:** they would materially improve one thing. Halyard currently learns a
post's fate by polling `status/fetch`; a webhook would remove that poll and shorten the
gap between TikTok finishing and Halyard knowing. That is a genuine improvement and
*not* required for review, so it is documented rather than built — adding a product to
the submission that the code does not use is itself a rejection risk.

## Remaining manual portal steps

See `docs/TIKTOK_PORTAL_CHECKLIST.md`. In short: add `video.publish`, verify the URL
prefix, fill the four URLs, upload the icon, paste the copy, record the demo video.
