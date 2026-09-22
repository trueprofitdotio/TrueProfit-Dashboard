---
name: TrueProfit Operations Workspace
description: A layered operating sheet — white sheets on a bright porcelain canvas, signalled by the brand mint
colors:
  canvas: "#F4F7F6"
  canvas-edge: "#E6EBE9"
  surface: "#FFFFFF"
  surface-sunken: "#F7FAF9"
  surface-hover: "#F2F7F5"
  rule: "#ECF0EE"
  rule-panel: "#E1E7E5"
  rule-strong: "#C9D2CE"
  ink: "#0F1613"
  ink-2: "#262E2B"
  muted: "#5A635F"
  meta: "#6A736F"
  faint: "#9BA5A1"
  accent: "#23C48C"
  accent-strong: "#12A877"
  accent-ink: "#0B7C57"
  on-accent: "#0F1613"
  accent-soft: "#E6F9F1"
  accent-field: "#DAF7EB"
  positive: "#0B7C57"
  warning: "#B45309"
  danger: "#D91A43"
  info: "#1A65C8"
  series: "#12A877, #1D6FD8, #58A3D0, #D97706, #D91A43, #0891B2"
typography:
  family: "Inter, system-ui, Segoe UI, Helvetica, Arial, sans-serif"
  axis: "400-700 (variable), opsz 14-32; nothing in the UI exceeds 600"
  display:
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.021em"
  brand:
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.012em"
  brand-compact:
    fontSize: "16px"
    fontWeight: 600
  display-compact:
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.021em"
  sheet-title:
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.012em"
  nav:
    fontSize: "13.5px"
    fontWeight: 500
    letterSpacing: "-0.006em"
  control:
    fontSize: "13px"
    fontWeight: 500
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  data:
    fontSize: "13px"
    fontVariantNumeric: "tabular-nums"
  table-label:
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.012em"
  chip:
    fontSize: "12px"
    fontWeight: 550
  meta:
    fontSize: "11.5px"
    fontWeight: 400
  figure:
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  figure-lg:
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  figure-xl:
    fontSize: "32px"
    fontWeight: 600
    letterSpacing: "-0.025em"
rounded:
  hairline: "2px"
  focus: "3px"
  xs: "5px"
  dot: "6px"
  control: "7px"
  popup: "9px"
  overlay: "12px"
  sheet: "16px"
  pill: "999px"
elevation:
  sheet: "0 1px 1px rgba(15,22,19,.035), 0 2px 6px -1px rgba(15,22,19,.055)"
  raised: "0 1px 2px rgba(15,22,19,.05), 0 6px 16px -4px rgba(15,22,19,.1)"
  overlay: "0 2px 4px -1px rgba(15,22,19,.06), 0 18px 40px -10px rgba(15,22,19,.16)"
  dialog: "0 4px 8px -2px rgba(15,22,19,.08), 0 32px 64px -16px rgba(15,22,19,.22)"
spacing:
  base: "4px"
  compact: "8px"
  control: "16px"
  sheet-padding: "24px"
  section: "24px"
  page: "64px"
components:
  sheet:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-panel}"
    rounded: "{rounded.sheet}"
    boxShadow: "{elevation.sheet}"
    padding: "{spacing.sheet-padding}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "40px"
  field:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.control}"
    height: "40px"
  chip:
    height: "24px"
    rounded: "{rounded.xs}"
    fontSize: "12px"
    fontWeight: 550
---

# Design System: TrueProfit Operations Workspace

## Overview

**Creative North Star: "Layered Operating Sheet"**

TrueProfit is an internal operations workspace for affiliate performance, influencer management, deal proposals, progress tracking, and quarterly KPIs. The canvas is a bright porcelain ground that never carries text. All work — every figure, label, table row, and chart — sits on a white sheet raised off that ground by a hairline edge and a soft shadow. The layering is functional, not decorative: it guarantees that operational text is always read on a surface built for reading, and it tells the eye where one unit of work ends and the next begins.

The ground was a warm sage until the palette was refreshed; sage plus a muted teal-green accent read as vintage rather than current. Porcelain is a brighter ground that makes white sheets read as raised without any warmth of its own, and the signal on it is TrueProfit's own mint, `#23C48C`.

