# Deploying Halyard

**Live:** https://halyard-ten.vercel.app — Supabase `halyard` (us-east-1),
Vercel `halyard`, Railway `halyard/worker`. Deployed 11 August 2026,
**brought current 22 August 2026** (see *Bringing production current* below).

## What the first deploy found

Five defects, none of which could appear locally. They are listed first because
the pattern matters more than the individual fixes: **everything that broke was
something the local run had no way to exercise.**

| What | Why local could not see it |
|---|---|
| 27 of 57 tables granted `anon` full write access | No PostgREST and no `anon` role locally. RLS was on and forced, which is what a local check confirms — and RLS filters rows, while the grant is permission to reach the table at all |
| Vercel Cron sends GET; the route exported only POST | Nothing local calls a cron the way Vercel does |
| Hobby caps crons at one run a day; `refresh_tokens` was hourly | Plan limits do not exist locally |
| Every schedule ran once a minute instead of on its interval | Needs the worker left running for longer than one interval. Eleven hours produced 694 runs of a thirty-minute job |
| Playwright's Chromium was never installed in the worker image | The apt block installs Chromium's *dependencies*, which looks like installing Chromium. 43 dead capture jobs |

The two that were silent are the ones worth remembering: a cron returning 405
pages nobody, and a scheduler over-firing looks like a healthy busy worker.


Three pieces, three hosts. The web app on Vercel, the database on Supabase, the
worker anywhere that will run a container with Chromium and FFmpeg in it.

**Nothing in this file contains a secret, and nothing that does is ever
committed.** Every value below lives in a dashboard.

---

## Where things actually are

| | |
|---|---|
| Web | https://halyard-ten.vercel.app — Vercel project `halyard`, root directory `apps/web` |
| Database | Supabase `halyard`, ref `aleiahgcxhglnsvaajzn`, us-east-1 |
| Worker | Railway project `halyard`, service `worker`, built from `apps/worker/Dockerfile` |

**Connect to the database through the pooler, not the direct host.**
`db.<ref>.supabase.co` is IPv6-only and Vercel functions are IPv4, so the direct
host does not resolve from a deployed function at all. The pooler
(`aws-0-us-east-1.pooler.supabase.com`, user `postgres.<ref>`) is not an
optimisation here, it is the only route that works. Migrations still use the
direct host, which is correct — they run from a laptop with IPv6.

## What goes where

| Piece | Host | Why there |
|---|---|---|
| Web app | Vercel | Next.js App Router, and the cron surface for the two jobs that need OAuth client secrets |
| Database | Supabase | Postgres 17 with RLS, point-in-time recovery, and Storage for rendered media |
| Worker | Railway (or Fly) | Renders video and drives Playwright. Vercel functions cap out well below either |

The worker cannot run on Vercel. Remotion needs sustained CPU for minutes at a
time and Playwright needs a real Chromium; both exceed any serverless limit.

---

## 1. Database

```bash
supabase projects create halyard
DATABASE_URL='<the pooler connection string>' pnpm db:reset -- --seed
```

Then, in the dashboard:

- **Database → Backups → point-in-time recovery: on.** This holds every token
  and every published post.
- **Storage → create a bucket `halyard-assets`, public.** Public is deliberate:
  Meta cURLs media at publish time and a signed URL with a short expiry is the
  most common cause of an Instagram container that never finishes.

Then prove it rather than assume it:

```bash
DATABASE_URL='<hosted>' pnpm exec tsx scripts/verify-hosted.ts
```

That checks RLS is not only enabled but **forced** — without `FORCE`, the owning
role bypasses every policy, and the owning role is exactly what a misconfigured
connection string uses. It then assumes a non-admin role and confirms every table
reads as empty.

## 2. Web app

```bash
vercel link
vercel env add TOKEN_ENCRYPTION_KEY production   # openssl rand -base64 32
vercel env add DATABASE_URL production
vercel env add CRON_SECRET production            # openssl rand -hex 32
vercel --prod
```

`apps/web/vercel.json` already declares the three crons that need this tier's
environment. Everything else recurring is scheduled by the worker itself, so it
keeps working regardless of host.

**Do not set `HALYARD_DEV_UNAUTHENTICATED` in production.** It disables
authentication entirely; `/settings/readiness` fails the deploy loudly if it is
present.

## 3. Worker

```bash
railway init
railway up            # builds apps/worker/Dockerfile
```

Set the same `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY`, plus whatever platform
credentials exist. Restart policy: **on failure**, not always — a worker that
crash-loops on a bad migration should stay down and be visible rather than
hammering the database.

The heartbeat appears on `/settings/health` within 60 seconds. If it does not,
nothing generates, renders, publishes or collects.

---

## Every secret, and where it lives

