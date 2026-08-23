# Product UX and Information Architecture

**Status:** navigation foundation shipped (§172). Screen-level work sequenced below, not yet built.
**Rule for this document:** it describes what is true. Where something is designed but not built, it says so.

---

## A. The IA we had

Twenty-nine sidebar links in three groups — *Today*, *Plan*, *Configure* — over 47 routes.

The grouping named Halyard's internals rather than the operator's questions. *Swipe file*, *Hooks*, *Series*,
*Social proof*, *Finds*, *Readiness*, *Pronunciation*, *Agents*, *System* are each a real capability, and not one
of them is a thing a person arrives wanting. The list had no ceiling, so every feature added a row, and the
sidebar became a table of contents for the codebase.

Three failures were reported from a real session, and all three were **reachability**, not missing capability:

| Reported | Actual cause |
|---|---|
| "switching between accounts… it doesn't let me switch" | The chip wrote `?product=<id>`; the layout called `getCurrentProduct()` with **no argument**. A parameter with no supplier. |
| "for connecting accounts i try to click on them and nothing happens" | Dashboard account rows were plain `<div>`s. They reported `NOT CONNECTED` and linked nowhere. |
| "where option to view apps and add them and configure them" | `/products`, `/products/new`, `/products/[id]` all existed — filed under *Plan*, never referenced from the product switcher the operator was clicking. |

The through-line: **capability is not reachability.** Every one of these features worked. None could be found
or operated from where the operator was standing.

## B. The IA we have

Seven primary destinations, each the answer to one question:

| Destination | Question |
|---|---|
| Home | what needs me? |
| Create | what do I want to publish? |
| Content | what am I working on? |
| Calendar | what goes out, and when? |
| Inbox | who needs a reply? |
| Analytics | how is it doing? |
| Accounts | what is connected? |

Everything else sits under a collapsed **More**, grouped by purpose — Planning, Library, Your product, Advanced.
It is a native `<details>`, so the shell stays a server component and opens itself when the current page lives
inside it. Nothing is behind a search box or a memory test.

**Nothing was removed.** 29 destinations in, 29 out, asserted by test (§H).

## C. Feature preservation

| Was | Now |
|---|---|
| Today → Queue | **Content** (`/queue`) |
| Today → Calendar, Inbox, Compose | **Calendar**, **Inbox**, **Create** |
| Today → Take | More ▸ Planning ▸ Daily Take |
| Plan → Launch, Ideas, Hooks, Swipe, Series, Campaigns, Finds | More ▸ **Planning** |
| Plan → Library, Assets, Templates, Social proof, Submissions | More ▸ **Library** |
| Plan → Brain, Products, Setup kit, First 30 days | More ▸ **Your product** |
| Configure → Settings, Readiness, Pronunciation, Agents, System | More ▸ **Advanced** |
| Configure → Accounts, Analytics | **promoted to primary** |

The 18 routes never in the sidebar — `/queue/[id]`, `/brain/evidence`, `/agents/health`, `/system/jobs` and the
rest — are drill-downs reached from their parent screens. Each was verified to be referenced from at least one
other file; none is an orphan.

## D. Route migration

**No route changed.** All 47 URLs are byte-identical to before; only grouping and labels moved. Bookmarks,
deep links and E2E selectors keep working, and there is nothing to redirect.

One route was **added**: `GET /api/product` — sets the product cookie and redirects back. It exists because in
the App Router a **layout does not receive `searchParams`** (only pages do), and the switcher lives in the shell,
which the layout renders. The selection therefore has to live somewhere the layout can read, and that is a cookie.
The handler validates the id against the real product list and refuses off-origin `next` values.

## E. Principles

1. **One screen, one question.** A destination that answers two questions is two destinations.
2. **The row that reports a problem is the row that fixes it.** A status with no affordance is a dead end.
3. **Progressive disclosure, never feature removal.** Collapse; do not delete.
4. **Capability is not reachability.** "It exists" is not "it can be found."
5. **The platform before the framework.** `<details>` over `useState`; a link over a click handler. The shell
   renders on the server and should stay that way.