An earlier flat treatment placed text directly on the canvas. That version was quiet but hard to read, and it gave the eye nothing to group by; hierarchy came only from whitespace, which collapsed under real data density.

### Principles

- **The canvas is ground, never page.** No text, figure, table, or control renders directly on `canvas`. If content needs to be read, it belongs on a sheet.
- **One sheet deep.** A sheet holds content. Nested sheets are forbidden; a group inside a sheet uses `surface-sunken` with a hairline (`tp-inset`), or hairline dividers and proximity alone.
- **Depth is a two-step ladder.** Canvas → sheet for content; sheet → overlay for things that interrupt. There is no third step, and depth never signals importance, only plane.
- **Color is a reserved signal.** The mint marks current location, focus, the primary action, and genuine positive state. Every other color is semantic and data-owned.
- **The mint is a fill, never an ink.** White text on `#23C48C` reads at 2.25:1 and the mint itself reads at 2.25:1 on white. It therefore only ever fills a large shape, and that shape's label is near-black. Accent text and thin accent graphics use the two darker steps below.
- **Figures line up.** All numerals are tabular. Numeric columns right-align. A column of figures is read by comparing digits in place, so nothing may shift them.
- **Dense data stays legible and stays whole.** Tables scroll horizontally inside their sheet rather than truncating operational fields. A long free-text cell clamps to three lines with the full value in `title` and in its edit popover, so one verbose row cannot set the height of the table.
- **Movement confirms change.** 120–180ms ease-out on state change and page entry. Nothing else moves.

## Color

### Ground and surfaces

- **Canvas** `#F4F7F6` — the application ground. Bright porcelain carrying the faintest green cast so it sits under the mint without turning sage, and deliberately deeper than the sheets so white reads as raised.
- **Canvas edge** `#E6EBE9` — the seam where a full-bleed element (the app bar) meets the canvas.
- **Surface** `#FFFFFF` — every sheet, overlay, dialog, menu, and input.
- **Surface sunken** `#F7FAF9` — table heads, recessed groups inside a sheet, the message feed channel.
- **Surface hover** `#F2F7F5` — row and control hover. **Surface active** `#E8F6F0` — a held or open control.

### Rules

Three weights, each with a job: **rule** `#ECF0EE` for hairlines inside a sheet; **rule panel** `#E1E7E5` for a sheet's own edge; **rule strong** `#C9D2CE` for control edges (inputs, selects, filter triggers), with **rule stronger** `#B0BCB7` on hover. Never use a heavier rule to add emphasis.

### Ink ladder

Measured against `surface`: **ink** `#0F1613` (18.4:1) for headings and key figures; **ink-2** `#262E2B` (13.9:1) for body and table cells; **muted** `#5A635F` (6.2:1) for secondary labels; **meta** `#6A736F` (4.9:1) for metadata and placeholders. **faint** `#9BA5A1` (2.5:1) is for dividers and small icon strokes only — never for text. Every step carries the ink's own green cast, including the shadows, so nothing on the page is neutral grey.

### Accent and semantics

The brand mint is bright — bright enough that it fails as text and fails under white text — so the accent is three steps and each has exactly one job. Reaching for the wrong one is how this palette breaks.

| Step | Value | On white | Use |
|---|---|---|---|
| `accent` | `#23C48C` | 2.25:1 | **Fills only.** Buttons, the sender's chat bubble, count badges. Its label is `on-accent`. |
| `accent-strong` | `#12A877` | 3.05:1 | Hover fill, and every thin graphic that must survive on white: the active tab underline, progress fills, field focus borders, the mint chart series. |
| `accent-ink` | `#0B7C57` | 5.2:1 | Accent **text** and icons on a light surface, and focus outlines. |

`on-accent` `#0F1613` is the label on an accent fill (8.2:1) — never white. `accent-soft` `#E6F9F1` is the accent as a field, `accent-field` `#DAF7EB` one step in for a selected row or date, and `accent-rule` `#A7E3CB` is its edge.

