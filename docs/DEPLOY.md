# Deploying Halyard

**Live:** https://halyard-ten.vercel.app — Supabase `halyard` (us-east-1),
Vercel `halyard`, Railway `halyard/worker`. Deployed 11 August 2026.

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

## What version is live

`/settings/health` shows the commit, the build time and the branch. They are
baked in at build time, so they cannot drift from what is actually running.

The product this system markets ran sixteen days out of sync with its own
repository because nothing anywhere surfaced that. This is the fix.

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
