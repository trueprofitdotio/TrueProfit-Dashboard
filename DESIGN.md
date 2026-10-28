---
name: TrueProfit Operations Workspace
description: A flat field of discrete white containers under one indigo pen
colors:
  paper: "#EEF0F6"
  grid-minor: "#E6E9F4"
  grid-major: "#D7DCEE"
  canvas-edge: "#DDE0EA"
  surface: "#FFFFFF"
  surface-sunken: "#F4F6FC"
  surface-hover: "#F1F3FC"
  surface-active: "#E6E9F9"
  rule: "#EAECF4"
  rule-panel: "#DDE1EE"
  rule-strong: "#C2C8DC"
  rule-stronger: "#A8B0C9"
  ink: "#15171F"
  ink-2: "#2B2F3D"
  muted: "#585E72"
  meta: "#6E7488"
  faint: "#A4A9BC"
  pen: "#4954BC"
  pen-deep: "#38429A"
  pen-wash: "#EFF0FB"
  pen-field: "#E2E5F7"
  pen-rule: "#C5CAEA"
  on-pen: "#FFFFFF"
  positive: "#0F7A52"
  positive-bright: "#19A86D"
  warning: "#B4530A"
  danger: "#C0203C"
  series: "#35802B, #0E9AC2, #DE4A6B, #4954BC, #DFA022, #7A5BBF"
  aired-1-ink: "#8A5A00"
  aired-1-field: "#FFF7E0"
  aired-1-rule: "#F3DC9B"
  aired-2-ink: "#9C4708"
  aired-2-field: "#FFF0E4"
  aired-2-rule: "#F7CBA5"
  aired-3-ink: "#A93624"
  aired-3-field: "#FFEEEB"
  aired-3-rule: "#F6C5BA"
  aired-4-ink: "#9C2A64"
  aired-4-field: "#FDEDF4"
  aired-4-rule: "#F2C0D6"
  aired-5-ink: "#6A3DA2"
  aired-5-field: "#F3EDFD"
  aired-5-rule: "#D8C6F3"
  aired-all-ink: "#582D9E"
  aired-all-field: "#ECE3FC"
  aired-all-rule: "#CAB4F0"
typography:
  family: "Archivo, system-ui, Segoe UI, Helvetica, Arial, sans-serif"
  narrow: "Archivo Narrow"
  mono: "Roboto Mono"
  families: "Archivo, Archivo Narrow, Roboto Mono"
  narrow-use: "column heads and channel labels only"
  mono-use: "every figure in a column"
  axis: "400-600; nothing in the UI is set above 600"
  brand:
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.015em"
  page-title:
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.018em"
  sheet-title:
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  nav:
    fontSize: "13px"
    fontWeight: 500
  control:
    fontSize: "13px"
    fontWeight: 500
  body:
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.004em"
  table-cell:
    fontSize: "13px"
    fontWeight: 400
  table-label:
    fontFamily: "Archivo Narrow"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.01em"
  readout-label:
    fontFamily: "Archivo Narrow"
    fontSize: "12px"
    fontWeight: 600
  readout-figure:
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.025em"
    fontVariantNumeric: "tabular-nums"
  meta:
    fontSize: "11.5px"
    fontWeight: 400
  axis:
    fontSize: "10.5px"
    note: "chart ticks and the inline growth delta only; the floor for any text"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "4px"
  xl: "5px"
  pill: "999px"
elevation:
  flat: "0 1px 0 rgba(21,23,31,.03)"
  raised: "0 1px 2px rgba(21,23,31,.05), 0 2px 6px -2px rgba(21,23,31,.07)"
  overlay: "0 2px 4px -1px rgba(21,23,31,.07), 0 14px 32px -10px rgba(21,23,31,.16)"
  dialog: "0 4px 8px -2px rgba(21,23,31,.09), 0 28px 56px -16px rgba(21,23,31,.22)"
spacing:
  scale: "4 / 8 / 16 / 32 — there is nothing between these steps"
  touching: "4px"
  grouped: "8px"
  near: "16px"
  separate: "32px"
  page: "64px"