Semantic pairs follow the same shape: positive `#0B7C57`, warning `#B45309`, danger `#D91A43`, info `#1A65C8`, each with a soft field and a rule.

### Data ramp

Charts draw from six hues spread across the wheel — mint `#12A877`, blue `#1D6FD8`, steel `#58A3D0`, amber `#D97706`, rose `#D91A43`, cyan `#0891B2` — each clearing 3:1 on white so a line or a bar stays visible, and held close enough in lightness that no series shouts over another. Note the mint here is `accent-strong`, not the brand fill: a 2.5px line in `#23C48C` would disappear against the sheet. In the affiliate views they carry fixed meanings: revenue mint, signups blue, clicks steel, payouts amber, installs rose. ECharts takes literal hex, so `constants.tsx` and `--tp-series-*` in `index.css` are kept in step by hand.

Slot three was violet `#7C3AED` until it was measured: against the signups blue it separated by only 3.5 ΔE under deuteranopia and 14.7 under normal vision, so two of the five affiliate series were effectively one colour. The steel blue that replaced it clears both floors (16.0 normal, 8.3 on the worst CVD pair) and is the quietest hue on the plot, which suits its measure — clicks is bulk volume, not an outcome. **Any change to this ramp is validated with the data-viz palette validator, not by eye.**

### Named rule: Reserved Signal

The mint is not a wash. It marks current navigation, keyboard focus, the primary action, and genuine positive state. Because the brand *is* green, positive deliberately reuses `accent-ink` rather than introducing a second, near-identical green; the two never collide because they never take the same form — a primary action is a bright accent **fill** with a dark label, positive state is deep green **text** on a pale field. Status colors tied to data keep their meaning and are never repurposed for layout. A user-created custom tag hashes into the existing chip variants — it can never introduce a new hue.

## Typography

**Inter**, served from Google Fonts with its `opsz` axis (14–32) and `font-optical-sizing: auto`, so large text tightens its own fit instead of being hand-corrected. System UI faces are the fallback stack. One family carries everything; there is no display pairing. Fixed px steps, never fluid — this is viewed at a consistent desk.

Its variable axis runs **400–700 only**, and the interface deliberately uses just three stops: **400** for body and data, **500** for every control label, **600** for headings, table labels, and figures. Nothing is set above 600. Hierarchy therefore comes from **size, colour, and spacing** — not from weight. A bold button is not more important than a heading, and the old build's habit of shouting every label in 650–800 flattened the page into one loud plane.

Inter is wider and larger on the body than the face it replaced, so every tracking step sits a notch looser than the one it inherited: headings take -0.012em to -0.025em, and 11.5px table labels take *positive* tracking (0.012em) to stay open at that size.

- **Brand:** 18px / 600 / -0.018em (16px on mobile).
- **Page title:** 22px / 600 / -0.021em (19px on mobile).
- **Sheet title:** 15px / 600 / -0.012em. Sentence case.
- **Navigation:** 13.5px / 500 / -0.006em; the active route steps to 600.
- **Control labels (buttons, filters, fields):** 13px / 500.
- **Body and table cells:** 14px / 400 / 1.5 / -0.006em. Compact data cells run 12.5–13px.
- **Table heading:** 11.5px / 600 / +0.012em, sentence case. Never all-caps, never widely tracked.
- **Chip:** 12px / 550.
- **Metadata:** 11.5px / 400, in `meta`. 11px is the hard floor for any text in the product.
- **Figure:** 26–32px / 600 / -0.025em, tabular.

## Layout

The app bar is full-bleed white, sticky, with a `canvas-edge` bottom rule and sheet elevation. It is a three-track grid whose outer tracks are equal, so the workspace switcher sits on the bar's true centre line however wide the brand runs; the brand holds the left track and the right one is deliberately empty ballast. Below 900px the two stack, both centred. Below it the frame centers at max 1560px with a 20px desktop gutter (14px mobile).

Inside a workspace, sections are sheets separated by 24px. The Influencer area adds a sub-navigation rail on the canvas — text labels over a `canvas-edge` rule — above its sheets.

A sheet is padded 24px. A sheet whose content reaches its own edge (a table, a media feed) is flush: `overflow: hidden`, no padding, an optional 16px/20px header strip with a hairline under it, and the content in its own `overflow-x: auto` container.

