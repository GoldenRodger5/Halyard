# Connecting a production account

**Every value in this file is also shown in the UI**, on each platform's card under
*"What &lt;platform&gt; needs to be told"* — derived from the same helper the OAuth route uses, so
they cannot drift. Prefer the UI; this file is the explanation.

Canonical production origin: `https://halyard-ten.vercel.app`

**No credential belongs in this file, in a commit, or in chat.**

---

## The flow

`Accounts → Connect → provider consent → /api/oauth/{platform}/callback → /accounts/confirm/{id} → Confirm`

The callback does **not** write to `social_accounts`. It seals the token into `pending_connections`,
asks the provider who the token belongs to, and makes the operator confirm the identity. Connecting
the wrong account because the browser was signed in as someone else is the most common failure in
this flow and is invisible until the first post lands.

## Status

Legend: **DONE** · **PARTIAL** · **BLOCKED (provider)** · **MANUAL (operator)** · **NOT IMPLEMENTED**

| Platform | Code | UI | External config | Real provider flow | State |
|---|---|---|---|---|---|
| **X** | DONE | DONE | MANUAL — callback + app type | not exercised | BLOCKED (provider) |
| **Instagram** | DONE (§184, Instagram Login) | DONE | MANUAL — redirect + deauthorize + deletion URLs | not exercised | BLOCKED (provider) |
| **Threads** | DONE | DONE | MANUAL — own app id + callback | not exercised | BLOCKED (provider) |
| **Bluesky** | DONE | DONE | none | not exercised | MANUAL (app password) |
| TikTok | DONE | DONE — says what is missing | MANUAL — register app | n/a | NOT CONFIGURED |
| Pinterest | DONE | DONE — says what is missing | MANUAL — register app | n/a | NOT CONFIGURED |
| YouTube | DONE | DONE — says what is missing | MANUAL — register app | n/a | NOT CONFIGURED |
| Facebook | NOT IMPLEMENTED | — | — | — | no adapter |

**No account is connected.** Every remaining blocker is a provider-dashboard setting
or a consent screen that needs the operator's own login — neither is something code
can do. What *is* done: the handoff from Halyard to each provider is correct and
exercised in a real browser (`e2e/oauth-connect.spec.ts`), and the callback refuses
a forged state, a missing code, and a provider error without creating anything.

### What "not exercised" means precisely

The browser drives: Accounts → click Connect → the real route handler → the real
redirect → the provider's authorize URL, asserted from the browser's own location.
It stops at consent, which needs the operator's provider login and MFA. Everything
before that hop is tested; the hop itself, and everything after it — token
exchange, identity lookup, pending connection, confirmation — waits on a real
authorisation.

## X

The authorize request is correct and verified against X's current OAuth 2.0 documentation:
`https://x.com/i/oauth2/authorize` with `response_type`, `client_id`, `redirect_uri`, `scope`,
`state`, `code_challenge`, `code_challenge_method=S256`.

**X developer portal → your app → User authentication settings**

- **Callback URI / Redirect URL** → `https://halyard-ten.vercel.app/api/oauth/x/callback`
- **Website URL** → `https://halyard-ten.vercel.app`
- **OAuth 2.0** must be on.
- **Type of App** must be **Web App, Automated App or Bot**. Halyard authenticates the token
  exchange with a client secret (HTTP Basic), which is a *confidential* client; a Native App or SPA
  is a public client and the exchange will be refused.
- **App permissions** must be **Read and write**, or `tweet.write` is refused at consent.

*"Something went wrong — You weren't able to give access to the App"* is X's page for a request it
will not serve at all. It is raised before consent, so it is never a token or scope-grant problem —
it is the callback URI, the app type, or OAuth 2.0 being off.

## Instagram

Halyard uses **Instagram API with Instagram Login** (§184). The account must be a
**Professional** account (Business or Creator) — but it does **not** need a Facebook Page, and
Halyard never touches one.

Instagram Login issues its own app id and secret, separate from the Meta app's, exactly as
Threads does.

- Set **`INSTAGRAM_APP_ID`** and **`INSTAGRAM_APP_SECRET`** (Meta App Dashboard → Instagram API
  use case → *API setup with Instagram login*, the "Instagram app ID" and "Instagram app secret"
  fields — **not** the Meta App ID).
- **Business login settings → OAuth redirect URIs** →
  `https://halyard-ten.vercel.app/api/oauth/instagram/callback`