| Variable | Where | Needed for | Rotate by |
|---|---|---|---|
| `DATABASE_URL` | Vercel + Railway | Everything | Supabase → Database → reset password, then update both hosts |
| `TOKEN_ENCRYPTION_KEY` | Vercel + Railway | Sealing platform tokens | **Cannot be rotated in place** — every stored token becomes unreadable. Rotating means reconnecting every account |
| `CRON_SECRET` | Vercel | Authenticating `/api/cron` | Generate a new one, update Vercel. Crons fail closed until it matches |
| `ANTHROPIC_API_KEY` | Vercel + Railway | Generation, co-pilot, the daily take | console.anthropic.com |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | Vercel + Railway | X OAuth and publishing | developer.x.com → Keys and tokens → regenerate |
| `META_APP_ID` / `META_APP_SECRET` | Vercel + Railway | Instagram and Threads | developers.facebook.com → Settings → Basic |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Vercel + Railway | YouTube | console.cloud.google.com → Credentials |
| `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET` | Vercel + Railway | Pinterest | developers.pinterest.com |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Vercel + Railway | TikTok | developers.tiktok.com |
| `RECIPEFIX_MCP_URL` / `RECIPEFIX_MCP_TOKEN` | Vercel + Railway | Live product output | The RecipeFix deployment |
| `RESEND_API_KEY` | Railway | Newsletter | The Resend account RecipeFix already uses — **do not create a second one**, a new sending domain starts with no reputation |
| `NEWSLETTER_FROM` | Railway | Newsletter | Must be on a verified Resend domain |
| `APP_STORE_KEY_ID` / `APP_STORE_ISSUER_ID` / `APP_STORE_PRIVATE_KEY` / `APP_STORE_APP_ID` | Railway | App Store attribution and reviews | App Store Connect → Integrations → Keys. **The .p8 downloads once and never again** |
| `ELEVENLABS_API_KEY` | Railway | Voiceover | elevenlabs.io |
| `SENTRY_DSN` | Vercel + Railway | Error reporting | sentry.io → Settings → Client Keys |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Railway | Uploading rendered media | Supabase → Settings → API |
| `BLOTATO_API_KEY` | Vercel + Railway | The unified transport, if you use it | my.blotato.com → Settings → API. Optional: without it every account stays on its own adapter |
| `PUBLIC_APP_URL` | Vercel | The link-in-bio URL in `/setup-kit` | Only needed where the request host is not trustworthy. Derived from the request first, and never falls back to localhost |

**`TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` already exist locally.** They were
generated with `openssl rand -base64 32`
and `openssl rand -hex 32` and written to `apps/web/.env.local` and
`apps/worker/.env`, both gitignored. The encryption key is identical in both,
which it must be: a token sealed by the web app is opened by the worker.

They were generated rather than handed over on purpose — a secret is safest when
no person has ever seen it.

To put the same key in production without it passing through a person:

```bash
grep '^TOKEN_ENCRYPTION_KEY=' apps/web/.env.local | cut -d= -f2- | vercel env add TOKEN_ENCRYPTION_KEY production
grep '^TOKEN_ENCRYPTION_KEY=' apps/web/.env.local | cut -d= -f2- | railway variables set TOKEN_ENCRYPTION_KEY
```

Or generate a fresh one for production, which is cleaner — nothing is sealed with
the local key yet, so there is nothing to migrate.

`APP_STORE_PRIVATE_KEY` is a PEM. Environment variables flatten newlines, so it
is stored with `\n` escapes and unflattened on read — a PEM without newlines is
not a PEM, and the resulting 401 says nothing useful.

---

## Supabase Auth, which does not work out of the box

A new Supabase project ships with `site_url = http://localhost:3000` and an
**empty redirect allow-list**. That combination fails in the least helpful way
available: `signInWithOtp` succeeds, the mail arrives, and the link in it points
at localhost — because when a requested redirect is not on the allow-list,
Supabase silently substitutes the site URL rather than refusing.

Nothing in the app can detect this. It is a project setting.

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://halyard-ten.vercel.app",
    "uri_allow_list": "https://halyard-ten.vercel.app/api/auth/callback,https://halyard-ten.vercel.app/**,http://localhost:3200/api/auth/callback,http://localhost:3200/**"
  }'
```

**Change the deployment URL and this has to change with it**, or sign-in breaks
in exactly the same silent way.

The callback accepts both `?code=` (PKCE) and `?token_hash=&type=` because a
magic link is usually opened in a different browser from the one that asked for
it — Gmail's webview, or a phone. PKCE needs a verifier that only the requesting
browser has, and its failure message mentions a "code verifier", which means
nothing to anybody.

## Configuring a fresh production database

Migrations and `seed.sql` give a working schema and sensible defaults. They do
not give it *your* product. This is the sequence that takes a fresh deployment
from empty to ready, and it is written down because it was performed once by
hand and would otherwise be archaeology.

Point `DATABASE_URL` at production for each of these. The pooler URL, not the
direct host.

```bash
# 1. The brief. Nothing generates without it — the copywriter would invent the
#    product rather than describe it, which is the one failure mode the whole
#    system exists to avoid.
DATABASE_URL="$PROD" pnpm load-brief --from ../recipe-fix/RecipeFix_OVERVIEW.md