On mobile the app bar stacks brand over navigation, both nav rails scroll horizontally without a visible scrollbar, filters stack, and tables keep horizontal scroll. Content is never silently dropped to make a layout fit.

## Components

### Navigation

The three workspaces are not three links to three pages; they are three states of one workspace, and only one can be on at a time. The top-level switcher is therefore a **segmented capsule** parked on the app bar's centre: a `surface-sunken` track with a `rule-panel` hairline at `pill` radius, holding one raised white segment at sheet elevation for the active route, its label in `ink` at 600 with a 5px `accent-strong` dot that grows in beside it. Segments are 32px tall, `aria-current="page"` and `aria-selected`, and focus takes the standard 2px accent outline. It replaced an underlined text rail, which read as navigation away rather than as a switch between states.

The **workspace sub-rail** (Influencer's own views) keeps the underlined form: text labels with a 2px `accent-strong` underline, focus reusing that underline. Two capsules stacked would read as one control nested inside another; the rail stays visibly subordinate.

### Sheets

`card` / `tp-sheet` is the reading surface: white, 16px radius, 1px `rule-panel` edge, sheet elevation. `tp-sheet-flush` clips its content to that radius. `tp-inset` is the only nested container: `surface-sunken`, 12px radius, 1px `rule`.

### Tables

Collapsed borders. The head is `surface-sunken`, 11.5px/700 in `muted`, sentence case, with a hairline under it. Cells are 12px/16px with a hairline above each row except the first; rows hover to `surface-hover`. Numeric columns are right-aligned and tabular. A sortable header shows its arrow permanently, tinted accent when it is the active sort. A filterable column carries a funnel button beside its label that opens a checkbox menu; when a filter is narrowing the data the button holds an accent field so the state is visible without opening it, and the sheet header reports what is shown and what is hidden.

### Buttons and fields

Primary: accent field, near-black `on-accent` label (white would be 2.25:1), 7px radius, 40px tall, sheet elevation, rising 1px on hover to `accent-strong`. Secondary: `tp-btn-quiet` — white, `rule-strong` edge, 32px. Fields and filter triggers are white with a `rule-strong` edge, 7px radius, 40px tall; focus moves the edge to accent and adds a 3px `accent-soft` ring. Every control in the app shares this one radius and height vocabulary.

### Chips

`tp-chip` is the single classification form: 24px tall, 5px radius, 12px/650, a hairline edge and a soft field. Variants are `positive`, `danger`, `warning`, `info`, `accent`, and a neutral default. An interactive chip is a `button` and gains elevation on hover. Status, tier, and custom tags all use it — there is no second badge shape.

### Overlays

Menus and popovers: white, 12px radius, `rule-panel` edge, overlay elevation. Dialogs: 16px radius, dialog elevation. Sidebars are full-height, square, with a left `rule-panel` edge and dialog elevation. Overlays are portaled so no `overflow` ancestor can clip them.

### Screenshot dock

Every image in a discussion thread is also indexed in a dock that floats over the bottom-right corner of the message feed, a hair above the composer. It exists so nobody scrolls back through a long thread hunting for a screenshot someone posted earlier.

It floats rather than sitting in the feed's flow. In the flow it landed directly under the last message, so on a short thread it stranded a band of empty feed between itself and the composer and read as though it belonged to neither. Anchored to the feed's bottom edge it holds one constant distance from the box you are typing in.

Closed it is a 34px capsule — a count and the three most recent thumbs, shingled — covering one corner of one bubble and nothing else. Clicking opens it into a panel carrying the full 38px track. The capsule is one tab stop; opening moves focus into the track, where Left/Right walk the thumbs and Enter opens the lightbox (which then takes Left/Right for the rest of the set), and Escape closes the panel and returns focus to the capsule. The feed keeps its scroll everywhere the dock is not: only the chip itself takes pointer events.

The same images surface in the proposal table's Audience insight column, alongside screenshots uploaded there directly. The two sources read as one set but stay distinguishable: a discussion-sourced tile carries an accent edge and a small message badge, and has no delete control, because the thread owns it. Uploaded tiles keep theirs.

### Message feed and attachment albums

The feed is a `surface-sunken` channel so bubbles read as raised. A bubble is `fit-content` with a max of `min(84%, 380px)`; a bubble carrying media locks to `min(84%, 320px)` so image-heavy and text-only messages share the same left and right edge.

Attachments render as a uniform album, never at natural size. One image keeps its own proportion clamped to 0.8–1.78 so neither a tall screenshot nor a panorama distorts the feed. Two, three, or four-plus images use square tiles in a 2, 3, or 2×2 grid with a 3px gutter and `object-fit: cover`; beyond four, the fourth tile carries a `+N` overlay. The lightbox always walks the complete set with arrow keys and on-screen controls, so nothing folded behind `+N` becomes unreachable.

### Charts

**One plot, one y-axis — always.** Two measures of different scale never share a plot on two scales: where the count axis is pinned against the dollar axis is arbitrary, so every crossing the eye reads as correlation is an artefact of that choice. The affiliate views take the two ways out of it. The daily trend re-bases every measure onto a single index axis where 100 is that measure's own average day, smoothed over 7 days because the underlying counts are small enough that integer jitter otherwise swamps the signal; the tooltip carries the actual figures so re-basing hides nothing. The top-affiliates view splits into **small multiples** — one horizontal-bar panel per measure, all sharing one row order — so each measure gets the axis it deserves and the reader compares across a row.

Marks are thin and the chrome recedes: bars cap at 13px with a 4px rounded data-end and a square baseline, lines are 2px and unsmoothed (smoothing invents readings between two days that were never measured), markers are 8px with a 2px surface ring, and gridlines are solid `rule` hairlines — never dashed, which reads as a threshold. A legend is always present for two or more series and never for one, where the panel title already names the measure. Values and labels wear text tokens; the coloured mark beside them carries identity.

### Empty, loading, and error states

Empty: `tp-empty` — a centered title in `ink` and a body under 34ch in `muted` that says what to do next, not "nothing here". Loading in place of content is `tp-skeleton` shimmer shaped like the content, not a spinner. Errors are a sheet with a danger dot and danger text naming the problem.

## Motion and accessibility

The shared transition is 180ms `cubic-bezier(0.16, 1, 0.3, 1)` — 120ms for row hover — across color, background, border, shadow, opacity, and transform. Page and workspace entry rises 5px while fading in. Nothing else animates.

Focus is a 2px accent outline at 2px offset; app and workspace navigation use their underline instead. Body and placeholder text hold at least 4.5:1. `prefers-reduced-motion: reduce` collapses every transition and animation to 1ms and freezes the skeleton shimmer.

## Do and Don't

### Do

- Put every readable thing on a sheet.
- Group with proximity and hairlines before adding another container.
- Keep one radius, height, and chip vocabulary across all four workspaces.
- Right-align and tabularize every figure.
- Preserve the meaning of status and data colors.
- Clamp long free text and keep the full value reachable.

### Don't

- Do not render text on the canvas, and do not nest a sheet inside a sheet.
- Do not put white text on the accent, do not use the accent as a text colour, and do not draw a hairline or a chart line in it. Those are `on-accent`, `accent-ink` and `accent-strong` respectively.
- Do not use a shadow without both an offset and a soft blur, and do not add a third depth step.
- Do not use `faint` for text, or gray for secondary text on a colored surface.
- Do not use gradients, gradient text, blur as decoration, a colored `border-left` over 1px, or an eyebrow above a heading.
- Do not introduce a new hue for a category; hash into the existing chip variants.
- Do not let an attachment render at its natural size inside a bubble.
- Do not set any text above weight 600, and do not set a control label above 500.
- Do not use tiny all-caps labels with wide tracking; sentence case at 11.5px/600 is the label voice.
- Do not put two y-scales on one plot, smooth a line over real measurements, or draw a dashed gridline.
- Do not add or re-colour a chart series without running the palette validator; "these look different enough" is how slot three stayed broken.
- Do not change feature behavior, data flow, business logic, or data-backed status semantics in the course of UI work.
