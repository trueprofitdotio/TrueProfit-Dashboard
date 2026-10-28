import React from 'react';

export const API_KEY = '2RG6k3b7b96qXzeSty7SbEkQKMgASchi';
export const API_BASE_URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : 'https://trueprofit.trackdesk.com';

/* The data ramp. Five hues validated with the data-viz palette validator at
   --pairs all, because the daily trace puts all five on one plot and the
   top-affiliate view splits them into small multiples — both arrangements
   make every pair adjacent to every other. Worst pair is ΔE 10.3 under
   deuteranopia and 18.9 under normal vision, clearing the 8 target and the
   15 floor. Mirrors --tp-series-* in index.css; ECharts takes literals, so
   the two are kept in step by hand.

   Revenue is drawn with the brand pen: it is the measure the whole product
   exists to move, and the ink that marks the live route is the right one to
   draw it with. Clicks takes the cyan — present, but the quietest hue on
   the plot, which suits bulk volume rather than an outcome.

   Any change here is re-validated with that script, never judged by eye. */
export const PALETTE = {
  signups: '#35802B',   // green
  clicks: '#0E9AC2',    // cyan — the recessive bulk measure
  installs: '#DE4A6B',  // rose
  revenue: '#4954BC',   // indigo — money in, drawn with the brand pen
  payouts: '#DFA022',   // amber — money out
  action: '#4954BC',
};

/* Chart chrome. The plot sits on the board's own lattice, so its gridlines
   are the ruled paper rather than a second set of lines drawn over it. */
export const CHART_FONT = {
  ui: 'Archivo, system-ui, sans-serif',
  narrow: 'Archivo Narrow, Archivo, system-ui, sans-serif',
  mono: 'Roboto Mono, ui-monospace, monospace',
};

export const CHART_INK = {
  grid: '#E6E9F4',
  axis: '#C2C8DC',
  label: '#6E7488',
  text: '#2B2F3D',
  surface: '#FFFFFF',
};

export const ArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);

export const ArrowDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);