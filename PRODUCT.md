# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

product

## Users
TrueProfit's affiliate team, managers, and partners who need to analyze signup counts, clicks, installs, revenue, payouts, and influencer video content performance.

## Product Purpose
A dense, fast-reading analytics dashboard for monitoring affiliate performance, tracking payouts, and evaluating influencer video campaigns. It is parked on a second monitor and glanced at through the day, so a reading has to land in one look.

## Positioning
Unifies two sources that no single tool shows together: Trackdesk affiliate/click/conversion data and Supabase-tracked KOL video performance. Checking Trackdesk or Supabase directly gives partial pictures; this dashboard is the one place that puts affiliate performance and influencer content performance in a single view.

## Operating Context
- Affiliate data (signups, clicks, conversions, payouts, affiliate tiers) originates in Trackdesk and is materialised into Supabase as normalised rows (`td_affiliates`, `td_clicks`, `td_conversions`) by a sync worker, so the dashboard reads pre-aggregated SQL rather than paging the API.
- Influencer/KOL video data (videos, KOLs, view-count metrics over time) is stored in and pulled from Supabase.
- The app is organized into two workspaces reflecting these data sources: Affiliate and Influencer.
- Affiliates are partitioned into KOL tiers ("KOL (Old Offer)", "KOL (New Offer)", "Standard") versus everyone else.

## Capabilities and Constraints
- Internal-only tool for TrueProfit's own affiliate team, managers, and partners. Affiliates and partners are analyzed in the data but do not log in or view the dashboard themselves; there is no external/customer-facing use case to support.
- Read-oriented for affiliate data: it displays Trackdesk figures and does not edit them. Influencer deals, proposals and discussion threads are editable in place.

## Brand Personality
Precise and instrument-like. The product reads as measuring equipment rather than as a report: a ruled working ground, one ink, and figures given the room to be compared rather than decorated.

## Anti-references
- The rounded-card KPI grid every analytics tool ships: five floating tiles, each boxed away from the numbers it exists to be compared against.
- Heavy container drop-shadows and over-rounded borders.
- Colour sprayed across figures with no rule tying a hue to a meaning.
- Dark modes: this is a daylit desk, and only the light theme is supported.

## Design Principles
- **Figures are the product.** Density is a feature, not a cost: this is read all day by people who already know where to look. Nothing may make a column of numbers harder to compare, and no information already on screen may be dropped to tidy a layout.
- **Colour is a reserved signal.** One indigo pen marks the live route, focus and the primary action. Every other colour belongs to a data series or a state, and text wears text tokens rather than its series colour.
- **Measure in the open.** The ruled ground shows through wherever something is plotted and is masked wherever something is read.
- **Human-Centric Copy**: Express metrics and instructions in clear, conversational language without jargon or marketing buzzwords.

## Evidence on Hand
Real, live data only: Trackdesk affiliate/click/conversion data materialised into Supabase, plus a Supabase backend (`videos`, `kols`, `collaborations` tables). No fabricated demo data, testimonials, or case studies exist or should be introduced.

## Product Principles
- **Tier segmentation is central**: KOL vs. non-KOL affiliate tier should stay a first-class lens on every relevant view, not just an incidental filter.

## Accessibility & Inclusion
- Contrast ratio of at least 4.5:1 for body and data text against backgrounds.
- High-contrast placeholders and input borders to aid form interaction.
- Chart series are validated with the data-viz palette validator at `--pairs all`, never judged by eye, and no state is ever carried by colour alone.
- Strict support for `@media (prefers-reduced-motion: reduce)` to disable transitions or fall back to crossfades.
