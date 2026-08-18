# Operating Halyard

How to run this thing day to day, what breaks, and what to do about it.

The one sentence that governs everything: **Halyard is autonomous up to the point
of publication, and never past it.** Nothing goes out without you clicking a
specific thing about a specific post. There is no timer, no threshold, no
confidence score, and no "approve all" that quietly extends to tomorrow.

---

## The daily loop

Ten minutes, most days.

1. **`/` — the dashboard.** What is waiting, what failed, whether the worker is
   alive. If a pattern has emerged in what you reject, it appears here with a
   proposed rule.
2. **`/queue` — approve or reject.** Everything here has already passed four
   gates; anything that failed one never arrived. Rejecting with a reason is
   worth more than rejecting silently — it is the input that makes your taste
   legible.
3. **`/take` — the daily take.** This is the only input-gated workflow. The
   system asks a narrow question about a story and you answer in a sentence; it
   does the rest. Skip a day and no opinion content goes out. That is correct.
4. **`/inbox` — comments.** Halyard drafts replies. You send them. There is no
   `reply()` method on any adapter and a test asserts its absence.

Everything else is weekly at most.

## Signing in

https://halyard-ten.vercel.app — a magic link by email. The address behind it
must appear in `admin_users`; **the first person to sign in claims an empty
instance**, so do that before anything else and before sharing the URL.

`/l/recipefix` and `/r/<id>` are public on purpose — the link-in-bio page and
the click router. Everything else redirects to sign-in.

## Starting and stopping

```bash
./scripts/halyard              # postgres, database, env repair, dev server, browser
./scripts/halyard --reset      # wipe and reseed first
./scripts/halyard --stop       # stop the dev server and postgres
./scripts/doctor               # what is wrong, and the exact command to fix it
```

The worker is separate and owns anything measured in minutes — generation,
rendering, publishing, metrics, captures:

```bash
docker build -t halyard-worker apps/worker
docker run -d --name halyard-worker --env-file apps/worker/.env halyard-worker
docker logs -f halyard-worker
```

The web app runs fine without it. Nothing generates, renders or publishes.

## The screens, and what each is actually for

| Screen | What it answers |
|---|---|
| `/` | What needs me right now |
| `/queue` | What is waiting for approval |
| `/take` | What do I think about today's news |
| `/compose` | I have a specific idea and want to work it out loud |
| `/inbox` | Who is talking to us |
| `/calendar` | What is scheduled and when |
| `/ideas` | What the engine wants to make next, and why it ranked them that way |
| `/hooks` | Whether the hook system is actually learning |
| `/series` | Which numbered promises have stalled |
| `/social-proof` | What real people have said, and what can be quoted |
| `/swipe`, `/finds` | Reference material and things worth stealing from |
| `/assets` | Captures of the live product, and whether they have gone stale |
| `/campaigns` | Launches, where the normal mix is deliberately wrong |
| `/analytics` | Conversion by category — the chart that decides strategy |
| `/accounts` | Which platforms can publish, and why the rest cannot |
| `/submissions` | Where each platform review stands, with dates |
| `/settings/health` | The four things that fail silently |
| `/settings/readiness` | Can this run unattended tomorrow |
| `/setup-kit` | Everything needed to create the accounts: bios, images, checklists |
| `/brain` | What Halyard knows about the product, and what each thing rests on |
| `/accounts` → Platform capability | What each platform can actually do, how Halyard knows, and when it last checked |
| `/launch` | Generate and review a fortnight in one pass |
| `/first-30-days` | What to expect, and which of the things that look broken are not |

Pinterest boards are synced with `pnpm pinterest-boards`. A pin is routed to a
board from its dietary signals at draft time, so a post that cannot be filed is
refused before it reaches the queue rather than failing at its slot. See
`docs/TRANSPORT_DEFAULTS.md` for which transport each platform should use and
why two of them are deliberately on the harder path.

## What is deliberately not automated

Fixed, and enforced in code rather than by policy:

- Publishing without approval
- Replying to comments or DMs — Halyard drafts, you send
- Following, unfollowing, or any engagement action
- Generating an opinion you did not express
- Posting anything with an unverified factual claim
- Quoting a testimonial that does not resolve to a stored row
- Anything that inflates a metric

## When something breaks

**Nothing is generating.** Check `/settings/readiness` → Calibration. Generation
refuses to run until the first-run wizard is complete, on purpose: an
uncalibrated voice produces competent, generic content, which is the failure this
system is most at risk of.

**Nothing is publishing.** In order: is the kill switch on (`/settings`), is the
worker alive (`/settings/health`), is the account live rather than draft-only
(`/accounts`). Draft-only is not a bug — every platform except X and Bluesky
gates public posting behind a review measured in weeks. `/submissions` tracks
those with dates.

**A publish failed with an auth error.** The account is marked and its queued
items are held, rather than being burned one by one against a dead credential.
Reconnect on `/accounts`. Halyard already tried refreshing the token once
mid-publish before giving up.

