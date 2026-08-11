---
name: TrueProfit Operations Workspace
description: A quiet operating sheet for affiliate, influencer, and KPI workflows
colors:
  primary: "#176B5E"
  neutral-bg: "#FBFBF8"
  neutral-surface: "#FFFFFF"
  ink: "#1C2826"
  muted: "#687572"
  rule: "#E5EAE7"
  hover: "#F1F5F3"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  micro:
    fontSize: "9px"
  caption:
    fontSize: "10px"
  table-label:
    fontSize: "11px"
  metadata:
    fontSize: "13px"
  compact-display:
    fontSize: "21px"
rounded:
  control: "5px"
  popup: "6px"
spacing:
  compact: "8px"
  control: "16px"
  section: "36px"
  page: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  field:
    backgroundColor: "{colors.neutral-surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.control}"
---

# Design System: TrueProfit Operations Workspace

## Overview

**Creative North Star: "Quiet Operating Sheet"**

TrueProfit is an internal operations workspace for affiliate performance, influencer management, proposals, progress tracking, and KPIs. It uses an open, nearly-white canvas where hierarchy comes from deliberate type, spacing, alignment, and only the minimum necessary control affordance. The interface should feel quick to scan and dependable under dense operational data, not decorative or card-driven.

### Principles

- **Purpose before decoration.** Every visible element must support navigation, decision-making, input, feedback, or status.
- **Whitespace carries structure.** Do not wrap ordinary sections in panels merely to separate them.
- **Color is a reserved signal.** Use the green accent for current location, keyboard focus, and meaningful positive or active states. Keep other colors semantic and data-owned.
- **Dense data stays legible.** Tables remain open and horizontally scroll when necessary on small screens rather than truncating operational fields.
- **Movement confirms change.** Navigation and state changes use a short, subtle entrance or hover response, never theatrical motion.

## Color

- **Canvas** `#FBFBF8`: the continuous application background.
- **Surface** `#FFFFFF`: inputs, menus, dialogs, and other components that need a physical control surface.
- **Ink** `#1C2826`: headings, body text, and primary actions.
- **Muted** `#687572`: secondary labels and less prominent metadata.
- **Rule** `#E5EAE7`: a quiet field edge or popup boundary only where an affordance needs it.
- **Active Green** `#176B5E`: active navigation underline, focus, and intentional positive emphasis.
- **Hover** `#F1F5F3`: lightweight row or control hover feedback.
- **Control Rule** `#C9D4CF`: the slightly stronger edge reserved for filters and select triggers.
- **Control Hover** `#B9C8C2`: a filter trigger's hover edge.
- **Recessed Surface** `#F7F9F8`: a quiet, functional message-feed background only.
- **Utility Ink** `#2B3B38`: primary-action hover state.
- **Muted Detail** `#72807C` and `#A1ADAA`: placeholder and breadcrumb-detail text.
- **Chart Values** `#94A3B8`, `#10B981`, and `#004D40`: existing chart labels, positive series, and deep data emphasis.

### Named Rule: Reserved Signal

Green is not a decorative wash. It signals the current navigation state, focus, or a semantic positive state. Status colors already tied to data retain their meaning and must not be repurposed for layout.

## Typography

Use Manrope with Arial as fallback. Keep letter spacing at `0`.

- **App and page title:** 24px, 700, 1.1 line height.
- **Section heading:** 18-24px, 650-700, according to available space.
- **Navigation and control labels:** 14px, 600.
- **Body and table content:** 14px, 400, 1.5 line height.
- **Table heading:** 11px, 650, sentence case. Do not use tiny, widely tracked, all-caps labels.

## Layout

The main frame is centered at a maximum width of 1560px with a 20px desktop gutter and a 14px mobile gutter. The application header establishes the product and work context. Primary tabs follow as a text navigation row with an underline for the current destination. The Influencer area adds a plain-text breadcrumb and a local sub-navigation row.

Page sections are open layouts. Separate unrelated groups with a clear vertical rhythm, usually 36px, rather than colored bands, borders, or nested cards. Tables are not enclosed in a decorative panel; row spacing and a subdued hover state make scanning easier.

On mobile, navigation rows can scroll horizontally, filter controls stack naturally, and data tables retain horizontal scrolling. Content must never be silently dropped to make a layout fit.

## Components

### Navigation

Use text labels with a 2px green underline for the active route. The label itself carries the hierarchy; avoid decorative icons alongside every destination. Keyboard focus mirrors the active underline instead of adding a competing outline.

### Buttons

Primary commands use the ink background with white text and a 5px radius. Hover is a short color change with a 1px upward movement. Secondary actions remain text-first or use an existing familiar icon only where it improves recognition.

### Fields and Filters

Inputs, selects, and textareas use a white surface, a single quiet `#E5EAE7` edge, and a 5px radius. A green edge indicates focus. Filter groups should read as a compact working row, not a toolbar inside a container.

Filter and dropdown triggers are the deliberate exception: because they change the dataset, their white control surface carries a clearer `#C9D4CF` 1px edge and a 6px radius. Open menus use the same edge with an 8px radius. Do not promote this treatment to ordinary read-only content.

### Tables and Statuses

Tables use type alignment, restrained row spacing, and a pale green hover state. Do not add a table card or heavy grid. Existing status chips may keep their data-meaning colors; they are classification, not layout decoration.

### Menus, Dialogs, and Sidebars

Overlays are white surfaces with a quiet 1px rule and a maximum 6px radius. Never use drop shadows, blur, colored backdrops, or oversized rounded shells to create depth. A sidebar can use a thin left rule to establish its boundary.

## Motion and Accessibility

Use the shared 160-180ms ease-out transition for color, opacity, border, transform, and page entry. Page and workspace changes may rise 5px while fading in. Respect `prefers-reduced-motion` by reducing all transitions and animations to near-instant.

All interactive elements need a visible focus state. Use a 2px green outline for normal controls. App and workspace navigation use their underline as the focus indicator.

## Do and Don't

### Do

- Use whitespace and consistent alignment to group content.
- Keep a single icon library and use icons only for established, compact actions.
- Preserve the meaning of status and data colors.
- Keep overlay treatment restrained and functional.

### Don't

- Do not use cards, colored section backgrounds, or borders as ordinary layout scaffolding.
- Do not add shadows, blur, gradients, decorative emoji, or ornamental icons.
- Do not turn navigation or filters into pill collections.
- Do not change feature behavior, data flow, business logic, or data-backed status semantics in the course of UI work.
