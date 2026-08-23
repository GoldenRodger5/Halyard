# Visual baselines — what exists, and what it is worth

**Status: three pages captured from a production build. Two of the three
original objections are resolved; one operator review remains.**

`e2e/visual.spec.ts` holds six images — three pages at two widths. They were
captured on 2026-08-19 from `next build && next start`, not from the dev server.

A baseline records what a page looked like when it was taken; it does not record
that the page looked *right*. **Three pages need a human to look at them once**
and say they are correct. After that, the suite is fully automated: it detects
any change to those pages and needs no further judgement.

| Baseline | Needs operator approval | Why |
|---|---|---|
| `/privacy` | **yes, once** | Nobody has confirmed the rendered layout is what should be shown to a Meta reviewer. |
| `/terms` | **yes, once** | Same. |
| `/data-deletion` | **yes, once** | Same, and it is the page reviewers read most closely. |

The two widths per page are mechanical — approving the page approves both.

## Why this is opt-in

Playwright writes a missing baseline and reports a **pass**. That is the exact
failure this codebase keeps finding: a green result for a check that never ran.
So the suite is gated behind `HALYARD_VISUAL=1`, does not run in the default
suite, and a missing baseline **throws** rather than being created quietly.

```bash
# compare against the baselines (dev server is fine for comparison)
HALYARD_VISUAL=1 pnpm exec playwright test e2e/visual.spec.ts

# regenerate — only from a production build, and only after deciding the
# current appearance is correct
pnpm --filter @halyard/web build
pnpm --filter @halyard/web start &
HALYARD_URL=http://localhost:3200 HALYARD_VISUAL=1 HALYARD_VISUAL_WRITE=1 \
  pnpm exec playwright test e2e/visual.spec.ts --update-snapshots
```

Writing without `HALYARD_URL` is refused. The first set of baselines was
captured against `next dev` and every image contained the framework's floating
dev indicator — a control that does not exist in what ships. That is now
impossible rather than merely discouraged.

## What is covered, and why so little

| Page | Widths | Why it qualifies |
|---|---|---|
| `/privacy` | 1440, 390 | Static prose. No dates, counts or provider data — checked, not assumed. |
| `/terms` | 1440, 390 | Same. |
| `/data-deletion` | 1440, 390 | Same, and the page a Meta reviewer reads most closely. |

Everything else needs seeded fixtures and a frozen clock: the Daily Take renders
live Hacker News stories, the sidebar carries a badge count, sources say "polled
20h ago", queue cards carry ids and timestamps. A snapshot suite that fails for
those reasons is one people learn to ignore.

`/signin` was captured, opened, and **removed**. The image had recorded
"Supabase Auth is not configured on this deployment" — a fact about the laptop
it was taken on, not about the page, and one that would fail on any deployment
with credentials.

## Remaining limitation

**They are platform-specific.** Playwright names them `…-desktop-darwin.png`.
Font rendering differs on Linux, so a Linux CI would need its own set
regenerated there by the same procedure. This is a property of pixel comparison
rather than a defect in these images.
