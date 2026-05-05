import { API_KEY, API_BASE_URL } from '../constants';
import { Affiliate, ClickReportRow, ConversionReportRow } from '../types';

const defaultHeaders = {
  'accept': 'application/json',
  'content-type': 'application/json',
  'x-tenant-id': 'trueprofit',
  'x-api-key': API_KEY,
};

// NOTE: A CORS proxy might be required to run this in a browser environment.
// This implementation assumes the TrackDesk server is configured to allow requests from this app's origin.

async function postData<T,>(endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed with status ${response.status}: ${errorText}`);
  }

  return response.json();
}

interface PaginatedResponse<T> {
    rows?: T[];
    affiliates?: T[];
    pagination: {
        totalCount: number;
        hasMore: boolean;
    };
}

async function fetchPaginatedData<T>(endpoint: string, bodyWithoutPagination: object): Promise<T[]> {
    let allResults: T[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 500; // Use the max allowed limit

    while (hasMore) {
        const body = {
            ...bodyWithoutPagination,
            pagination: {
                limit,
                offset,
            },
        };

        const response = await postData<PaginatedResponse<T>>(endpoint, body);
        
        const results = response.rows || response.affiliates || [];
        allResults = [...allResults, ...results];
        
        hasMore = response.pagination?.hasMore || false;
        offset += limit;
    }

    return allResults;
}

export async function fetchAffiliates(filters: object = {}): Promise<{ affiliates: Affiliate[] }> {
    const affiliates = await fetchPaginatedData<Affiliate>('/api/node/affiliates/v1', { filters });
    return { affiliates };
}

export async function fetchClickReport(timeRange: { from: string; to: string }, filters: object = {}): Promise<{ rows: ClickReportRow[] }> {
    const rows = await fetchPaginatedData<ClickReportRow>('/api/reports/click-report/v1', { filters: { timeRange, ...filters } });
    return { rows };
}

export async function fetchConversionReport(timeRange: { from: string; to: string } | null, filters: object = {}): Promise<{ rows: ConversionReportRow[] }> {
    const reportFilters: Record<string, unknown> = { ...filters };
    if (timeRange) {
        reportFilters.timeRange = timeRange;
    }
    const rows = await fetchPaginatedData<ConversionReportRow>('/api/reports/conversion-report/v1', { filters: reportFilters });
    return { rows };
}