import React from 'react';

export const API_KEY = '2RG6k3b7b96qXzeSty7SbEkQKMgASchi';
export const API_BASE_URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : 'https://trueprofit.trackdesk.com';

/* The data ramp. Five hues spread across the wheel so no two series read as
   the same measure at a glance, and each one sits within a few points of the
   others in lightness so none of them shouts. Mirrors --tp-series-* in
   index.css; ECharts takes literals, so the two are kept in step by hand. */
export const PALETTE = {
  signups: '#1D6FD8',   // blue
  clicks: '#7C3AED',    // violet
  installs: '#D91A43',  // rose
  revenue: '#12A877',   // mint — money in, and the brand's own measure
  payouts: '#D97706',   // amber — money out
  action: '#23C48C',
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