components:
  sheet:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-panel}"
    rounded: "{rounded.md}"
    boxShadow: "{elevation.flat}"
  readout-strip:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-panel}"
    dividerColor: "{colors.rule}"
    rounded: "{rounded.md}"
  button-primary:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.on-pen}"
    rounded: "{rounded.sm}"
    height: "34px"
  field:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.sm}"
    height: "34px"
  chip:
    height: "24px"
    rounded: "{rounded.xs}"
    fontSize: "12px"
    fontWeight: 500
---

# Design System: TrueProfit Chart Recorder

## Overview

**Creative North Star: "One Field, Discrete Instruments"**

The application is a single flat field carrying discrete white containers. Each
section is an object with its own edge, and the eye counts them down the page.
Over them, one indigo pen marks the live route, focus, the primary action, and
the revenue series; every other colour is owned by a data series or a state.

An earlier build drew the field as ruled engineering graph paper, on the idea
that the whole page should read as a measuring surface. It did not survive
contact with use: the lattice textured every pixel to make one point about
plots, it competed with the containers for the eye, and sections scattered
across it read as loose rather than as parts of one page. The ground is now a
step deeper than the sheets, which is all the separation a white container
needs, and the containers themselves carry the structure.

Density is a feature. This is read all day by people who already know where to
look, so spacing is tight, the type ramp is small, and figures are given room
to be compared rather than decorated.

### Principles

- **Figures are the product.** Nothing may make a column of numbers harder to compare, and no information already on screen may be dropped to tidy a layout.
- **The field is ground, never page.** Data, tables and running text sit on a container. What the field may carry is annotation — a section heading, its meta line, a single text control — set directly above the container it names.
- **A container is a discrete object.** It reads as separate because it is white on a deeper field, with its own hairline edge and the faintest lift. Heavier shadows are reserved for things that interrupt.
- **One spacing ladder: 4, 8, 16, 32.** 4 for what is touching, 8 for what belongs together, 16 for what is merely near, 32 for what is separate. Nothing in between, ever.
- **One pen.** `#4954BC` marks the live route, focus, the primary action, and the revenue series. It is the only decorative colour in the product.
- **Colour is a reserved signal.** Every other colour is owned by a data series or a semantic state, and text wears text tokens — a figure is never tinted with its own series colour.
- **Corners are cut, not moulded.** 4px on a sheet, 3px on a control, 2px on a chip.
- **Movement confirms a change and nothing else.** 140ms, flat ease; the pen is either down or it is not.

## Color

### The field

- **Paper** `#EEF0F6` — the application ground, one flat fill. Never carries data or running text. It is deliberately a step deeper than `surface` so a white container reads as lifted without a shadow saying so.
- **Grid minor** `#E6E9F4` and **grid major** `#D7DCEE` survive only as chart gridline colours. They are no longer painted on the page.
- **Canvas edge** `#DDE0EA` — the seam where a full-bleed element (the app bar) meets the field.

### Surfaces

**Surface** `#FFFFFF` is every sheet, overlay, dialog, menu and input — opaque, so it masks the lattice. **Surface sunken** `#F4F6FC` is table heads and recessed groups; **surface hover** `#F1F3FC` is row and control hover; **surface active** `#E6E9F9` is a held or open control.

### Rules

Three weights, each with a job: **rule** `#EAECF4` for hairlines inside a sheet; **rule panel** `#DDE1EE` for a sheet's own edge; **rule strong** `#C2C8DC` for control edges, with **rule stronger** `#A8B0C9` on hover. Never use a heavier rule to add emphasis.

### Ink ladder

Measured against `surface`: **ink** `#15171F` (17.6:1) for headings and key figures; **ink-2** `#2B2F3D` (12.6:1) for body and table cells; **muted** `#585E72` (6.3:1) for secondary labels; **meta** `#6E7488` (4.9:1) for metadata and placeholders. **faint** `#A4A9BC` (2.5:1) is for dividers and small icon strokes only — never for text. Every step carries a cool cast so nothing sits neutral-grey beside the indigo.

### The pen

