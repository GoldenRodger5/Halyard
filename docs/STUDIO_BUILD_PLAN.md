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
| 6 | **The Floor** | Brief and Live. The most new backend — see §4. |
| 7 | **Rundown, Wires, Numbers** | Re-skins of screens that already work. |
| 8 | **Master Control** | Largest surface, least new logic. |
| 9 | **Delete `(dashboard)`** | Move Call Sheet to `/`, drop the old tokens, drop `Shell.tsx` and the old components, update the navigation test. |

Steps 4–8 are independent. Each is safe to land alone.

---

## 4. What needs backend that does not exist

Everything else in the prototypes reads something already in the database.

| Needs | What it is | Where |
|---|---|---|
| **While you slept** | A window over `job_events` between the operator's last visit and now: pieces made, refused, replies drafted. Needs a `last_seen_at` on the operator. | Call Sheet |
| **Stage transitions** | The lit wire needs to know which two stages are *adjacent in this run*. Today `job_events.stage` tags an event; it does not record a handoff. Add `from_stage` when a stage opens. | Floor · Live |
| **Crew voice** | The speech bubbles are the logged `because`, phrased. A deterministic map from message → an agent's line, falling back to the raw `because`. Never generated. | Floor · Live |
| **Brief preview** | Waking a desk as you choose means running `planProduction` on the current selections before anything is enqueued. A server action returning the stage plan and an estimate. | Floor · Brief |
| **Live push** | The floor polls at 2s today. At this fidelity it wants SSE. Polling ships first; SSE is an optimisation, not a blocker. | Floor · Live |
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
