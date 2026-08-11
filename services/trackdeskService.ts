import { supabaseClient } from './supabaseClient';
import { API_KEY, API_BASE_URL } from '../constants';
import { Affiliate, ClickReportRow, ConversionReportRow } from '../types';

// In-memory cache for fast repeat requests (5-minute TTL)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function postData<T>(endpoint: string, body: object, refresh: boolean = false): Promise<T> {
  const cacheKey = `${endpoint}_${JSON.stringify(body)}`;
  const cached = memoryCache.get(cacheKey);
  
  if (!refresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  let resultData: T;

  try {
    // Primary: Route via Supabase Edge Function 'trackdesk-proxy'
    const { data, error } = await supabaseClient.functions.invoke('trackdesk-proxy', {
      body: { endpoint, body, refresh }
    });

    if (error || !data || data.error) {
      throw new Error(error?.message || data?.error || 'Edge function call failed');
    }

    resultData = data;
  } catch (edgeError) {
    console.warn('Trackdesk Edge Proxy failed, falling back to direct API fetch:', edgeError);
    
    // Fallback: Direct API call if edge function is unreachable
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-tenant-id': 'trueprofit',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed with status ${response.status}: ${errorText}`);
    }

    resultData = await response.json();
  }

  memoryCache.set(cacheKey, { data: resultData, timestamp: Date.now() });
  return resultData;
}

interface PaginatedResponse<T> {
  rows?: T[];
  affiliates?: T[];
  pagination: {
    totalCount: number;
    hasMore: boolean;
  };
}

async function fetchPaginatedData<T>(endpoint: string, bodyWithoutPagination: object, refresh: boolean = false): Promise<T[]> {
  let allResults: T[] = [];
  let hasMore = true;
  let offset = 0;
  const limit = 500; // Use max allowed limit for speed

  while (hasMore) {
    const body = {
      ...bodyWithoutPagination,
      pagination: { limit, offset },
    };

    const response = await postData<PaginatedResponse<T>>(endpoint, body, refresh);
    const results = response.rows || response.affiliates || [];
    allResults = [...allResults, ...results];
    
    hasMore = response.pagination?.hasMore || false;
    offset += limit;
  }

  return allResults;
}

export async function fetchAffiliates(filters: object = {}, refresh: boolean = false): Promise<{ affiliates: Affiliate[] }> {
  const affiliates = await fetchPaginatedData<Affiliate>('/api/node/affiliates/v1', { filters }, refresh);
  return { affiliates };
}

export async function fetchClickReport(timeRange: { from: string; to: string }, filters: object = {}, refresh: boolean = false): Promise<{ rows: ClickReportRow[] }> {
  const rows = await fetchPaginatedData<ClickReportRow>('/api/reports/click-report/v1', { filters: { timeRange, ...filters } }, refresh);
  return { rows };
}

export async function fetchConversionReport(timeRange: { from: string; to: string } | null, filters: object = {}, refresh: boolean = false): Promise<{ rows: ConversionReportRow[] }> {
  const reportFilters: Record<string, unknown> = { ...filters };
  if (timeRange) {
    reportFilters.timeRange = timeRange;
  }
  const rows = await fetchPaginatedData<ConversionReportRow>('/api/reports/conversion-report/v1', { filters: reportFilters }, refresh);
  return { rows };
}