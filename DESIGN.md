---
name: TrueProfit Affiliate Dashboard
description: A warm, nature-inspired editorial dashboard for TrueProfit partners
colors:
  primary: "#23C48C"
  neutral-bg: "#F8F9FA"
  neutral-card: "#FFFFFF"
  neutral-border: "rgba(191, 219, 254, 0.5)"
  sage: "#657C6A"
  rose: "#F75270"
  gold: "#E9A319"
  navy: "#05339C"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "10px 32px"
  card-container:
    backgroundColor: "{colors.neutral-card}"
    rounded: "{rounded.sm}"
    padding: "24px"
---

# Design System: TrueProfit Affiliate Dashboard

## 1. Overview

**Creative North Star: "The Botanical Archive"**

The TrueProfit Affiliate Dashboard is a visual analytics workspace designed around a nature-inspired aesthetic. It frames data density with generous breathing room, fine dewy borders, and a warm, organic color palette. Rather than creating a cold, clinical, or mechanical interface, this design emphasizes approachability, balance, and human comfort.

This system explicitly rejects heavy container drop-shadows, clunky high-contrast grids, aggressive animations, and clinical dark modes. Instead, pages represent structured sheets, organizing complex financial data and conversion metrics into clear, flat containers defined by soft, light-blue outlines.

**Key Characteristics:**
- **Tactile Softness**: Interactive triggers and inputs use pill-shaped rounded profiles to invite touch.
- **Organic Visual Rhythm**: A harmonious balance of sage green, rose red, and marigold gold accents set against structured alabaster pages.
- **Delicate Outlining**: Flat layout sections framed by thin, semi-transparent border lines instead of heavy elevation shadows.

---

## 2. Colors

This palette is structured around soft, organic tones that represent the growth, activity, and health of the TrueProfit affiliate ecosystem.

### Primary
- **Vibrant Laurel** (`#23C48C`): The primary action and positive click accent. Represents growth, vitality, and primary user interactions.

### Neutral
- **Off-white Linen** (`#F8F9FA`): The warm, matte page canvas color. Offers a comfortable background for long analytical sessions.
- **Pure Lily** (`#FFFFFF`): The card and panel surface color. Renders sections as clean sheets on the linen background.
- **Morning Dew** (`rgba(191, 219, 254, 0.5)`): The primary light-blue outline color used to establish structure.

### Secondary Accents
- **Sage Leaf** (`#657C6A`): Used for signups and registration metrics. A calm, grounded green.
- **Rose Petal** (`#F75270`): Used for installs and click-install conversion series. A warm, floral red.
- **Marigold Gold** (`#E9A319`): Used for payouts and reward indicators. A warm, golden honey tone.
- **Midnight Iris** (`#05339C` / `#2236ba`): Used for revenue highlights and high-importance headers.

### Named Rules
**The Dewy Frame Rule.** Surfaces are never divided by harsh dark rules or heavy shadows. Sections are bound by 1px Morning Dew borders (`rgba(191, 219, 254, 0.5)`) to keep the interface soft, lightweight, and structured.

---

## 3. Typography

**Display Font:** Inter, sans-serif  
**Body Font:** Inter, sans-serif  

The typography utilizes a single font family in multiple weights to preserve simplicity. It creates hierarchy by pairing heavy weights and tight tracking for titles with regular weights and open leading for data lines.

### Hierarchy
- **Display** (ExtraBold (800), `2.25rem` / `36px`, line-height `1.2`, letter-spacing `-0.02em`): Used for main page headers.
- **Headline** (Bold (700), `1.125rem` / `18px`, line-height `1.4`): Used for section headers (e.g., Merchants Details, Performance Trend).
- **Title** (SemiBold (600), `0.875rem` / `14px`, line-height `1.4`): Used for list headers, card subtitles, and table headers.
- **Body** (Regular (400), `1rem` / `16px`, line-height `1.5`): Used for descriptive copy and paragraph blocks (line length capped at 75ch).
- **Label** (SemiBold (600), `0.75rem` / `12px`, letter-spacing `0.05em`): Used for table cells, values, and button text.

---

## 4. Elevation

The Botanical Archive operates on a flat-by-default design philosophy. Depth is communicated through color contrast and outline borders, not through volumetric drop-shadows.

### Named Rules
**The Flat-By-Default Rule.** Shadows are forbidden on cards, metric blocks, popovers, and dropdown menus. Elevated elements (like date picker calendars and custom select lists) use solid white surfaces outlined by 1px Morning Dew borders (`rgba(191, 219, 254, 0.5)`) and sit atop a layered z-index context (`z-10` to `z-20`).

---

## 5. Components

### Buttons
- **Shape**: Fully rounded pill shape (`rounded-full`, `9999px`).
- **Primary**: Laurel green background (`#23C48C`) with white text and padding of `10px 32px`.
- **States**: Gentle opacity shift on hover; ring indicator on focus.

### Cards / Containers
- **Corner Style**: Rounded corners (`rounded-xl`, `12px` or `rounded-sm`, `8px`).
- **Background**: Pure Lily (`#FFFFFF`).
- **Borders**: 1px solid Morning Dew (`rgba(191, 219, 254, 0.5)`).
- **Shadow Strategy**: Zero shadow.

### Inputs / Fields
- **Style**: White background, 1px border stroke, rounded-full trigger button with `10px 20px` internal padding.
- **Focus**: ring-1 with Vibrant Laurel (`#23C48C`).
- **Dropdown List Popover**: Absolute positioning, white background, `rounded-2xl` (16px), bordered with `rgba(191, 219, 254, 0.5)`, overflow hidden.

---

## 6. Do's and Don'ts

### Do:
- **Do** frame all cards and dropdown lists with a 1px solid border of color `rgba(191, 219, 254, 0.5)`.
- **Do** use fully rounded pill shapes (`rounded-full`) for main buttons, date picker buttons, and select boxes.
- **Do** use a linear gradient on click charts with a bottom opacity of `0.6`.
- **Do** preserve the stacked order of charts where `Installs` sits at the bottom and `Clicks` on top.

### Don't:
- **Don't** use `box-shadow` or container shadows on cards, metric blocks, or filter dropdowns.
- **Don't** use side-stripe borders as colored accents on metrics or tables.
- **Don't** use tiny tracked all-caps eyebrows above headings.
- **Don't** pair a soft drop shadow with a border on the same container.