# 2. Pinterest boards, if Pinterest is in the mix. A pin cannot be drafted
#    without one, and the failure is caught at draft time rather than publish.
DATABASE_URL="$PROD" pnpm pinterest-boards --default "Ingredient Substitutions"

# 3. Provider capabilities, if the unified transport is in use. This is a record
#    of what was *observed*, so it can be copied between environments — the
#    TikTok result is a fact about Blotato's app, not about your database.
```

Accounts are inserted as **targets**, not connections: real handles and provider
account ids, `capability_state = 'pending_auth'`, no token, nothing confirmed.
That is the truthful state of a fresh deployment, and it keeps the
identity-confirmation gate meaningful — an account is not connected until you
have looked at whose account it is, in that environment.

### What is left for a person

Three of the four onboarding steps are judgement, not configuration, and cannot
be done on your behalf:

| Step | Why it needs you |
|---|---|
| Ingest the brief | **Done by step 1 above.** |
| Voice bootstrap | Eight questions about how you write. Seeded voices exist, but they are a starting position, not your voice |
| Calibration batch | Twenty drafts, approved or rejected with a reason. Those reasons become the negative examples the copywriter is held to |
| Template preview | Which templates look like your product |

Then connect the accounts on `/accounts`, each in a private window.

## What version is live

`/settings/health` shows the commit, the build time and the branch. They are
baked in at build time, so they cannot drift from what is actually running.

The product this system markets ran sixteen days out of sync with its own
repository because nothing anywhere surfaced that. This is the fix.

## The worker deploys by upload, not by push (§506)

Railway is **not** connected to GitHub for this project. `git push` deploys the
web app on Vercel and does nothing to the worker; `railway redeploy` rebuilds
whatever was last uploaded, which is how production ran 30 August's code for
three days while every push looked successful. The worker ships with:

```bash
railway up --detach          # uploads this directory and builds the Dockerfile
railway logs                 # it should be polling within a minute
```

`.railwayignore` and `.dockerignore` both exist and must stay in step: without
them the upload is 1.8 GB and Cloudflare refuses it with a 413, and the image
carries `apps/worker/.env` in a layer.

## Rolling back

```bash
vercel rollback                      # web, instant
railway rollback                     # worker
```

The database does not roll back with them. Migrations are additive — every one
in `supabase/migrations` adds columns and tables rather than dropping them — so
an older build runs against a newer schema safely. The reverse is not true:
never deploy a build that expects a migration you have not applied.

For data, Supabase point-in-time recovery is the answer, and it is why it must
be switched on before anything real is stored.

## After every deploy

```bash
DATABASE_URL='<hosted>' pnpm exec tsx scripts/verify-hosted.ts --cron https://<your-app>
```

Then open `/settings/readiness` and read it. It is the difference between "it
built" and "it works".

## The Root Directory (2 September 2026, §495)

Vercel's project setting **Root Directory must be `apps/web`**. Left at `.`
every deploy fails with *"No Next.js version detected"* — and a failed deploy
leaves the previous build serving, so the site looks fine and simply stops
receiving changes. It sat that way for two days.

Check it before blaming anything else:

```bash
cd apps/web && vercel project inspect web | grep -i "root directory"
vercel ls | head -3        # ● Error on the newest row means nothing shipped
```

## Production is behind again (2 September 2026)

Found from the live site, not the repo: every visit to `/gallery` on
halyard-ten.vercel.app returned *"Application error: a server-side
exception"*, and `vercel logs` said why:

```
error: column rr.treatment does not exist   (code 42703, digest 2141479183)
```

The deployed web build (31 August) reads `renders.treatment` (§394, migration
0071). Production's schema stops at 0070: `supabase db dump --linked` shows
`renders` without `treatment`, `assets` without `shot`/`subject`,
`content_items` without `caption_shape`, and no pin templates. The remote
migration history holds four consolidated stamps from 30 August and none of
the repo's numbered files, which is how the drift stayed invisible.

**And main is 84 commits ahead of origin.** Do not push it before the schema
is current — the rule above stands: never deploy a build that expects a
migration you have not applied.

### What to run, in order

1. Backup (a data dump was taken 2 September into the session scratchpad; take
   your own): `pg_dump "$DB" --no-owner --no-privileges -f backup.sql`.
2. Forward-fill the five files. All five are idempotent
   (`if not exists`, `on conflict do nothing`), so this is safe to repeat:

   ```bash
   DB='<production pooler URL>'
   for f in supabase/migrations/007[1-5]_*.sql; do
     psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -q -f "$f"
   done
   ```

   Or, to also fix the history so `supabase db push` works from now on:

   ```bash
   supabase migration repair --linked --status reverted 20260830123207 20260830123217 20260830123225 20260830123233
   supabase migration repair --linked --status applied $(seq -f "%04g" 1 70)
   supabase db push --linked        # applies 0071–0075 only
   ```

3. Verify: `curl -s -o /dev/null -w '%{http_code}' https://halyard-ten.vercel.app/gallery`
   is no longer 500, and `vercel logs halyard-ten.vercel.app --since 10m`
   shows no `42703`. **Done 2 September**: migrations 0071–0076 applied, the
   Root Directory corrected, redeployed, `/gallery` 200.
