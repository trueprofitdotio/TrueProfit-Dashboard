# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

product

## Users
TrueProfit's affiliate team, managers, and partners who need to analyze signup counts, clicks, installs, revenue, payouts, influencer video content performance, and KPI runrate status.

## Product Purpose
A clean, visual analytics dashboard designed to monitor and manage affiliate performance, track payouts, evaluate video campaigns, and map progress against quarterly targets.

## Positioning
Unifies three sources that no single tool shows together: Trackdesk affiliate/click/conversion data, Supabase-tracked KOL video performance, and internally set quarterly KPI targets. Checking Trackdesk or Supabase directly gives partial pictures; this dashboard is the one place that combines affiliate performance, influencer content performance, and KPI runrate into a single view.

## Operating Context
- Affiliate data (signups, clicks, conversions, payouts, affiliate tiers) is pulled live from the Trackdesk API.
- Influencer/KOL video data (videos, KOLs, view-count metrics over time) and KPI targets (`kpi_targets` table, set per quarter) are stored in and pulled from Supabase.
- The app is organized into three workspaces reflecting these data sources: Affiliate, Influencer, and KPI Runrate.
- KPI progress is evaluated per calendar quarter against targets set in advance in Supabase, partitioning affiliates into KOL tiers ("KOL (Old Offer)", "KOL (New Offer)", "Standard") versus everyone else.

## Capabilities and Constraints
- Internal-only tool for TrueProfit's own affiliate team, managers, and partners. Affiliates and partners are analyzed in the data but do not log in or view the dashboard themselves; there is no external/customer-facing use case to support.
- Read-oriented: displays live data from Trackdesk and Supabase; it does not edit affiliate or KPI records.

## Brand Personality
Warm, friendly, and editorial. Evokes an approachable, elegant, and comfortable visual atmosphere through soft color harmonies, refined typography, and breathing room (relaxed spacing) rather than clinical, cramped data density.

## Anti-references
- Saturated SaaS blue/gray dashboards with high visual noise.
- Cramped data grids and tiny, illegible font sizes.
- Cold, clinical dark modes that feel mechanical rather than editorial.
- Heavy container drop-shadows and over-rounded borders.

## Design Principles
- **Editorial Breathing Room**: Use generous, intentional spacing and clear typographic hierarchy (using scale and weight contrast) to reduce cognitive load.
- **Friendly Precision**: Render charts and tables with clear, high-contrast, yet soft-toned colors, framed by clean pastel borders.
- **Human-Centric Copy**: Express metrics and instructions in clear, conversational language without jargon or marketing buzzwords.

## Evidence on Hand
Real, live data only: the Trackdesk API (affiliates, clicks, conversions) and a Supabase backend (`videos`, `kols`, `kpi_targets` tables). No fabricated demo data, testimonials, or case studies exist or should be introduced.

## Product Principles
- **Tier segmentation is central**: KOL vs. non-KOL affiliate tier should stay a first-class lens on every relevant view, not just an incidental filter.

## Accessibility & Inclusion
- Contrast ratio of at least 4.5:1 for body and data text against backgrounds.
- High-contrast placeholders and input borders to aid form interaction.
- Strict support for `@media (prefers-reduced-motion: reduce)` to disable transitions or fall back to crossfades.
