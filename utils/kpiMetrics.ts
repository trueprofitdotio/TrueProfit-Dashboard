import { PALETTE } from '../constants';
import { KpiTarget } from '../types';

export type KpiValueFormat = 'number' | 'currency';
export type KpiMetricGroup = 'Affiliate' | 'Influencer' | 'Merchant';

export interface KpiMetricDefinition {
  kpiName: string;
  label: string;
  shortLabel: string;
  group: KpiMetricGroup;
  description: string;
  color: string;
  format: KpiValueFormat;
  defaultSelected?: boolean;
}

export const KPI_METRICS: KpiMetricDefinition[] = [
  {
    kpiName: 'NonKOL Signups',
    label: 'NonKOL Signups',
    shortLabel: 'Signups',
    group: 'Affiliate',
    description: 'New non-KOL affiliates registered in Trackdesk.',
    color: PALETTE.signups,
    format: 'number',
    defaultSelected: true,
  },
  {
    kpiName: 'NonKOL Clicks',
    label: 'NonKOL Clicks',
    shortLabel: 'Clicks',
    group: 'Affiliate',
    description: 'Clicks from non-KOL affiliate sources.',
    color: PALETTE.clicks,
    format: 'number',
    defaultSelected: true,
  },
  {
    kpiName: 'NonKOL Installs',
    label: 'NonKOL Installs',
    shortLabel: 'NonKOL Installs',
    group: 'Affiliate',
    description: 'Install conversions from non-KOL affiliate sources.',
    color: PALETTE.installs,
    format: 'number',
  },
  {
    kpiName: 'KOL Installs',
    label: 'KOL Installs',
    shortLabel: 'KOL Installs',
    group: 'Influencer',
    description: 'Install conversions attributed to KOL sources.',
    color: '#B94646',
    format: 'number',
  },
  {
    kpiName: 'Total Installs',
    label: 'Total Installs',
    shortLabel: 'Installs',
    group: 'Affiliate',
    description: 'All install conversions across KOL and non-KOL sources.',
    color: '#8C4F2A',
    format: 'number',
  },
  {
    kpiName: 'KOL Viewcount',
    label: 'KOL Viewcount',
    shortLabel: 'Viewcount',
    group: 'Influencer',
    description: 'Quarterly view growth from tracked influencer videos.',
    color: PALETTE.revenue,
    format: 'number',
    defaultSelected: true,
  },
  {
    kpiName: 'Affiliate Revenue',
    label: 'Affiliate Revenue',
    shortLabel: 'Revenue',
    group: 'Affiliate',
    description: 'Revenue value from Trackdesk conversion reports.',
    color: PALETTE.payouts,
    format: 'currency',
  },
  {
    kpiName: 'Active Merchants',
    label: 'Active Merchants',
    shortLabel: 'Active',
    group: 'Merchant',
    description: 'Unique referred merchants with install or payout activity.',
    color: '#64748B',
    format: 'number',
  },
  {
    kpiName: 'Paying Merchants',
    label: 'Paying Merchants',
    shortLabel: 'Paying',
    group: 'Merchant',
    description: 'Unique merchants with payout activity in the period.',
    color: '#315D42',
    format: 'number',
  },
];

export const KPI_METRIC_NAMES = KPI_METRICS.map(metric => metric.kpiName);
export const DEFAULT_KPI_METRIC_NAMES = KPI_METRICS
  .filter(metric => metric.defaultSelected)
  .map(metric => metric.kpiName);

export const getKpiMetric = (kpiName: string): KpiMetricDefinition => (
  KPI_METRICS.find(metric => metric.kpiName === kpiName) || {
    kpiName,
    label: kpiName,
    shortLabel: kpiName,
    group: 'Affiliate',
    description: 'Custom KPI metric.',
    color: PALETTE.action,
    format: 'number',
  }
);

export const createEmptyKpiProgress = (): Record<string, number> => (
  Object.fromEntries(KPI_METRIC_NAMES.map(name => [name, 0]))
);

export const hasAnyTargetValue = (target: Pick<KpiTarget, 'q1_target' | 'q2_target' | 'q3_target' | 'q4_target'>): boolean => (
  Boolean(target.q1_target || target.q2_target || target.q3_target || target.q4_target)
);
