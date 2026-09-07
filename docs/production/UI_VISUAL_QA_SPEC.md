# Halyard UI — Final Visual QA, Sizing & Spacing Specification

**Purpose:** give the UI redesign an exact visual-quality bar so the product does not regress into tiny text, inconsistent padding, over-carded layouts, blocked controls, or a visually polished but hard-to-use console.

This document supplements `UI_PRODUCT_REDESIGN_SPEC.md` and `UI_PAGE_BY_PAGE_REDESIGN.md`.

The goal is not pixel sameness across every page. It is a coherent visual system with deliberate exceptions where the content type genuinely requires them.

---

# 1. Current issues this specification must eliminate

The reviewed application contains several good visual ideas, but current implementation uses values such as:

- a ~196px desktop sidebar;
- 9px product-switcher labels;
- 9–10px status/meta labels in important places;
- 10–12.5px supporting text throughout operational surfaces;
- 7.5–11px text inside the current Floor;
- many pages whose primary hierarchy is several similarly sized bordered sheets;
- dense secondary copy occupying more space than the visual content users are deciding on;
- desktop layouts that often use one narrow content column even when the task is visual;
- mobile layouts that preserve too much desktop information density rather than reprioritizing.

The redesign must not reproduce these values with new colors.

---

# 2. Core design tokens

## Spacing scale

Use a restrained 4px-based scale:

```text
4   micro
8   compact
12  control-internal
16  default component gap
20  card/panel compact padding
24  standard panel/page section gap
32  large section gap
40  major block separation
48  hero/major page separation
64  page-level breathing room
80+ landing/marketing sections only
```

Avoid random `7px`, `13px`, `27px`, etc. where one of the system values serves the same purpose.

Exceptions are allowed for optical alignment, but should remain local rather than becoming new implied tokens.

## Radius scale

```text
8px   small controls/chips
12px  standard controls
16px  cards/panels
20px  large modal/preview surfaces
24px  mobile sheets/hero surfaces where appropriate
999px pills only
```

Do not vary radii per page for decorative novelty.

## Border

- standard divider: 1px;
- strong selected border: 1px + color/inner glow rather than thicker layout shift;
- avoid double borders around nested panels;
- prefer spacing/dividers over wrapping every row in a card.

---

# 3. Typography system

UI typography uses a readable sans-serif system.

Recommended families:

- display/headings: Bricolage Grotesque if already properly loaded;
- body/navigation/forms: IBM Plex Sans;
- data/timestamps/ids: JetBrains Mono;
- product-specific fonts only inside generated-content previews and Product Brain brand specimens.

## Desktop type scale

| Role | Size | Line height | Notes |
|---|---:|---:|---|
| Marketing hero | 52–64 | 0.98–1.05 | landing only |
| App page title | 32–36 | 1.10 | one per page |
| Major section | 24 | 1.20 | sparse |
| Card/area title | 18 | 1.25 | normal content title |
| Body | 16 | 1.50 | default prose/forms |
| Supporting | 14 | 1.45 | meaningful secondary copy |
| Label | 13 | 1.30 | controls/status labels |
| Metadata | 12 | 1.35 | timestamps, IDs, low-priority supporting info |

Meaningful operator information should not be below 12px. Most supporting information should be 14px.

## Mobile type scale

- page title: 28–32px;
- section title: 20–22px;
- card title: 17–18px;
- body/forms: 16px;
- supporting: 14px;
- metadata: 12–13px.

Do not shrink type simply to avoid redesigning a layout.

## Line lengths

- explanatory prose: max 68–74ch;
- onboarding instructions: 56–68ch;
- labels and helper copy should wrap rather than truncate unless the value is genuinely replaceable by tooltip/detail.

---

# 4. Color and contrast

Target WCAG 2.2 AA for normal product UI.

