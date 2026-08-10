---
name: halyard-dev
description: Start, stop, reset, or check the Halyard local development environment. Use whenever the user says "start halyard", "run halyard", "boot halyard", "stop halyard", "reset halyard", "reseed halyard", or asks why Halyard is not loading, why the database is empty, or why localhost:3200 is not responding. Also use when the user wants to check whether Postgres or the worker container is running.
---

# Halyard dev environment

One command brings up the whole local stack. Prefer the script over running steps by
hand, because it repairs the two things that break most often: a stopped Postgres and a
`DATABASE_URL` in `apps/web/.env.local` that points at a role which does not exist on this
machine.

## Start

```bash
./scripts/halyard
```

Starts Postgres if it is down, creates and seeds the database on first run, corrects
`DATABASE_URL` in `apps/web/.env.local`, frees port 3200, starts the dev server, and opens
Chrome once the server actually responds.

## Other commands

```bash
./scripts/halyard --reset    # wipe schema, re-run migrations, reseed, then start
./scripts/halyard --stop     # stop the dev server and Postgres
```

## Checking state without starting anything

```bash
pg_isready -h localhost -p 5432          # is Postgres up
lsof -ti :3200                            # is something on the dev port
psql -d halyard -c 'select count(*) from content_items;'   # is the DB seeded
docker ps --filter name=halyard-worker    # is the worker container running
```

## Worker container

The web app runs without the worker. Generation, rendering, publishing, and metrics
collection all need it.

```bash
docker build -t halyard-worker apps/worker
docker run -d --name halyard-worker --env-file apps/worker/.env halyard-worker
docker logs -f halyard-worker
```

If `docker` is not found, install OrbStack (`brew install orbstack`) rather than Docker
Desktop. It is lighter and faster on Apple silicon.

## Common failures

**`ECONNREFUSED ::1:5432`** — Postgres is not running. `brew services start postgresql@17`.

**`role "postgres" does not exist`** — Homebrew creates a superuser named after the macOS
account, not `postgres`. The script handles this; if running by hand, use
`postgres://$USER@localhost:5432/halyard`.

**Pages load but every screen is empty** — `DATABASE_URL` in `apps/web/.env.local` is
wrong or missing. A shell `export` does not reach Next.js; it reads its own env file.
Run `./scripts/halyard` to repair it, or check with
`grep DATABASE_URL apps/web/.env.local`.

**Screens render but nothing generates** — `ANTHROPIC_API_KEY` is unset, or the worker is
not running. The script prints which keys are missing on startup.

**`/analytics` shows zeroes** — expected until RecipeFix captures UTM parameters. That work
is in the RecipeFix repo, not this one. `attributionReadiness()` reports which half of the
chain is missing.

**Daily generation refuses to run** — the first-run wizard at `/onboarding` has not been
completed. This is deliberate. Generation against an empty brief produces generic copy.

## Verification suite

```bash
pnpm exec vitest run                      # unit + integration
pnpm test:e2e                             # Playwright, needs a running app
pnpm exec eslint .
pnpm --filter @halyard/web build
npx tsx scripts/screenshot.ts             # all screens, desktop + mobile
```