**A post may have gone out twice.** It did not. Three layers prevent it: a
pre-flight check, a claim row inserted before the network call and protected by a
unique index, and a rule that a malformed response is never retried. If a
publication row shows `needs_reconciliation`, the post may be live with an
unknown id — check the account and reconcile by hand. Nothing will retry it.

**A capture recorded nothing useful.** Flows verify against the live site before
recording, so a broken selector stops the capture rather than producing footage
of an error state. `/settings/health` shows which flow broke and at which step,
with a screenshot of what the page actually looked like. Fix the selector in
`packages/core/src/capture/flows.ts` and re-run from `/assets`.

**The analytics are all zeroes.** Expected until RecipeFix captures UTM
parameters. Halyard stamps every link and logs every routed click; recording what
the link carried on landing is the other half of the chain and lives in the
RecipeFix repo. `/settings/readiness` → Attribution says so explicitly.

**A screen is empty that should not be.** Check whether the seed ran:
`psql -d halyard -c 'select count(*) from format_cadence'`. Migrations run before
`seed.sql`, so anything product-scoped belongs in the seed — see DECISIONS §25.

## Costs

| What | Cost |
|---|---|
| An X post without a link | ~$0.015 |
| An X post with a link in the body | ~$0.20 — which is why the link goes in the first reply |
| Reading your own post's metrics | ~$0.001 |
| Reading a third-party post | ~$0.005 — which is why there is no conversation discovery anywhere |
| A RecipeFix adaptation | one credit, ~26 seconds |
| A generation run | a few cents of model time |

The adaptation rate limit is twenty an hour and it is a hard stop, not a warning.
It is a spend ceiling rather than a throughput one.

## Before any of this: creating the accounts

Once, at the start, and in this order.

1. **Deploy first.** `/setup-kit` needs a public origin, because the link-in-bio
   URL goes into every profile and a bio pointing at `localhost` is worse than a
   bio with no link. The kit says so rather than handing you a broken URL.
2. **`pnpm check-handle <name>`** — or the same check on `/setup-kit`. Only
   Bluesky can be answered definitively. X and TikTok cannot be checked without
   logging in and say `unknown`, which is not the same as free.
3. **`/setup-kit` → Generate → Download everything.** A folder of correctly sized
   images and one text file with every bio, display name, pinned post and
   per-platform checklist.
4. **Create the profiles in the order the page lists them.** Instagram first:
   Threads inherits its handle and cannot be renamed afterwards.
5. **Mind the `[!]` items.** An Instagram Creator account cannot be published to
   by any API however approved the app is, and fixing it later usually means
   creating the account again.
6. **`/accounts` → Connect**, each in a private window, then confirm each
   identity. A token is not an account until you have looked at whose it is.

## The first two weeks

`/launch` plans a fortnight across every connected account in one pass: an
introduction post per account on day one, then regular posts respecting mix
targets, per-format weekly cadence ceilings and every spacing rule. The preview
is computed from exactly the inputs the commit uses, so what you see is what gets
staged — including what could not be placed, which is listed with the reason
rather than dropped quietly.

Staging is separate from writing. Rows appear on the calendar immediately, then
one generation job runs per slot, so a failure costs one post rather than the
batch. Re-running replaces only slots nobody has edited.

## Going live on a platform

X and Bluesky can be live today; nothing else can. For X:

```bash
./scripts/doctor          # prints the full credential acquisition sequence
pnpm first-contact        # dry run — the exact request, sent nowhere
pnpm first-contact --publish
pnpm first-contact --verify
```

`--publish` is the only destructive command here. It asks for the account handle
and then the word `PUBLISH`, and it runs the same code path the worker runs.

Record every surprise in `docs/FIRST_CONTACT.md`. That file is the debugging map
for the other six adapters.

## Adding a second product

`/products/new`, five steps, about five minutes. Every connector type works,
including `none` — a product with no API is fully supported, and the idea engine
routes around the missing sample rather than failing.

Brand accounts are scoped to the product and cannot post for another one; the
database refuses the row rather than trusting the code to check. The founder
account is one identity shared across every product.

## The files worth knowing

| Path | What lives there |
|---|---|
| `docs/DECISIONS.md` | Every non-obvious choice, and why |
| `docs/FIRST_CONTACT.md` | What differs between the contract tests and reality |
| `docs/REVIEW_SUBMISSIONS.md` | What each platform review asks for |
| `packages/core/src/capture/flows.ts` | The selectors the capture flows depend on |
| `apps/worker/src/scheduler.ts` | Everything periodic, and why each cadence |
| `supabase/seed.sql` | What a fresh database needs |

## Verification

```bash
pnpm typecheck && pnpm lint
pnpm exec vitest run          # unit and integration
pnpm test:e2e                 # needs a running app
pnpm verify-flows             # needs the live product
npx tsx scripts/screenshot.ts # every screen, desktop and mobile
```
