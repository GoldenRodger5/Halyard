# The Studio — build plan

**Decision:** the console is replaced. Seven rooms, Halyard's own brand, the
studio floor. The old `(dashboard)` UI is deleted at the end of this, not kept.

**One app, two shapes.** The laptop and phone mockups are two views of the same
routes, not two applications. Every room is responsive; the phone differences —
the swipe deck, the bottom sheet, the now-bar, three tabs — are breakpoints and
component variants, never separate pages.

**Source of truth for the visual:** the two prototypes. Their CSS is the spec.
Where this plan and the prototype disagree, the prototype wins.

---

## 1. Why it is sequenced this way

The failure mode of a UI replacement is a half-migrated app where nobody can
tell which half is broken. Two properties prevent that here:

**The rooms are renamed, so nothing collides.** `/queue` becomes `/gallery`,
`/make` becomes `/floor`, `/calendar` becomes `/rundown`. New paths mean the new
group can be built beside the old one with no route conflicts and no flags — and
the old app keeps working, unchanged, the whole time.

**The data layer does not move.** Every room imports the same `@/lib/queries`
and the same 82 server actions. This is a re-skin over a working spine, and any
room that needs new data says so explicitly in §4 rather than quietly forking a
query.

The one collision is `/`. Call Sheet is built at `/call` and moves to `/` in the
deletion commit.

---

## 2. Where code lives

```
packages/ui/src/studio/        design-system primitives — Tally, Pill, Card,
                               Button, Slate, Lamp. Shared, tested, no data.
apps/web/src/components/studio/  composites — MonitorWall, ProgramMonitor,
                               RouteMap, DeskPod, SpeechBubble, LiveRail,
                               BriefPanel, SwipeDeck, BottomSheet, NowBar.
apps/web/src/app/(studio)/     the seven rooms.
```

**Rules that keep it clean.**

- A component that renders data takes it as props. Nothing in `components/`
  queries; pages query and pass down.
- No query is written twice. If a room needs something new it goes in
  `@/lib/queries` beside the rest, named for what it answers.
- Every primitive with a decision in it gets a test. `Tally` mapping a status to
  a lamp is a decision; a `Card` wrapper is not.
- One commit per room. A room lands complete — route, components, tests,
  responsive — or it does not land.

---

## 3. Order

| # | Step | Why here |
|---|---|---|
| 1–3 | ✅ **Tokens, primitives, shell** | Landed. `globals.css`, `packages/ui/src/studio/`, `StudioShell`. |
| 4 | ✅ **Gallery** | Landed. Wall, piece, Scheduled, On air, Stock. §386, decision 72. |
| 5 | ✅ **Call Sheet** | Landed at `/call`. Overnight band, `whatNeedsMe`, the rig. §385. |
| 6 | ✅ **The Floor** | Landed. Brief and Live. §387, decisions 74–76. |
| 7 | ✅ **Rundown, Wires, Numbers** | Landed. §388. |
| 8 | **Master Control** | Largest surface, least new logic. |
| 9 | **Delete `(dashboard)`** | Move Call Sheet to `/`, drop the old tokens, drop `Shell.tsx` and the old components, update the navigation test. **Also:** `assessReadiness` and `FIRST_THIRTY_DAYS` hardcode ten routes — `/accounts`, `/analytics`, `/calendar`, `/hooks`, `/inbox`, `/queue`, `/settings`, `/settings/health`, `/settings/readiness`, `/setup-kit`, `/swipe` — all of which this step deletes. They need remapping to the studio, and a test that a route named in core actually exists. (`/onboarding` is fine: it is a top-level route outside both groups.) Found while building Call Sheet ▸ First run. |

Steps 4–8 are independent. Each is safe to land alone.

---

## 4. What needs backend that does not exist

Everything else in the prototypes reads something already in the database.

