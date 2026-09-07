# Halyard UI — Current Measured Visual Findings

**Scope:** concrete issues observed in the reviewed Studio implementation that the redesign must not preserve.

This is not the target design; `UI_VISUAL_QA_SPEC.md` is the target.

## Current sizing findings

Examples in current code include:

- desktop Studio sidebar around `196px`;
- product-switcher text around `9px`;
- sidebar/room badges around `9px`;
- corridor/status copy around `10–11px`;
- Floor team labels around `7.5px`;
- Floor status labels around `8.5–9.5px`;
- several important metadata/status lines around `10–12.5px`;
- Wires reply metadata around `10px` and content around `13–13.5px`;
- Results table headings around `9px`;
- Connections exposes action labels/status copy around `9.5–12.5px`.

These values are part of why the interface feels harder to read than the information density requires.

## Current contrast checks

Using the current CSS token values reviewed in `apps/web/src/app/globals.css`, simple sRGB contrast calculations produce approximately:

| Foreground | Background | Approx ratio | Result for normal text |
|---|---|---:|---|
| `quiet #5f6e6b` | `sheet #fcfcfa` | 5.20:1 | passes |
| `quiet #5f6e6b` | `screen #e7ecea` | 4.48:1 | slightly below 4.5:1 |
| `dmut #92aaa5` | `deep #08110f` | 7.76:1 | passes |
| `faint #5f7975` | `deep #08110f` | 4.08:1 | fails normal-text 4.5:1 |
| `lit #9a6e15` | `sheet #fcfcfa` | 4.43:1 | slightly below 4.5:1 |

These calculations are pair-level checks, not a substitute for computed browser/axe testing. Opacity, blending, overlays and actual rendered backgrounds can change the result.

The redesign should solve contrast on the actual production surface and then run automated browser checks.

## Current layout findings

- many pages use a narrow vertical stack of similar `Sheet` components even when the task is visual/comparative;
- Gallery and Review have strong media concepts but need the actual post to dominate the decision surface;
- Rundown is operationally useful but list-shaped rather than a true planning workspace;
- Wires is sequential-card-shaped rather than an inbox/detail workspace;
- Results uses honest measurement semantics but visually reads as KPI cards + table rather than an acquisition/learning product;
- Product Brain is evidence-grounded but still reads like a fact ledger rather than a navigable editable model of the product;
- platform setup puts developer configuration detail too near normal user controls;
- the existing Floor uses small pods/labels and SVG wires, which makes it read as a workflow diagram rather than an animated room.

## Required correction

Do not merely increase every current value by two pixels.

Use `UI_VISUAL_QA_SPEC.md` to restructure hierarchy, widths, preview sizes, panel density and responsive behavior, then verify the final rendered pages at the defined viewport matrix.