4. Then `git push origin main`, and after the deploy run
   `scripts/verify-hosted.ts` as *After every deploy* says. The worker on
   Railway needs `PEXELS_API_KEY` if footage is wanted (§478); everything else
   new is optional.

Why this could not be done from the agent session: every step in 2 is a
write to the production database, and the session's permission mode gates
those. That is the right gate — this database holds the OAuth tokens for
six accounts.

## Bringing production current (22 August 2026)

Production had drifted a long way behind the repository: the web build was four
days old, the worker eight, and the database predated **P0 and P1 entirely** —
no `agent_runs`, no `product_facts`, no `product_evidence`.

### The migration set is not replayable in order

Production was not built by running `supabase/migrations/*.sql` start to finish,
and running them that way now fails. Migration 0021 rewrites `jobs_kind_check`
with the list of job kinds that existed *then*, and production's `jobs` table
already holds newer kinds (`verify_feature`, `collect_watch_terms`,
`draft_newsletter`), so the constraint is "violated by some row". Production was
**ahead** of that migration, not behind it.

65 of the `create table` statements and 73 of the `add column` statements carry
no `if not exists`, so the set is not idempotent either.

What works is a **forward fill**: apply each file from 0025 onward inside its own
transaction, treat `already exists` as "this one is present", and stop on
anything else. DDL is transactional in Postgres, so a file either lands whole or
not at all.

```bash
DB='<production pooler URL>'
for f in supabase/migrations/*.sql; do
  psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -q -f "$f"
done
```

Take a dump first — `pg_dump "$DB" --no-owner --no-privileges -f backup.sql`.
Production is ~21 MB and holds the OAuth tokens for six brand accounts; losing
it means reconnecting every platform by hand.

**Never `pnpm db:reset -- --fresh` against production.** The script refuses a
non-local URL for `--fresh`, and that refusal is the only thing between a typo
and the token store.

### Storage had no bucket

`ASSET_BUCKET` is `halyard-assets` and the project had no buckets at all, so
every render would have fallen back to "storage not configured, recording asset
without upload". Created public, because Meta cURLs the asset at publish time
and a signed short-lived URL fails.

### Environment drift was the bigger problem

The deployed worker had 8 variables and the current code needs far more. It was
missing `ANTHROPIC_API_KEY` — every agent moved to Anthropic in §141, so the
worker could not generate anything at all — plus ElevenLabs, the RecipeFix MCP
pair, `HALYARD_PUBLIC_URL` (§111 turns its absence into a permanent job failure
in production) and `X_CLIENT_ID`/`X_CLIENT_SECRET`, without which X token refresh
dies silently after two hours (gotcha 4).

The web was missing `ANTHROPIC_API_KEY`, both public-origin variables and every
OAuth client credential. It had `PUBLIC_APP_URL`, which no code reads.

### Which secrets belong where

| | Web (Vercel) | Worker (Railway) |
|---|---|---|
| Supabase URL / anon / service role | ✓ | ✓ (service role only) |
| `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` | ✓ | ✓ |
| `CRON_SECRET` | ✓ | — |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | ✓ | ✓ |
| ElevenLabs, RecipeFix MCP, whisper model | — | ✓ |
| OAuth client id/secret per platform | ✓ (authorise + callback) | ✓ (token refresh only) |
| `HALYARD_PUBLIC_URL`, `OAUTH_REDIRECT_BASE_URL` | ✓ | `HALYARD_PUBLIC_URL` only |

### Verified live afterwards

Worker claimed jobs as `worker-1` and ran `collect_product_evidence` →
`build_product_brain` end to end against real providers: 11 evidence rows across
four sources including **13 tools read from the live RecipeFix MCP**, 36 facts,
three `agent_runs` totalling $0.29. All three Vercel crons answered 200. The
legal pages went from 404 to 200, which is the simplest proof the new build is
actually serving.

Production remains safe by default: `publishing_enabled` is **false** and the
onboarding wizard is incomplete, so nothing generates or publishes on its own.
