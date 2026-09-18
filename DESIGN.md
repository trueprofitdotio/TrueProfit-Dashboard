---
name: TrueProfit Operations Workspace
description: A layered operating sheet — work happens on white sheets raised off a warm sage canvas
colors:
  canvas: "#EDF0EA"
  canvas-edge: "#E2E7DE"
  surface: "#FFFFFF"
  surface-sunken: "#F7F9F5"
  surface-hover: "#F2F6F2"
  rule: "#E6EAE3"
  rule-panel: "#DDE3D9"
  rule-strong: "#C8D3CC"
  ink: "#17211F"
  ink-2: "#2B3835"
  muted: "#5D6B67"
  meta: "#6C7A76"
  faint: "#93A09C"
  accent: "#176B5E"
  accent-strong: "#10544A"
  accent-soft: "#E8F1EE"
  positive: "#0E7350"
  warning: "#8A5709"
  danger: "#AD2138"
  info: "#1F5A96"
typography:
  family: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
  axis: "400-700 (variable); nothing in the UI exceeds 600"
  display:
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.028em"
  brand:
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.022em"
  brand-compact:
    fontSize: "16px"
    fontWeight: 600
  display-compact:
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.028em"
  sheet-title:
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.018em"
  nav:
    fontSize: "13.5px"
    fontWeight: 500
    letterSpacing: "-0.008em"
  control:
    fontSize: "13px"
    fontWeight: 500
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  data:
    fontSize: "13px"
    fontVariantNumeric: "tabular-nums"
  table-label:
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.005em"
  chip:
    fontSize: "12px"
    fontWeight: 550
  meta:
    fontSize: "11.5px"
    fontWeight: 400
  figure:
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.03em"
  figure-lg:
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-0.03em"
  figure-xl:
    fontSize: "32px"
    fontWeight: 600
    letterSpacing: "-0.03em"
rounded:
  hairline: "2px"
  focus: "3px"
  xs: "5px"
  dot: "6px"
  control: "7px"
  popup: "9px"
  overlay: "12px"
  sheet: "16px"
elevation:
  sheet: "0 1px 1px rgba(23,33,31,.035), 0 2px 6px -1px rgba(23,33,31,.05)"
  raised: "0 1px 2px rgba(23,33,31,.05), 0 6px 16px -4px rgba(23,33,31,.1)"
  overlay: "0 2px 4px -1px rgba(23,33,31,.06), 0 18px 40px -10px rgba(23,33,31,.16)"
  dialog: "0 4px 8px -2px rgba(23,33,31,.08), 0 32px 64px -16px rgba(23,33,31,.22)"
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
    textColor: "#FFFFFF"
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

TrueProfit is an internal operations workspace for affiliate performance, influencer management, deal proposals, progress tracking, and quarterly KPIs. The canvas is a warm sage ground that never carries text. All work — every figure, label, table row, and chart — sits on a white sheet raised off that ground by a hairline edge and a soft shadow. The layering is functional, not decorative: it guarantees that operational text is always read on a surface built for reading, and it tells the eye where one unit of work ends and the next begins.

This replaces an earlier flat treatment that placed text directly on the canvas. That version was quiet but hard to read, and it gave the eye nothing to group by; hierarchy came only from whitespace, which collapsed under real data density.

### Principles

- **The canvas is ground, never page.** No text, figure, table, or control renders directly on `canvas`. If content needs to be read, it belongs on a sheet.
- **One sheet deep.** A sheet holds content. Nested sheets are forbidden; a group inside a sheet uses `surface-sunken` with a hairline (`tp-inset`), or hairline dividers and proximity alone.
- **Depth is a two-step ladder.** Canvas → sheet for content; sheet → overlay for things that interrupt. There is no third step, and depth never signals importance, only plane.
- **Color is a reserved signal.** Green marks current location, focus, primary action, and genuine positive state. Every other color is semantic and data-owned.
- **Figures line up.** All numerals are tabular. Numeric columns right-align. A column of figures is read by comparing digits in place, so nothing may shift them.
- **Dense data stays legible and stays whole.** Tables scroll horizontally inside their sheet rather than truncating operational fields. A long free-text cell clamps to three lines with the full value in `title` and in its edit popover, so one verbose row cannot set the height of the table.
- **Movement confirms change.** 120–180ms ease-out on state change and page entry. Nothing else moves.