`#4954BC` reads **6.4:1 on white, and white reads 6.4:1 on it**. That two-way legality is the single most important property of this palette and the reason the system needs one accent step where its predecessor needed three: the pen can fill a button and carry white type, *and* it can be the text colour, *and* it can draw a 2px trace — all without a darker stand-in.

| Step | Value | Use |
|---|---|---|
| `pen` | `#4954BC` | traces, fills, the live route, focus, accent text |
| `pen-deep` | `#38429A` | hover and pressed, and ink on a pen-coloured wash |
| `pen-wash` | `#EFF0FB` | the pen as a field |
| `pen-field` | `#E2E5F7` | one step in: a selected row or date |
| `pen-rule` | `#C5CAEA` | the edge of a pen-coloured field |
| `on-pen` | `#FFFFFF` | the label on a pen fill |

### Semantic state

Positive `#0F7A52` (lit end `#19A86D` for a completed fill), warning `#B4530A`, danger `#C0203C`, each with a soft field and a rule. These steps are deliberately **not** series colours: a status never appears as a mark on a plot. They also never travel on colour alone — a delta carries its arrow, a chip carries its dot and its word.

### Data ramp

Six slots, assigned in fixed order and never cycled: green `#35802B` signups, cyan `#0E9AC2` clicks, rose `#DE4A6B` installs, indigo `#4954BC` revenue, amber `#DFA022` payouts, violet `#7A5BBF` spare.

Revenue is drawn with the brand pen because it is the measure the product exists to move. Clicks takes the cyan — present, but the quietest hue on the plot, which suits bulk volume rather than an outcome.

The set is validated with the data-viz palette validator at **`--pairs all`**, not at `--pairs adjacent`, because the daily trace puts all five on one surface and the top-affiliate view splits them into small multiples; both arrangements make every pair adjacent to every other. Worst pair is ΔE 10.3 under deuteranopia and 18.9 under normal vision, clearing the 8 target and the 15 floor. ECharts takes literal hex, so `PALETTE` in `constants.tsx` and `--tp-series-*` in `index.css` are kept in step by hand. **Any change to this ramp is re-validated with that script, never judged by eye.**

## Typography

**Archivo** is the lettering: a grotesque with the upright, slightly condensed character of technical-drawing annotation, which keeps dense labels legible without shouting. **Archivo Narrow** carries column heads and channel labels, where horizontal room runs out first and a condensed label buys a wider data column. Both from Google Fonts; the variable axis runs 400–600 and nothing is set above 600, so hierarchy comes from size, colour and position rather than weight.

**Roboto Mono carries every figure in a column.** That is not a technical costume. The product's one hard requirement is that a column of numbers can be compared digit by digit, and a monospaced face guarantees the columns register whatever the stack resolves to.

The large readouts are the deliberate exception: they are set in Archivo with `tabular-nums`, because a monospaced comma takes a full cell and `1,202` at 26px reads as `1 , 202`. Those five figures are different measures read side by side, not a column compared digit by digit, so they need tabular figures — which Archivo has — not a fixed advance width.

- **Brand:** 16px / 600 / -0.015em.
- **Page title:** 19px / 600 / -0.018em.
- **Sheet title:** 14px / 600 / -0.01em. Sentence case.
- **Navigation and control labels:** 13px / 500.
- **Body and table cells:** 13.5px body, 13px cells / 400.
- **Column head:** Archivo Narrow 12px / 600 / +0.01em, sentence case. Never all-caps.
- **Readout label:** Archivo Narrow 12px / 600.
- **Readout figure:** 26px / 600 / -0.025em, tabular.
- **Metadata:** 11.5px / 400 in `meta`. 10.5px is the floor, and only on an axis tick.

## Layout

The app bar is full-bleed white, sticky, with a `canvas-edge` rule and **no shadow** — a masthead ruled off the board. It is a three-track grid whose outer tracks are equal, so the workspace switcher sits on the bar's true centre line however wide the brand runs. The frame centres at max 1680px with a 20px desktop gutter (14px mobile).

Inside a workspace, sections are separated by 20px. A sheet is padded 16px. A sheet whose content reaches its own edge is flush: `overflow: hidden`, no padding, a header strip with a hairline under it, and the content in its own `overflow-x: auto` container.

