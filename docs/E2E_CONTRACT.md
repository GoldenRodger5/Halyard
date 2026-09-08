# The end-to-end contract

What the E2E suite is for, what each historical spec became, and why.

## Why this document exists

The studio reorganisation renamed every screen and rewrote most of the copy on
them. The E2E suite was not moved with it, so **58 route references pointed at
pages the app no longer serves**. From outside that never looked like a wrong
URL: each test waited ten seconds for a heading sitting on a 404, then timed out
at sixty, on a CI job whose ceiling is twenty minutes. The suite never finished,
and the reason never appeared. §568, §572.

Repointing the URLs was necessary and nowhere near sufficient — the specs also
asserted paragraphs that no longer exist anywhere in the product. So each
meaningful assertion was classified rather than mechanically translated.

## What an E2E test here is allowed to assert

E2E is the only layer that can prove *the operator can actually get there and
do it*. It is a bad place to prove anything else — 3,900 unit and integration
tests already cover the logic, faster and with better failure messages.

**Assert:** a landmark or heading exists · a state is what it should be · an
action is offered (or refused) · identity is right (this account, this item) ·
navigation succeeds · a failure is explained · persisted state changed · a
forbidden action is unavailable.

**Do not assert:** exact marketing prose, unless the wording is itself the
contract (the legal pages, where a phrasing is a compliance claim) · anything a
unit test proves better · implementation detail dressed as a user-visible fact.

**Selectors:** roles, accessible names, and real hrefs first. A `data-testid`
only where no accessible name can distinguish two things — and then it is a
contract, named as one. Where an id was needed for identity rather than
testing, it is a real product affordance: `#<persona>-<platform>` on a
connections card is a fragment link target as much as a selector (§571).

## Route map applied

| Was | Is |
|---|---|
| `/agents`, `/agents/runs`, `/agents/versions` | `/master/crew`, `/master/crew/runs`, `/master/crew/versions` |
| `/brain`, `/brain/*` | `/master/product`, `/master/product/*` |
| `/system`, `/system/{audit,integrations,jobs}` | `/master/system`, `/master/system/*` |
| `/settings` · `/settings/pronunciation` | `/master/system` · `/master/system/pronunciation` |
| `/queue`, `/queue/:id` | `/gallery`, `/gallery/:id` |
| `/inbox` · `/take` · `/finds` | `/wires` · `/wires/take` · `/wires/finds` |
| `/campaigns` · `/launch` · `/calendar` | `/rundown/campaigns` · `/rundown/launch` · `/rundown` |
| `/analytics` · `/first-30-days` | `/numbers` · `/numbers/learned` |
| `/compose` · `/swipe` | `/floor/chat` · `/floor/sources` |
| `/setup-kit` · `/templates` · `/products/new` | `/master/setup-kit` · `/master/templates` · `/master/product/new` |
| `/submissions` | `/gallery/stock/submissions` |

`/accounts` and `/connections` are **not** in this table: they are real product
redirects to `/master` (§497) and stay.

## The preflight

`e2e/preflight.setup.ts` is a project dependency, so it runs before any browser
opens and, when it fails, the rest are skipped — the job then finishes in under
a second naming every dead route instead of timing out saying nothing.

Its contract: **no spec may name an application path the app does not serve.**
It reads every path-shaped string literal, quoted or templated, not only the
arguments to `page.goto` — the first version looked only at single-quoted goto
arguments and reported 35 dead routes when there were 58. A check that finds
most of a problem reports the problem as smaller than it is.

It must not be weakened, skipped, or satisfied by adding a redirect that the
product does not otherwise want.

## The inventory

Every spec, and what happened to it. "REWRITE" means the behaviour still
matters and the screen changed; "RETIRE" means there is no longer a user path
to walk.

