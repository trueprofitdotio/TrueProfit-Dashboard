import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatDisplayDateGmt7, getBangkokDateParts, createBangkokDate } from '../utils/timeHelper';

interface CustomDatePickerProps {
    value: Date;
    onChange: (date: Date) => void;
}

// All formatting functions must use the target timezone (GMT+7) to ensure the UI is correct.
const formatMonthYear = (date: Date) => {
    return formatDisplayDateGmt7(date, { month: 'long', year: 'numeric' });
};

const formatShortDate = (date: Date): string => {
    return formatDisplayDateGmt7(date, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper to get a consistent YYYY-MM-DD string for a date in GMT+7, used for comparisons.
const toGmt7DateString = (date: Date): string => {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
};

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value || new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const dayButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const calendarGrid = useMemo(() => {
        // Derive the calendar's year and month from the viewDate's representation in GMT+7.
        const { year, month } = getBangkokDateParts(viewDate);

        const firstDayOfMonth = createBangkokDate(year, month, 1);
        const lastDayOfMonth = createBangkokDate(year, month + 1, 0);
        
        // We need days in month. 
        // createBangkokDate returns a Date object.
        // To get number of days, we can check the date of the last day.
        // getBangkokDateParts(lastDayOfMonth).day gives the number of days.
        const daysInMonth = getBangkokDateParts(lastDayOfMonth).day;
        
        // Start day of week. 
        // firstDayOfMonth is 00:00 GMT+7.
        // .getUTCDay() might be wrong if we rely on UTC.
        // We should use .getDay() in Bangkok timezone.
        const startDayOfWeek = new Date(firstDayOfMonth.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getDay();

        const grid: (Date | null)[] = [];
        // Fill blank days at the start
        for (let i = 0; i < startDayOfWeek; i++) {
            grid.push(null);
        }
        // Fill actual days.
        for (let i = 1; i <= daysInMonth; i++) {
            grid.push(createBangkokDate(year, month, i));
        }
        return grid;
    }, [viewDate]);
    
    const changeMonth = (offset: number) => {
        setViewDate(current => {
            const { year, month } = getBangkokDateParts(current);
            // Set day to 15 to avoid month-end issues when changing month
            return createBangkokDate(year, month + offset, 15);
        });
    };

    const handleSelectDate = (date: Date) => {
        onChange(date);
        setIsOpen(false);
    };

    const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
        if (!d1 || !d2) return false;
        // Compare dates by checking their YYYY-MM-DD string representation in GMT+7.
        // This correctly highlights `2024-02-02T00:00:00Z` (from grid) and `2024-02-01T17:00:00Z` (state value) as the same day.
        return toGmt7DateString(d1) === toGmt7DateString(d2);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white text-left p-2.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px]"
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <span className="text-slate-800">{formatShortDate(value)}</span>
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </button>

            {isOpen && (
                <div className="absolute z-20 mt-1 w-full sm:w-80 bg-white shadow-lg border border-slate-200 p-4">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100" aria-label="Previous month">&lt;</button>
                        <span className="font-semibold text-slate-800">{formatMonthYear(viewDate)}</span>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100" aria-label="Next month">&gt;</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-sm">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <div key={day} className="font-medium text-slate-500">{day}</div>)}
                        {calendarGrid.map((date, index) => (
                            date ? (
                                <button
                                    key={date.toISOString()}
                                    // FIX: The ref callback should not return a value. Using braces ensures an implicit return is avoided.
                                    ref={el => { dayButtonRefs.current[index] = el; }}
                                    onClick={() => handleSelectDate(date)}
                                    className={`w-10 h-10 flex items-center justify-center transition-colors duration-150
                                        ${isSameDay(date, value) ? 'bg-[var(--accent-color)] text-white font-bold' : ''}
                                        ${!isSameDay(date, value) ? 'hover:bg-emerald-50' : ''}
                                        ${isSameDay(date, new Date()) && !isSameDay(date, value) ? 'text-[var(--accent-color)] font-semibold' : ''}
                                    `}
                                >
                                    {date.getUTCDate()}
                                </button>
                            ) : <div key={`empty-${index}`} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomDatePicker;