- normal text: >= 4.5:1 contrast;
- large text: >= 3:1 where WCAG large-text definition applies;
- focus indicators and meaningful component boundaries must remain visible;
- status must never depend on color alone.

Do not reduce opacity on an entire card containing readable content to communicate completion. Use a status treatment, icon, or quieter border instead.

## Halyard palette behavior

- deep marine: shell, live room, strong chrome;
- warm sheet/near-white: readable work surfaces;
- brass: wayfinding/focus/selection, not success;
- green: ready/safe/completed;
- signal red: failure/attention/on-air where explicitly defined;
- blue: information/waiting where useful;
- gray/quiet: secondary content, but still AA-readable.

Product brand colors belong primarily inside Product Brain and content previews. They should not recolor the whole Halyard shell.

---

# 5. Interactive targets

WCAG 2.2 defines a 24×24 CSS-pixel minimum target size in its Target Size (Minimum) criterion, with exceptions. Halyard should use a more comfortable product standard:

- primary buttons: >= 44px high;
- ordinary buttons: >= 40px desktop, >= 44px touch/mobile;
- icon buttons: 40×40 desktop, 44×44 mobile;
- tabs: >= 40px tall;
- sidebar nav rows: 42–44px;
- mobile bottom-nav item hit area: >= 48px high;
- Floor desk/robot targets: >= 48×48 CSS px after scene projection;
- tiny visual indicators may be smaller only when nested inside a larger actionable target.

Neighboring destructive and primary actions require clear spacing.

---

# 6. App shell dimensions

## Desktop >= 1440

- sidebar: 240px target; acceptable 232–248px;
- content horizontal padding: 28–32px;
- top title/header zone: 68–76px depending context;
- main layout max width: approximately 1600px, but do not force a narrow centered column on visual pages;
- prose-only panels may cap around 900px/74ch;
- sticky/side inspector: 320–380px depending task.

## Standard laptop 1180–1439

- sidebar: 224–232px;
- content padding: 24px;
- secondary inspectors collapse when not active;
- visual content receives width before nonessential explanatory copy.

## Compact 960–1179

- sidebar may become 80px icon rail + labels on hover/expand, or collapse into top/menu pattern if readability suffers;
- avoid a 196px rail that still uses tiny labels;
- right inspectors become drawers unless enough space remains;
- room/list layouts use compact presets rather than continuous shrinking.

## Mobile < 768

- no desktop sidebar;
- 5-item bottom nav maximum;
- page horizontal padding: 16px;
- section gap: 24px;
- modal interactions become sheets/full-screen pages;
- sticky primary actions should never cover the last content row; reserve safe-area/padding explicitly.

---

# 7. Panel and card density

## Default panel

- outer padding: 20–24px desktop, 16–20px mobile;
- title-to-body gap: 8–12px;
- action row gap: 8–12px;
- panel-to-panel gap: 16–24px;

## Avoid card soup

Do not turn every metric, status, fact, and setting into its own rounded rectangle.

Use:

- one panel with internal dividers for related metrics;
- tables/lists for repeated comparable data;
- image/media grids for visual assets;
- tabs when switching context;
- progressive disclosure for detail;
- side inspectors for selected item detail.

A screen should usually have 1–3 visually dominant surfaces, not eight equally weighted cards.

---

# 8. Page-by-page final visual acceptance

## Landing

Visible above the fold on 1440×900:

- logo/navigation;
- one clear headline;
- short subhead;
- two CTAs maximum;
- substantial signature visual (Floor + output), not a tiny screenshot;
- no wall of feature cards before the product promise is understood.

Hero visual should occupy roughly 45–55% of desktop width.

Mobile hero stacks text then visual. CTA buttons become full/near-full width where appropriate.

## Sign in

- card max width ~440–480px;
- generous 28–32px internal padding desktop;
- fields/buttons 44px+ tall;
- no developer/environment language in main state;
- error block readable and attached to the failed action.

## Onboarding

