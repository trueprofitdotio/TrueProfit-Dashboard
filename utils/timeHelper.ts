import { DateRange } from '../types';

// Constants
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
const TIMEZONE_GMT7 = 'Asia/Bangkok';

/**
 * Creates a Date object representing the start of the day (00:00:00.000) in GMT+7.
 * The resulting Date object, when converted to ISO string (UTC), will be 17:00:00.000 of the previous day.
 * 
 * @param date - A Date object or date string. The function uses the year/month/day of this date in GMT+7.
 * @returns Date object shifted to 00:00:00 GMT+7.
 */
export const toGmt7StartOfDay = (date: Date | string | number): Date => {
    const d = new Date(date);
    // Get the date string in YYYY-MM-DD format relative to GMT+7
    const dateStringInGmt7 = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_GMT7 });
    // Create a new Date using the GMT+7 offset
    return new Date(`${dateStringInGmt7}T00:00:00.000+07:00`);
};

/**
 * Creates a Date object representing the end of the day (23:59:59.999) in GMT+7.
 * 
 * @param date - A Date object or date string.
 * @returns Date object shifted to 23:59:59.999 GMT+7.
 */
export const toGmt7EndOfDay = (date: Date | string | number): Date => {
    const start = toGmt7StartOfDay(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
};

/**
 * Formats a date for display in GMT+7 timezone.
 * Default format: "MMM D, YYYY" (e.g., "Mar 20, 2024")
 * 
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 */
export const formatDisplayDateGmt7 = (date: Date | string | number | null): string => {
    if (!date) return 'N/A';
    const d = new Date(date);
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: TIMEZONE_GMT7
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const year = parts.find(p => p.type === 'year')?.value;
    return `${month}-${day}-${year}`;
};

/**
 * Helper to get the current time in GMT+7 as a Date object (representing the absolute timestamp).
 * Note: The Date object itself is timezone-agnostic (epoch), but this is useful if you need "now".
 */
export const nowGmt7 = (): Date => {
    return new Date();
};

/**
 * Converts a UTC-based calendar date (e.g., from DateRangePicker grid 00:00 UTC) 
 * to the corresponding start-of-day in GMT+7.
 * 
 * Example: Input 2024-03-20T00:00:00Z -> Output 2024-03-19T17:00:00Z (which is 2024-03-20 00:00 GMT+7)
 */
export const shiftUtcToGmt7Start = (utcDate: Date): Date => {
    return new Date(utcDate.getTime() - GMT7_OFFSET_MS);
};

/**
 * Returns the ISO string for the start of the day in GMT+7.
 * Useful for API filters.
 */
export const getGmt7StartIso = (date: Date): string => {
    return toGmt7StartOfDay(date).toISOString();
};

/**
 * Returns the ISO string for the end of the day in GMT+7.
 * Useful for API filters.
 */
export const getGmt7EndIso = (date: Date): string => {
    return toGmt7EndOfDay(date).toISOString();
};

export const getGmt7DateString = (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_GMT7 });
};

/**
 * Helper to get year, month, day of a date in GMT+7.
 */
export const getBangkokDateParts = (date: Date) => {
    const isoDate = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_GMT7 });
    const [year, month, day] = isoDate.split('-').map(Number);
    return { year, month: month - 1, day };
};

/**
 * Helper to create a Date object at 00:00 GMT+7 for a specific YMD.
 */
export const createBangkokDate = (year: number, month: number, day: number): Date => {
    // Create UTC date for 00:00
    const utcDate = new Date(Date.UTC(year, month, day));
    // Shift to GMT+7 00:00 (which is UTC -7h)
    return shiftUtcToGmt7Start(utcDate);
};