## Color

### Ground and surfaces

- **Canvas** `#EDF0EA` — the application ground. Warm sage, deliberately deeper than the sheets so white reads as raised.
- **Canvas edge** `#E2E7DE` — the seam where a full-bleed element (the app bar) meets the canvas.
- **Surface** `#FFFFFF` — every sheet, overlay, dialog, menu, and input.
- **Surface sunken** `#F7F9F5` — table heads, recessed groups inside a sheet, the message feed channel.
- **Surface hover** `#F2F6F2` — row and control hover. **Surface active** `#EAF1EC` — a held or open control.

### Rules

Three weights, each with a job: **rule** `#E6EAE3` for hairlines inside a sheet; **rule panel** `#DDE3D9` for a sheet's own edge; **rule strong** `#C8D3CC` for control edges (inputs, selects, filter triggers), with **rule stronger** `#B5C4BC` on hover. Never use a heavier rule to add emphasis.

### Ink ladder

Measured against `surface`: **ink** `#17211F` (15.8:1) for headings and key figures; **ink-2** `#2B3835` (11.4:1) for body and table cells; **muted** `#5D6B67` (5.6:1) for secondary labels; **meta** `#6C7A76` (4.6:1) for metadata and placeholders. **faint** `#93A09C` (2.9:1) is for dividers and small icon strokes only — never for text.

### Accent and semantics

**Accent** `#176B5E` (5.9:1 on white) with `accent-strong` `#10544A` for hover, `accent-ink` `#0D443C` for text on a soft accent field, `accent-soft` `#E8F1EE` as a field, and `accent-rule` `#BCD6CF` as its edge. Semantic pairs follow the same shape: positive `#0E7350`, warning `#8A5709`, danger `#AD2138`, info `#1F5A96`, each with a soft field and a rule.

### Named rule: Reserved Signal

Green is not a wash. It marks current navigation, keyboard focus, the primary action, and real positive state. Status colors tied to data keep their meaning and are never repurposed for layout. A user-created custom tag hashes into the existing chip variants — it can never introduce a new hue.

## Typography

**Instrument Sans**, with Helvetica Neue and Arial as fallbacks. One family carries everything; there is no display pairing. Fixed px steps, never fluid — this is viewed at a consistent desk.

Its variable axis runs **400–700 only**, and the interface deliberately uses just three stops: **400** for body and data, **500** for every control label, **600** for headings, table labels, and figures. Nothing is set above 600. Hierarchy therefore comes from **size, colour, and spacing** — not from weight. A bold button is not more important than a heading, and the old build's habit of shouting every label in 650–800 flattened the page into one loud plane.

Because the face is narrow, headings take real negative tracking (-0.018em to -0.03em) while 11.5px table labels take a hair of *positive* tracking (0.005em) to stay open at that size.

- **Brand:** 18px / 600 / -0.022em (16px on mobile).
- **Page title:** 22px / 600 / -0.028em (19px on mobile).
- **Sheet title:** 15px / 600 / -0.018em. Sentence case.
- **Navigation:** 13.5px / 500; the active route steps to 600.
- **Control labels (buttons, filters, fields):** 13px / 500.
- **Body and table cells:** 14px / 400 / 1.5. Compact data cells run 12.5–13px.
- **Table heading:** 11.5px / 600 / +0.005em, sentence case. Never all-caps, never widely tracked.
- **Chip:** 12px / 550.
- **Metadata:** 11.5px / 400, in `meta`. 11px is the hard floor for any text in the product.
- **Figure:** 26–32px / 600 / -0.03em, tabular.

## Layout

The app bar is full-bleed white, sticky, with a `canvas-edge` bottom rule and sheet elevation: brand on the left, the three workspace routes on the right, both sitting on the bar's baseline so the active underline reads as a tab. Below it the frame centers at max 1560px with a 20px desktop gutter (14px mobile).

Inside a workspace, sections are sheets separated by 24px. The Influencer area adds a sub-navigation rail on the canvas — text labels over a `canvas-edge` rule — above its sheets.

A sheet is padded 24px. A sheet whose content reaches its own edge (a table, a media feed) is flush: `overflow: hidden`, no padding, an optional 16px/20px header strip with a hairline under it, and the content in its own `overflow-x: auto` container.

