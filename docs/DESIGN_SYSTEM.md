# The design system

**Status:** describes what is true. `apps/web/src/app/globals.css` is the source
of truth; `apps/web/src/lib/designTokens.test.ts` is what stops it drifting.

There was no document for this. The palette exists, every colour in it was
solved against measured contrast, and none of that reasoning was written down
anywhere a person could find it — it lived in CSS comments. This is that
reasoning, plus the one open question the palette raises.

---

## 1. The open question, first

**The console wears RecipeFix's brand, and Halyard is product-agnostic.**

Terracotta on warm cream is *RecipeFix's* identity — a cooking product, per the
build pack, "it should not look like a SaaS dashboard". That was right when
Halyard served one product.

Halyard now has two: RecipeFix and Kinolog, a film-taste product. A film log is
not warm cream and terracotta, and when the operator switches product the whole
console stays the colour of the other one.

Three ways out, and this document does not pick one:

| | What it means | Cost |
|---|---|---|
| **Neutral console** | The tool is a neutral grey/ink chrome; brand appears only in *previews* of the work | Loses the warmth; the console stops feeling like anything |
| **Console follows product** | Tokens re-resolve from `products.brand_tokens` on product switch | Every contrast decision below has to be re-solved per product, automatically |
| **Console is Halyard's own brand** | Halyard has an identity that is neither product's | Something has to design it |

The third is probably right and is the largest amount of work. The second is a
trap: the contrast values below were solved by measurement against *these*
backgrounds, and a palette that re-resolves per product either re-solves them at
runtime or ships inaccessible combinations for every product but the first.

---

## 2. The palette

Declared in `@theme`, so every token is a real Tailwind utility and
`designTokens.test.ts` fails on a class naming a colour that does not exist.

| Token | Value | Role |
|---|---|---|
| `canvas` | `#f6f3ec` | The page |
| `surface` | `#fdfbf7` | Cards |
| `paper` | `#fdfbf7` | Inputs and controls |
| `sunk` | `#efe9df` | Recessed areas, code, raw input |
| `line` | `#e2d9cb` | Borders |
| `ink` | `#2a2320` | Body text |
| `muted` | `#6e635c` | Secondary text |
| `primary` | `#8c5035` | Brand, actions |
| `primary-dark` | `#824b31` | Hover |
| `good` | `#4c754f` | Passed |
| `warn` / `warn-ink` | `#c99a2e` / `#876312` | Attention, and text on it |
| `danger` | `#a8433a` | Failed, destructive |

### Why these exact values

Three of them were changed after measurement, and the reasoning is the point.

**`primary` was `#c4714a`.** Every contrast violation in the product involved
this one colour and no other: 3.50:1 on surface, 3.14:1 on its own 10% tint —
the product chip in the sidebar, which renders on *every* screen — and 3.62:1
behind white on a button. `#9e5b3c` was proposed and was not enough (4.33 on
`sunk`). `#98583a` was not enough either — axe found the chip over `canvas` at
4.37, a composite no hand calculation had listed. `#8c5035` is the *lightest*
darkening that clears 4.5:1 as text on every surface and on its own tint over
each of them, solved against the backgrounds axe actually measured.

**`muted` was `#736760`.** It cleared 4.5 on `surface` and `canvas` and failed
on the tinted backgrounds the product actually uses it over — 4.31 on the
primary/25 border tint, 4.28 on danger/10. Both are secondary text on a card,
which is exactly the text an operator squints at.

**`paper` was never declared at all.** It was referenced 45 times as `bg-paper`,
so all 45 controls rendered transparent and inherited whatever sat behind them.

The lesson each of these shares: **contrast is a property of a pair, not of a
colour.** A value that passes on white can fail on its own 10% tint, and the
tint is what the product actually renders.

---

## 3. Typography

| Face | Where | Why |
|---|---|---|
| **Bricolage Grotesque** | `.font-display` — room titles, platform names, anything that names a thing | Optical sizing, and a slightly mechanical grotesque: it reads as a studio label rather than as a web heading. |
| **IBM Plex Sans** | `body`, and everything not asking for another face | Body, controls, labels. A humanist sans that stays legible at 12px, which is most of this interface. |
| **JetBrains Mono** | `.font-data` — gates, prompt versions, screenplays, numbers in columns, raw operator input | Anything the operator should read as *data* rather than as prose |
| **Instrument Serif** | The render templates only | It survives in the video and card compositions; the console no longer uses it. |

**§498.** `body` resolved to Inter for a whole migration after §382 named the
three faces above, so unclassed text — which is most of what anyone reads —
was set in the face the studio had replaced, beside headings in the new one.
Two families that were never chosen together, on every screen. The body now
takes `--font-body`, and `-0.005em` of tracking, which is what Plex wants at
these sizes.

The mono face is doing real work and is easy to lose: a QC gate line, a
screenplay, and the raw text of a Daily Take are all things where the exact
characters matter. Setting them in the body face would make them look like
commentary.

---

## 4. Rules that are enforced, not remembered

- **Every colour utility resolves to a declared token.** `designTokens.test.ts`
  scans the source, because `text-bad` — which has no token — emits no rule and
  renders as body ink. It typechecks, it lints, it builds, and the element is
  present, so every selector-based test passes.
- **`text-muted/60` is banned.** It composited to 2.33:1, half of what a person
  needs, and was the single largest source of contrast failures — once per
  skipped gate on every queue item.
- **A gate name column has to fit the longest gate name.** §374, after
  "Destinationno link" shipped.
- **Wide content scrolls inside its own container.** A screenplay is fixed-width
  text and the page must never scroll sideways because of it.

---

## 5. Layout

Desktop: a 240px sidebar, content capped at 1280px. Mobile: a fixed bottom tab
bar, with `pb-tabbar` reserving room for it — because "the queue must be fully
usable on a phone; approval happens in spare moments or it doesn't happen".

§361 added a second level: a section's tools are tabs under a line naming the
question that section answers, and a third level appears only inside a tab that
has one. The nesting is real and it is capped at three.

---

## 6. What this system does not have

Named honestly, because a design system's gaps are where inconsistency starts.

- **No dark mode.** Not started, and the palette is built for light.
- **No spacing scale beyond Tailwind's.** Padding is chosen per component,
  which is why two cards can disagree by 4px.
- **No motion language.** Transitions are `transition-colors` where somebody
  remembered. There is no shared duration or easing.
- **No empty-state, loading or error component.** `EmptyState` exists and is
  good; loading and error are ad hoc, so a slow page shows nothing and a failed
  one shows a Next.js default.
- **No icon set.** The product uses text and one platform dot. That is a
  deliberate-looking choice nobody actually made.