export const getPresetDateRange = (preset: string): DateRange => {
    const now = nowGmt7();
    const today = toGmt7StartOfDay(now);
    const { year, month, day } = getBangkokDateParts(today);
    
    // Helper to get day of week in Bangkok (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = new Date(today.toLocaleString('en-US', { timeZone: TIMEZONE_GMT7 })).getDay();

    switch (preset) {
        case 'Today':
            return { from: today, to: today };
        case 'Yesterday': {
            const yesterday = createBangkokDate(year, month, day - 1);
            return { from: yesterday, to: yesterday };
        }
        case 'This Week': {
            // Monday as start of week
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; 
            const startOfWeek = createBangkokDate(year, month, day - diff);
            return { from: startOfWeek, to: today };
        }
        case 'Last Week': {
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const startOfThisWeek = createBangkokDate(year, month, day - diff);
            const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
            const endOfLastWeek = new Date(startOfThisWeek.getTime() - 1 * 24 * 60 * 60 * 1000);
            return { from: startOfLastWeek, to: endOfLastWeek };
        }
        case 'This Month': {
            const startOfMonth = createBangkokDate(year, month, 1);
            return { from: startOfMonth, to: today };
        }
        case 'Last Month': {
            const startOfLastMonth = createBangkokDate(year, month - 1, 1);
            const endOfLastMonth = createBangkokDate(year, month, 0);
            return { from: startOfLastMonth, to: endOfLastMonth };
        }
        case 'This Year': {
            const startOfYear = createBangkokDate(year, 0, 1);
            return { from: startOfYear, to: today };
        }
        case 'Last Year': {
            const startOfLastYear = createBangkokDate(year - 1, 0, 1);
            const endOfLastYear = createBangkokDate(year - 1, 11, 31);
            return { from: startOfLastYear, to: endOfLastYear };
        }
        case 'Lifetime':
            return { from: createBangkokDate(2020, 0, 1), to: today };
        default:
            return { from: today, to: today };
    }
};

/**
 * Returns the start and end dates for a specific quarter in GMT+7.
 */
export const getQuarterDateRange = (year: number, quarter: number): { start: Date; end: Date } => {
    const startMonth = (quarter - 1) * 3;
    // Start of quarter: 1st day of startMonth at 00:00 GMT+7
    const start = createBangkokDate(year, startMonth, 1);
    
    // End of quarter: Last day of (startMonth + 2) at 23:59:59.999 GMT+7
    const endMonth = startMonth + 2;
    // createBangkokDate(year, endMonth + 1, 0) gives the start of the last day of the quarter
    const lastDayStart = createBangkokDate(year, endMonth + 1, 0);
    // Add 24h - 1ms to get end of day
    const end = new Date(lastDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    return { start, end };
};

/**
 * Returns current quarter information based on GMT+7 time.
 */
export const getQuarterInfo = () => {
    const now = new Date();
    // Get current year and month in GMT+7
    const { year, month } = getBangkokDateParts(now); // month is 0-indexed
    
    let quarter: 1 | 2 | 3 | 4;
    if (month < 3) quarter = 1;
    else if (month < 6) quarter = 2;
    else if (month < 9) quarter = 3;
    else quarter = 4;
    
    const { start, end } = getQuarterDateRange(year, quarter);
    
    // Calculate percentage passed
    // Ensure we don't divide by zero (though quarter length is never 0)
    const totalDuration = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const timePassedPercent = Math.max(0, Math.min(1, elapsed / totalDuration));
    
    return { quarter, year, start, timePassedPercent };
};

export const getBangkokParts = getBangkokDateParts;

/**
 * Calculates the percentage change between two numbers.
 * Returns Infinity if previous is 0 and current is positive.
 * Returns 0 if previous is 0 and current is 0 or negative.
 */
export const calculatePercentageChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? Infinity : 0;
    return ((current - previous) / previous) * 100;
};

export const getOrdinalSuffix = (i: number): string => {
    const j = i % 10,
        k = i % 100;
    if (j === 1 && k !== 11) {
        return "st";
    }
    if (j === 2 && k !== 12) {
        return "nd";
    }
    if (j === 3 && k !== 13) {
        return "rd";
    }
    return "th";
};