- content width ~920–1120px depending step;
- one main decision per screen;
- progress indicator remains visible but quiet;
- primary action anchored consistently bottom/right desktop, full-width or sticky bottom mobile;
- product-learning screen favors progressive visual result cards over scrolling logs;
- no step should require reading more than ~2 short paragraphs before acting.

## Product Brain

- product header + readiness/refresh stays visible near top;
- left subnav or clear tabs;
- Overview uses a balanced 2-column card layout on desktop;
- detailed evidence/facts use lists/tables, not equal cards;
- brand palette swatches at least 56×56px when editing;
- typography specimens large enough to judge, not 12px labels;
- edit/confirm/pin actions visually secondary until a row is selected/hovered/focused.

## Home

- first viewport answers `What needs me?` without scrolling;
- one dominant action card;
- 3–4 status numbers in one strip, not four unrelated KPI cards;
- opportunities show useful visual/source context;
- system/setup detail only appears when it actually needs the operator.

## Create

- prompt area visually dominant, 56–64px minimum control height;
- platform chips comfortably tappable;
- mode switch immediately visible;
- advanced controls collapsed;
- concept cards at least ~300px wide desktop, 1-per-row mobile;
- hook and visual premise are more prominent than metadata;
- no concept card should require scrolling inside the card.

## Live Floor

- scene receives the majority of viewport;
- at 1440 desktop, visual room >= ~820px wide whenever inspector is open and wider when closed;
- inspector 320–360px;
- scene height ~600–680px where viewport permits;
- no desk label < 13px equivalent;
- robot/desk target >= 48×48 CSS px;
- floor title/status stays above scene rather than over it;
- no floating panel obscures central handoff space;
- selected item opens inspector rather than covering the room with a centered modal;
- event feed is secondary and collapsible;
- final preview can grow without pushing critical controls below unreachable space.

## Review

Desktop preferred split:

- preview: ~58–64% width;
- decision panel: ~36–42% width;
- short-video preview displayed approximately 320–400px wide at correct aspect, not as a tiny thumbnail;
- carousel preview ~420–560px square/portrait workspace where space permits;
- player controls always reachable;
- primary decision buttons remain visible during scroll via sticky decision area;
- quality findings grouped by severity and area, not one dense diagnostic dump.

Mobile:

- actual post preview first;
- metadata accordions below;
- sticky Approve / Changes action bar with safe-area padding.

## Schedule

- desktop uses a real week/timeline layout when width >= 1180px;
- each scheduled tile contains thumbnail/icon + account + time + status without requiring hover;
- empty opportunity windows visually quieter than scheduled content;
- cards do not exceed 2–3 lines of text in calendar mode;
- mobile uses agenda, not squeezed seven-day grid.

## Engage

Desktop split:

- inbox list ~36–40%;
- selected conversation ~60–64%;
- list rows 64–88px depending preview content;
- author/platform/state visible at a glance;
- reply editor body >= 16px;
- external opportunities visually distinct from owned comments;
- `Send` only appears when actual route exists.

Mobile:

- list → full-screen conversation detail;
- reply action anchored near bottom but not covering content.

## Results

- one meaningful headline insight/funnel above generic totals;
- charts use adequate 14px axis/legend text where needed;
- chart panel height generally 280–360px, not postage-stamp sparklines pretending to be analysis;
- acquisition funnel makes unavailable stages visibly unavailable rather than zero;
- learned insight card shows evidence/sample/confidence without burying the recommendation.

## Connections

- platform row/card >= 72px high when collapsed;
- logo/platform/account/state/actions visible without expanding;
- advanced callback/env/provider registration info inside drawer/details;
- Connect/Test/Manage buttons use ordinary 40–44px controls, not 9–10px mono buttons;
- public-posting capability and connection state are separate visual labels.

## System

- developer-oriented density is allowed, but not tiny/unreadable;
- tables use 13–14px body, 12px metadata;
- critical release mismatch shown as a high-priority callout;
- logs/events can use 12px mono with comfortable 1.45 line height.