| Needs | What it is | Where |
|---|---|---|
| **While you slept** | A window over `job_events` between the operator's last visit and now: pieces made, refused, replies drafted. Needs a `last_seen_at` on the operator. | Call Sheet |
| ~~**Stage transitions**~~ | **Done, differently.** No `from_stage` column: a sequence already encodes its own transitions, so `readLive` derives the lit wire from two consecutive events in different stages. What *was* needed turned out to be bigger — seven of eleven stages were declared in `STAGE_AGENTS` and opened nowhere, so three desks could never light. `openStage` fixes it at the source; `stageCoverage.test.ts` keeps it fixed. Decision 74. | Floor · Live ✔ |
| ~~**Crew voice**~~ | **Done.** `lib/studio/crewVoice.ts`. A test asserts no written line contains a number, so every quantity on the floor came from an event. Decision 75. | Floor · Live ✔ |
| ~~**Brief preview**~~ | **Done.** `previewBrief` server action — a server action because `planProduction` is behind the core barrel and the barrel pulls `node:crypto` (gotcha 10, which this screen hit once already through `desks.ts`). No cost estimate: nothing measures per-run cost yet, and a made-up number is a fabricated observation. | Floor · Brief ✔ |
| **Live push** | Polling at 2s, through `/api/floor`. SSE remains the better answer and remains an optimisation rather than a blocker. | Floor · Live |
| ~~**Route map**~~ | **Wrong when written.** `job_events.job_id` points at a job and nothing on `content_items` points back — no job payload carries a content id either, so the strip would be empty for every row that exists. Built instead from the item's own record (claims, renders, gates, status), which is real evidence and works today. §386. | Gallery ✔ |

Nothing in that list blocks steps 1–4.

---

## 5. The two shapes

One route, one component tree, three breakpoints.

| | Phone `< 768` | Laptop `≥ 1024` |
|---|---|---|
| Navigation | Bottom tab bar, four rooms | Sidebar, seven rooms |
| Rooms not on the tab bar | Reached from the Call Sheet | Always in the sidebar |
| Sub-tabs | In the dark header, horizontally scrollable | Under the slate |
| The Floor | Live map strip + swipe deck | The room, wide, with the rail |
| Detail | Bottom sheet | Drawer or right column |
| Deciding | Swipe, and a long press | Buttons, and `J` `K` `A` |
| The corridor light | Now-bar above the tabs | Bottom of the sidebar |

**The rule:** the phone is not a subset. Every decision available on a laptop is
available on a phone; only the *gesture* changes.

---

## 6. What must not be lost

Checked against the old surface — 53 routes and 82 server actions. These are the
ones a re-skin would quietly drop:

- **The first-run wizard.** Daily generation will not start without it. → Call
  Sheet ▸ First run.
- **Reject asks why.** The reason trains the voice; a one-click reject drops the
  only part that teaches. → Gallery.
- **The overflow.** Written on every long piece, and there is no `reply()` on
  the adapter, so a person posts it. → Gallery ▸ piece.
- **Contradiction resolution** in the Brain. → Master ▸ The product.
- **Platform rules** — what a review actually unlocks. → Master ▸ rules.
- **Bluesky's app-password path.** Not OAuth like the other six.
- **The kill switch**, and that it stops things mid-flight without losing them.
- **Campaign slots**, and the mix ceiling a campaign lifts.
- **Every empty state's honesty.** A dash is unmeasured; a zero is measured.
- **The setup kit** — *"everything needed to create the accounts"*: the handles,
  bios, links and avatars to paste into each platform's signup. It is the
  before-you-connect half of the rig and has no studio home yet. Master already
  has six tabs and `rooms.test.ts` caps a room at six, so it folds into **The
  rig** as a section rather than becoming a seventh tab. Found in §389.

---

## 7. Definition of done, per room

A room is finished when all of these are true. Anything less and it does not land.

1. The route renders against real data with no console error.
2. It matches the prototype at both shapes, checked by screenshot.
3. Every action it offers is wired to a real server action.
4. Empty, loading and error states exist and say which kind of empty.
5. Nothing it replaced has lost a capability (§6).
6. `pnpm lint` and the full suite pass.
7. `docs/DECISIONS.md` has an entry if a real choice was made.