- **Deauthorize callback URL** → `https://halyard-ten.vercel.app/api/webhooks/meta/deauthorize`
- **Data deletion request URL** → `https://halyard-ten.vercel.app/api/webhooks/meta/data-deletion`

### Scopes, and why each one

Four, and every one has a call site — asserted by `metaScopes.test.ts`.

| Scope | What it authorises |
|---|---|
| `instagram_business_basic` | `/me` — the account's own profile, shown on the confirmation screen |
| `instagram_business_content_publish` | `/{id}/media` and `/media_publish` |
| `instagram_business_manage_comments` | `/{id}/comments` on Halyard's own posts |
| `instagram_business_manage_insights` | `/{id}/insights` on Halyard's own posts |

`instagram_business_manage_messages` is deliberately **not** requested. Meta's setup page lists
it; Halyard implements no direct messaging, and asking review to approve a permission nothing
calls is a rejection risk.

### The flow

`instagram.com/oauth/authorize` → code → `api.instagram.com/oauth/access_token` (short-lived,
plus the granted `permissions`) → `graph.instagram.com/access_token?grant_type=ig_exchange_token`
(60-day) → `/me` for the identity → operator confirms → stored.

Refresh is `graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`, which takes the
token itself and no client secret.

**Requested, granted and approved stay distinct.** The requested set is the list above; the
granted set is what Instagram returns in `permissions` at exchange time and is what the publish
gate reads; App Review approval is neither, and is recorded separately by the operator.

## Threads

**Threads is not the Meta app.** Meta's documentation: *"For Threads API implementation purposes,
use the Threads app ID and its corresponding app secret,"* and the authorization reference names
`client_id` as *"Your Threads App ID."* Adding the Threads use case to a Meta app mints a separate
id, and sending the Meta App ID fails at the provider before consent.

- Set **`THREADS_APP_ID`** and **`THREADS_APP_SECRET`**. Halyard falls back to the Meta app if they
  are unset, and reports that it has done so rather than failing silently.
- **Threads use case → Settings → Redirect Callback URLs** →
  `https://halyard-ten.vercel.app/api/oauth/threads/callback`

## Bluesky

The only platform with a manual credential step, and it is deliberate: Bluesky has no OAuth app
model here.

1. Create an app password at `bsky.app/settings/app-passwords`.
2. Paste it, with the handle, into the Bluesky form on **Accounts**.

It goes straight into the same pending-connection flow. **Never paste it into chat** — the form is
the only correct place.

## TikTok, Pinterest, YouTube

Adapters, scopes, callbacks, persistence and refresh are implemented; no developer app exists, so
`resolvePlatformClient` reports `missing` and Connect returns 428 naming the variables to set.

| Platform | Register | Then set |
|---|---|---|
| TikTok | TikTok for Developers — add Login Kit **and** Content Posting API | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Pinterest | Pinterest developers — trial apps write only to sandbox boards | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` |
| YouTube | Google Cloud — enable YouTube Data API v3, create an OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Each redirect URI follows the same shape: `https://halyard-ten.vercel.app/api/oauth/{platform}/callback`

## Database

Two tiers, two poolers, and they are **opposites**:

| Tier | Pooler | Port | Why |
|---|---|---|---|
| Web | transaction | **6543** | Each serverless instance holds its own connection; session mode exhausts the client limit (`EMAXCONNSESSION`) |
| Worker | session | **5432** | §165's correction claim is `pg_try_advisory_lock`, which is session-scoped |

The worker case is the dangerous one. Behind a transaction pooler the lock is taken and dropped
around a single statement and guards nothing — two workers would both believe they held the claim,
and the only symptom would be duplicated correction spend. `assertPoolerFor` refuses to start rather
than run that.

Supabase gives both URLs under **Project Settings → Database → Connection string**; they differ only
in the port.

**Both are now set correctly and verified in production.** The web tier reports
`{"pooler":"transaction"}` from `/api/health`; the worker logs
`database.pooler mode="session" ok=true` at startup.

The hazard is not theoretical: connecting on 6543 and taking the *same* advisory lock twice in a row
succeeded both times. That is the failure §173 describes, observed — two workers would each believe
they held the correction claim.

**Deploying the worker:** `railway up`, not `railway redeploy`. Redeploy rebuilds the previous
snapshot, so it can report success while shipping nothing new.