---

# 9. Icons, imagery and illustration

Use a coherent icon family (Lucide or existing equivalent) for utility icons.

Do not mix emoji, random Unicode symbols, custom line icons and filled platform icons in one control layer.

Platform marks use official/recognizable monochrome or brand assets where permitted.

Halyard's robot/studio illustration system should be custom and restricted to:

- landing demonstration;
- onboarding learning step;
- Live Floor;
- occasional empty/celebratory states.

Do not put robot illustrations on every settings card.

---

# 10. Motion quality rules

Ordinary UI:

- hover/focus: 120–180ms;
- drawers/sheets: 180–280ms spring/tween;
- page/major panel transitions: 180–260ms;
- loading skeletons restrained;
- no perpetual bouncing icons.

Signature Floor follows `LIVE_FLOOR_TECHNICAL_DESIGN.md`.

Reduced-motion mode removes travel, parallax, bobbing and nonessential crossfades while preserving immediate state updates.

---

# 11. Responsive verification matrix

Every primary page must be manually/automatically checked at:

```text
1600×1000 large desktop
1440×900 desktop/laptop
1280×800 laptop
1024×768 compact/tablet landscape
768×1024 tablet portrait where relevant
430×932 large phone
390×844 baseline phone
320×568 reflow stress case
```

Also verify:

- 200% text zoom on desktop pages;
- longest realistic product name;
- longest account handle;
- 7+ connected platforms;
- empty states;
- errors;
- 10+ active/past production artifacts;
- loading states;
- one and many products.

At 320 CSS px, content should reflow without requiring horizontal page scrolling except purpose-built two-dimensional content such as a complex timeline/canvas with an accessible alternate representation.

---

# 12. Screenshot/visual-regression requirements

Create stable fixture-backed visual snapshots for each key page/state.

Minimum snapshots:

- landing desktop/mobile;
- sign-in desktop/mobile;
- onboarding first step/product-learning/brain-review;
- Product Brain overview + brand;
- Home active + empty/setup-needed;
- Create prompt + concepts;
- Floor idle + parallel work + handoff + blocked + complete;
- Review video + carousel;
- Schedule desktop/mobile;
- Engage inbox/detail;
- Results measured + unmeasured;
- Connections mixed states;
- System release mismatch.

Visual regression should fail on:

- overlapping text;
- clipped primary controls;
- invisible focus state;
- blocked sticky action bar;
- labels under 12px in required operator surfaces;
- unintended horizontal scroll;
- content hidden under mobile bottom navigation;
- scene inspector covering selected click targets;
- unreadable contrast.

Do not treat screenshot equality alone as design quality. Use it to prevent accidental regressions after the target design is accepted.

---

# 13. Browser/device interaction checklist

For every primary screen:

- keyboard-only completion of its core task;
- pointer/mouse;
- touch layout;
- focus visibility;
- form error association;
- Escape behavior for drawers/modals;
- browser back preserves expected navigation state;
- no click target moves unexpectedly while pointer is approaching because async content loaded above it;
- skeleton/min-height prevents major layout jumps;
- no tooltip contains essential information unavailable on touch.

---

# 14. Final design review protocol

Before a UI phase is accepted:

1. render every required viewport;
2. inspect the actual screenshot, not only component code;
3. verify typography sizes from computed styles;
4. verify spacing against tokens;
5. run automated contrast/accessibility checks;
6. keyboard through the primary task;
7. test mobile touch targets;
8. test real long content/labels;
9. confirm backend states shown are truthful;
10. correct defects at the design-system/component level when repeated;
11. rerun the page matrix;
12. record remaining intentional exceptions.

The acceptance question is:

> Can a new operator understand what to do, comfortably read everything important, immediately identify the primary action, and trust what the screen says without learning Halyard's internals first?

If not, the screen is not finished.