6. **Preservation is asserted, not remembered.** A promise about the navigation belongs in a test.

## F. Account connection — diagnosis

Investigated with real evidence. **Three of four are dashboard configuration, not code.**

| # | Symptom | Cause | Fix owner |
|---|---|---|---|
| A | `EMAXCONNSESSION` under load | Web tier on the **session-mode** pooler (`:5432`, one Postgres connection per client) with `max: 5` per lambda. Ceiling is `max × concurrent instances`. | Mitigated in code; cure is an operator change |
| B | X OAuth fails | Callback not registered for the deployed origin | Operator, X developer portal |
| C | Instagram "domain error" | App domain / redirect URI not matching the deployed origin | Operator, Meta dashboard |
| D | Threads authorize fails | Same shape as C | Operator, Meta dashboard |

**A — what was done.** `apps/web/src/lib/db.ts` now runs `max: 2` with idle and connection timeouts and
`allowExitOnIdle`. This is mitigation and the comment says so. The cure is moving the **web tier** to the
**transaction** pooler (port **6543**). Verified safe: the web tier contains no session-scoped SQL — no
`pg_advisory_lock`, no `SET`, no explicit `BEGIN`. The **worker must stay on session mode**, because §165's
correction claim uses `pg_try_advisory_lock` (`apps/worker/src/handlers/correct.ts:189`), which is
session-scoped and silently useless behind a transaction pooler. This is an operator action: Vercel returns
`DATABASE_URL` as `[SENSITIVE]`, so the new URL cannot be constructed here.

**B/C/D — what was done.** The exact authorize URLs were constructed and inspected. Redirect URIs, scopes and
PKCE parameters are all correct and correctly formed:

- X — `x.com/i/oauth2/authorize`, scopes `tweet.read tweet.write users.read offline.access`, `S256`
- Instagram — `www.facebook.com/dialog/oauth`, 7 scopes, no PKCE (correct for this flow)
- Threads — `threads.net/oauth/authorize`, 4 scopes

Each fails at the provider because the deployed origin is not registered in that provider's dashboard. No code
change would fix any of them, and none was made. Credentials were never printed and are not recorded here.

## G. Phases

- **Phase 1 — foundation. Done.** Seven-destination nav + More; product switcher repaired; account rows
  clickable; products reachable; `Card` gained an `id` for deep links; connection-pool mitigation.
- **Phase 2 — Home as a control center.** Today's decisions above the fold; account health already links out.
- **Phase 3 — Accounts simplification.** One card per platform, one obvious next action, advanced detail folded.
- **Phase 4 — Conventional auth.** Email/password alongside the current operator check.
- **Phase 5 — Setup checklist.** What is connected, what is missing, what to do next.
- **Phase 6 — Screen-level passes** on Create, Content, Calendar, Analytics, Inbox.

Phases 2–6 are designed, not built.

## H. Testing

`apps/web/src/components/navigation.test.ts` — five assertions:

1. every pre-§172 destination is still reachable (baseline **frozen**, not derived from the file under test —
   a baseline computed from the thing being tested agrees with any deletion)
2. no destination listed twice
3. the primary list stays scannable (≤ 9)
4. **every href resolves to a real `page.tsx`** — a typo'd link typechecks perfectly and 404s in production
5. the route tree is readable at all

Tamper-verified per §118: deleting a destination fails (1); mistyping `/social-proof` → `/social_proof` fails
both (1) and (4); restoring passes 5/5.

`next build` is part of verification, not `tsc` alone — it caught `PRODUCT_COOKIE` being exported from a route
handler, which typechecks cleanly and fails the production build with *"not a valid Route export field."*
The constant now lives in `apps/web/src/lib/product.ts`.

**Suite: 1524 passed, 399 skipped. Lint clean. Build clean. Nothing committed. `publishing_enabled` remains false.**