On mobile the app bar stacks brand over navigation, both nav rails scroll horizontally without a visible scrollbar, filters stack, and tables keep horizontal scroll. Content is never silently dropped to make a layout fit.

## Components

### Navigation

Text labels with a 2px accent underline for the active route, and `aria-current="page"`. The label carries the hierarchy; no icon beside every destination. Keyboard focus reuses the underline rather than adding a competing outline.

### Sheets

`card` / `tp-sheet` is the reading surface: white, 16px radius, 1px `rule-panel` edge, sheet elevation. `tp-sheet-flush` clips its content to that radius. `tp-inset` is the only nested container: `surface-sunken`, 12px radius, 1px `rule`.

### Tables

Collapsed borders. The head is `surface-sunken`, 11.5px/700 in `muted`, sentence case, with a hairline under it. Cells are 12px/16px with a hairline above each row except the first; rows hover to `surface-hover`. Numeric columns are right-aligned and tabular. A sortable header shows its arrow permanently, tinted accent when it is the active sort. A filterable column carries a funnel button beside its label that opens a checkbox menu; when a filter is narrowing the data the button holds an accent field so the state is visible without opening it, and the sheet header reports what is shown and what is hidden.

### Buttons and fields

Primary: accent field, white text, 7px radius, 40px tall, sheet elevation, rising 1px on hover to `accent-strong`. Secondary: `tp-btn-quiet` — white, `rule-strong` edge, 32px. Fields and filter triggers are white with a `rule-strong` edge, 7px radius, 40px tall; focus moves the edge to accent and adds a 3px `accent-soft` ring. Every control in the app shares this one radius and height vocabulary.

### Chips

`tp-chip` is the single classification form: 24px tall, 5px radius, 12px/650, a hairline edge and a soft field. Variants are `positive`, `danger`, `warning`, `info`, `accent`, and a neutral default. An interactive chip is a `button` and gains elevation on hover. Status, tier, and custom tags all use it — there is no second badge shape.

### Overlays

Menus and popovers: white, 12px radius, `rule-panel` edge, overlay elevation. Dialogs: 16px radius, dialog elevation. Sidebars are full-height, square, with a left `rule-panel` edge and dialog elevation. Overlays are portaled so no `overflow` ancestor can clip them.

### Screenshot rail

Every image in a discussion thread is also indexed in a rail pinned to the foot of the feed, above the composer: a label, a count, and 34px thumbs on one horizontally scrolling track. It exists so nobody scrolls back through a long thread hunting for a screenshot someone posted earlier. The rail is one tab stop with roving focus — Left/Right move between thumbs, Enter opens the lightbox, and the lightbox then takes Left/Right for the rest of the set.

The same images surface in the proposal table's Audience insight column, alongside screenshots uploaded there directly. The two sources read as one set but stay distinguishable: a discussion-sourced tile carries an accent edge and a small message badge, and has no delete control, because the thread owns it. Uploaded tiles keep theirs.

### Message feed and attachment albums

The feed is a `surface-sunken` channel so bubbles read as raised. A bubble is `fit-content` with a max of `min(84%, 380px)`; a bubble carrying media locks to `min(84%, 320px)` so image-heavy and text-only messages share the same left and right edge.

Attachments render as a uniform album, never at natural size. One image keeps its own proportion clamped to 0.8–1.78 so neither a tall screenshot nor a panorama distorts the feed. Two, three, or four-plus images use square tiles in a 2, 3, or 2×2 grid with a 3px gutter and `object-fit: cover`; beyond four, the fourth tile carries a `+N` overlay. The lightbox always walks the complete set with arrow keys and on-screen controls, so nothing folded behind `+N` becomes unreachable.

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
- Do not use a shadow without both an offset and a soft blur, and do not add a third depth step.
- Do not use `faint` for text, or gray for secondary text on a colored surface.
- Do not use gradients, gradient text, blur as decoration, a colored `border-left` over 1px, or an eyebrow above a heading.
- Do not introduce a new hue for a category; hash into the existing chip variants.
- Do not let an attachment render at its natural size inside a bubble.
- Do not set any text above weight 600, and do not set a control label above 500.
- Do not use tiny all-caps labels with wide tracking; sentence case at 11.5px/600 is the label voice.
- Do not change feature behavior, data flow, business logic, or data-backed status semantics in the course of UI work.