| Spec | Verdict | What changed |
|---|---|---|
| `accessibility` | REWRITE | Route list repointed. Then it found two real defects — see below. |
| `accounts` | REWRITE | Asserted two handles that exist in one developer's database; now reads the accounts out of the fixtures. |
| `agents` | REWRITE | `/agents` → `/master/crew`. No "Agents" or "Teams" heading any more; the room states its own count and groups by team. Version pin `copywriter.v1` → any declared version. |
| `brain` | REWRITE | `/brain` → `/master/product`; empty-state wording. |
| `campaigns` | REWRITE | `createCampaign` is **orphaned**, so the campaign is seeded and the planner — which is wired — is still tested. |
| `capability` | REWRITE | The capability panel moved from the connections card to `/master/platforms`. |
| `cold-start` | REWRITE + RETIRE | Numbers and Learned reworded; the best-posting-time panel no longer exists (retired, still covered by scheduling unit tests). |
| `compose` | REWRITE | The saved-conversations list is gone, so the disclaimer is too. Now asserts the rule: nothing may imply a conversation was saved. |
| `daily-path` | REWRITE + RETIRE | Rewritten wholesale against the Gallery: decisions moved from list cards to the piece. Inline edit retired (**orphaned** `editItem`). |
| `delivery` | REWRITE + RETIRE | Lifecycle tabs → filters plus rooms. "Held in Halyard" is computed and deliberately not rendered (retired). Edit retired. |
| `launch` | REWRITE + RETIRE | Polls the staged rows rather than a sentence the page no longer prints. Discard retired (**orphaned** `discardLaunchBatch`). Found §574. |
| `legal` | KEEP | Passed throughout. The one place exact wording *is* the contract. |
| `manual-publish` | REWRITE + RETIRE | "Post it now" retired (**orphaned** `publishNow`); the hand-over half rewritten against the current panel. |
| `mobile` | KEEP | Already on current routes. |
| `oauth-connect` | REWRITE | Card ids restored (§571); the "no developer app" set is derived from the page instead of hard-coded; the registration check no longer needs a configured platform. |
| `pronunciation` | REWRITE | Route only. |
| `queue` | RETIRE | Its single test needed the inline editor (**orphaned** `editItem`). |
| `recordings/tiktok-demo` | RETIRE from the default run | A demo script with its own config; `testIgnore` now keeps it out. |
| `router` | REWRITE | The destination panel was gone; §575 restored it from data already fetched. |
| `safety` | REWRITE | Kill-switch wording, the Daily Take composer (two steps → one required input), the no-auto-reply rule, the first-run gate, and TikTok constraints (moved to System ▸ Integrations). |
| `setup-kit` | REWRITE | Route only. |
| `take` | RETIRE | **Orphaned** `approveTake` and `discardTake` — a drafted take has no controls. |
| `unsubscribe` | KEEP | Passed throughout. |
| `visual` | KEEP | Opt-in (`HALYARD_VISUAL=1`), routes already current. |
| `watch` | RETIRE (terms) | **Orphaned** `addWatchTerm`, `setWatchTermEnabled`, `collectWatchTermsNow` — watch terms have no screen. |
| `webhooks` | KEEP | API-level; never touched the UI. |

## Orphaned server actions found on the way

Written, exported, and reachable from no control in the app. Each is a feature
an operator cannot use, and each was invisible because the test that would have
pressed the button was failing on a route that had moved.

- `editItem` — inline copy edit, and with it §157's rule that an edit
  un-verifies the claims gate. **The most important one to restore.**
- `publishNow` — send an approved post now rather than at its slot.
- `discardLaunchBatch` — throw away a staged opening run.
- `createCampaign` — there is no way to create a campaign.
- `approveTake`, `discardTake` — a drafted Daily Take can be neither queued nor
  thrown away.
- `addWatchTerm`, `setWatchTermEnabled`, `collectWatchTermsNow` — Finds explains
  that it needs a watch term and offers no way to set one.

Two more were not orphaned but broken, and are fixed here: every "Ask for a
change" button (§573) and the whole launch batch (§574).

## What is still not covered

Named rather than left to be discovered:

- **Auth** — the E2E bypass is exercised by every run (it is how the suite gets
  in) and `devBypass.test.ts` proves it is refused when `NODE_ENV=production`.
  There is no test of a real sign-in, because there is no seeded operator.
- **Approve → publish** — deliberately. Publishing is off, and no E2E test may
  turn it on.
- The retired behaviours above, until their controls come back.