On mobile the app bar stacks brand over navigation, the readout strip folds to two columns then one, filters stack, and tables keep horizontal scroll. Content is never silently dropped to make a layout fit.

## Components

### Navigation

The workspaces are a **channel selector**: one instrument, several channels, one live at a time. A ruled frame with hairline dividers holds the segments; the selected one is filled with the pen and carries white type. The **workspace sub-rail** (Influencer's own views) stays subordinate and keeps a quiet 2px pen underline — two framed controls stacked would read as one nested inside another.

### Sheets

`card` / `tp-sheet` is the reading surface: white, 4px radius, 1px `rule-panel` edge, flat elevation. `tp-sheet-flush` clips its content to that radius. `tp-inset` is the only nested container: `surface-sunken`, 3px radius, 1px `rule`.

### The readout strip

`tp-readout-strip` is the signature component and the one that replaced the KPI card grid. The headline measures are **one continuous instrument divided by hairlines**, not several cards: cards would put four borders and four shadows between numbers that exist to be compared, and a shared baseline with a single rule between cells is what lets the eye run across the row.

Each cell carries a label in Archivo Narrow, a figure in ink, and a delta. Where a cell maps to a chart series, that series colour rides on a 14×2px rule beside the label — the pen stroke that identifies the channel — so the figure itself can stay in ink. Both workspaces use it, so one measure reads the same way everywhere.

### Tables

Collapsed borders. The head is `surface-sunken`, Archivo Narrow 12px/600 in `muted`, sentence case, with a hairline under it. Cells are 9px/12px at 13px; rows hover to `surface-hover`. Numeric columns are right-aligned and set in Roboto Mono. A sortable header carries a drawn two-chevron SVG — both chevrons always present so the column's width never changes when the sort moves to it, the active direction in the pen. Unicode arrows are not used: they inherit whatever the font happens to have and sit off the baseline.

### Buttons and fields

Primary: pen fill, white label, 3px radius, 34px tall, flat elevation, darkening to `pen-deep` on hover. **It does not lift** — paper on a board does not rise. Secondary: `tp-btn-quiet` — white, `rule-strong` edge. Fields and filter triggers are white with a `rule-strong` edge, 3px radius, 34px tall; focus moves the edge to the pen and adds a 3px `pen-wash` ring.

### Chips

`tp-chip` is the single classification form: 24px tall, 2px radius, 12px/500, a hairline edge and a soft field. Variants are `positive`, `danger`, `warning`, `info`, `accent`, and a neutral default. Status, tier and platform tags all use it — there is no second badge shape, and a platform name takes the neutral chip rather than borrowing a semantic colour.

**Deal status is a derived ladder, not a free-text field.** `Not Started` → `In Progress` → `Nth Content Aired` → `All Content Aired` → `All Done`, computed from the reported videos and the payment progress every time it renders. The aired rungs warm from yellow through orange to violet as a deal approaches its agreed count (`tp-chip-aired-1` … `-5`, then `tp-chip-aired-all`), so progress is readable down a column without stopping to read each label. Every rung keeps dark text on a pale field, so the hue carries position and never contrast.

There is no tag creation, renaming or deletion, and that is the point: when status was stored text, two values — `All done` with a lower-case d, and `Canceled` — sat on real rows where no picker could reach them, so no amount of UI could remove them.

### Charts

**One plot, one y-axis — always.** The daily trend is a **strip chart**: one ECharts instance holding one grid per measure, stacked, all sharing a single date axis, with a linked `axisPointer` so one cursor reads every channel at the hovered day. Each channel keeps its own y-scale and its own pen, and its name sits beside its own trace rather than in a shared legend, which would imply the bands share a scale.

That replaced a single plot carrying all five measures on two y-scales, counts left and dollars right. Where those two scales are pinned against each other is arbitrary, so every crossing the eye read as a relationship was an artefact of that choice. Giving each measure its own band keeps all five visible and all five comparable along time — the comparison that actually exists — and costs only vertical room.

The top-affiliates view takes the same escape by splitting into **small multiples**: one horizontal-bar panel per measure, all sharing one row order.

Marks are thin and the chrome recedes: lines are 2px, markers are 8px with a 2px surface ring, and gridlines are solid `grid-minor` hairlines — never dashed, which reads as a threshold. A plot sits in `tp-plot`: a white surface with its own edge, carrying its gridlines from the chart itself.

Lines are drawn **smoothed**, at `smooth: 0.35` with `smoothMonotone: 'x'`. The monotone constraint is what makes this safe: the curve can never overshoot a measured value, so it cannot invent a peak or a dip between two readings, and every tooltip still reports the exact figure for the day under the cursor. Area fills are a vertical wash of the series colour, 22% at the top to 1% at the baseline.

Channel names are annotated above each band at its left edge, on the same vertical as the readout-strip label for the same measure — the two must agree, or the reader crosses the plot looking for a name that is on the wrong side. Values and labels wear text tokens; the coloured mark beside them carries identity.

**A duration is not a category.** Merchant payout counts are months subscribed, so they are drawn as a retention curve — of the merchants that paid at all, how many were still paying in month two, month three, and so on — not as slices of a parts-of-whole bar. The bars only descend, the gap between two bars is that month's churn, and the final bar is the cohort still running. Splitting it into "1 / 2–3 / >3" asked the reader to compare three groups that are not alternatives: everyone in the last group also lived through the first two.

**Progress fills are gradients along their own axis**, darker at the origin and lighter at the head, which reads as travel rather than as a block. Colour carries state: `tp-fill-running` (pen) while a thing is in flight, `tp-fill-done` (positive) the moment it completes. A finished bar that stays blue makes the reader check the number to find out.

### Empty, loading, and error states

Empty: `tp-empty` — a centred title in `ink` and a body under 34ch in `muted` that says what to do next. Loading in place of content is `tp-skeleton` shimmer shaped like the content. Errors are a sheet with a danger dot and danger text naming the problem.

## Motion and accessibility

The shared transition is 140ms `cubic-bezier(0.2, 0, 0, 1)` — 90ms for row hover — across colour, background, border, shadow and opacity. Workspace entry rises 3px while fading in. Nothing else animates, and nothing translates on hover.

Focus is a 2px pen outline at 2px offset; the workspace sub-rail uses its underline instead. Body and placeholder text hold at least 4.5:1. `prefers-reduced-motion: reduce` collapses every transition and animation to 1ms and freezes the skeleton shimmer.

## Do and Don't

### Do

- Keep the field flat and let the containers carry the structure.
- Spend space from the 4 / 8 / 16 / 32 ladder and nothing else.
- Group with proximity and hairlines before adding another container.
- Keep one radius, height and chip vocabulary across both workspaces.
- Right-align every figure and set column figures in the mono.
- Validate any chart-colour change with the palette validator at `--pairs all`.
- Preserve the meaning of status and data colours.

### Don't

- Do not put data, a table, or a paragraph directly on the field — those belong in a container. A section heading, its meta line, and a single text control may sit on it.
- Do not reintroduce a page-wide texture, lattice or pattern behind the containers.
- Do not nest a sheet inside a sheet. The readout strip and `tp-plot` already carry their own edge; wrapping either in a `card` is the bordered-box-in-a-bordered-box the thesis refuses.
- Do not tint a figure with its series colour; the mark beside it carries identity.
- Do not reuse a semantic colour for a category, or introduce a new hue for one.
- Do not lift a control on hover, add a third depth step, or use a shadow without both an offset and a blur.
- Do not use `faint` for text, or grey for secondary text on a coloured surface.
- Do not use gradients, gradient text, blur as decoration, a coloured `border-left` over 1px, or an eyebrow above a heading.
- Do not set any text above weight 600, or a control label above 500.
- Do not use unicode glyphs as icons; icons are drawn SVG at one stroke weight.
- Do not put two y-scales on one plot, or draw a dashed gridline. Smoothing is allowed only as monotone smoothing, which cannot overshoot a measured value; free smoothing that invents peaks is not.
- Do not render a duration as a parts-of-whole category split.
- Do not round a corner past the scale; 4px is the largest radius in the product.
- Do not change feature behavior, data flow, or business logic in the course of UI work.
