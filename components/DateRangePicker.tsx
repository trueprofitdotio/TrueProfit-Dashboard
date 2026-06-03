import React, { useState, useRef, useEffect, useMemo } from 'react';
import { shiftUtcToGmt7Start } from '../utils/timeHelper';

// Re-use timezone helpers to ensure consistency
const toGmt7DateString = (date: Date): string => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const formatShortDate = (date: Date): string => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });
const formatMonthYear = (date: Date): string => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

interface DateRangePickerProps {
    value: { from: Date; to: Date };
    onChange: (range: { from: Date; to: Date }) => void;
    onPresetSelect: (preset: string) => void;
}

const generateMonthGrid = (dateForMonth: Date) => {
    const year = Number(dateForMonth.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' }));
    const month = Number(dateForMonth.toLocaleDateString('en-US', { month: 'numeric', timeZone: 'Asia/Bangkok' })) - 1;

    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const daysInMonth = lastDay.getUTCDate();
    const startDayOfWeek = firstDay.getUTCDay();

    const grid: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) grid.push(null);
    for (let i = 1; i <= daysInMonth; i++) grid.push(new Date(Date.UTC(year, month, i)));
    
    return grid;
};

const presetColumns = [
    ['Today', 'Yesterday'],
    ['This Week', 'Last Week'],
    ['This Month', 'Last Month'],
    ['This Year', 'Last Year'],
    ['Lifetime']
];

const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange, onPresetSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value.from || new Date());
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setStartDate(null); 
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const nextMonthDate = useMemo(() => {
        const next = new Date(viewDate);
        const currentGmt7Month = Number(next.toLocaleDateString('en-US', { month: 'numeric', timeZone: 'Asia/Bangkok' })) - 1;
        next.setUTCMonth(currentGmt7Month + 1, 15);
        return next;
    }, [viewDate]);
    
    const leftMonthGrid = useMemo(() => generateMonthGrid(viewDate), [viewDate]);
    const rightMonthGrid = useMemo(() => generateMonthGrid(nextMonthDate), [nextMonthDate]);
    
    const changeMonth = (offset: number) => {
        setViewDate(current => {
            const newDate = new Date(current);
            const currentGmt7Month = Number(newDate.toLocaleDateString('en-US', { month: 'numeric', timeZone: 'Asia/Bangkok' })) - 1;
            newDate.setUTCMonth(currentGmt7Month + offset, 15);
            return newDate;
        });
    };

    const handleDateClick = (date: Date) => {
        if (!startDate) {
            setStartDate(date);
            setHoverDate(null); 
        } else {
            if (date < startDate) {
                setStartDate(date); 
            } else {
                onChange({ from: shiftUtcToGmt7Start(startDate), to: shiftUtcToGmt7Start(date) });
                setIsOpen(false);
                setStartDate(null);
                setHoverDate(null);
            }
        }
    };
    
    const handlePresetClick = (preset: string) => {
        onPresetSelect(preset);
        setIsOpen(false);
        setStartDate(null);
        setHoverDate(null);
    };

    const getDayClassNames = (date: Date | null): string => {
        if (!date) return 'invisible';
        const classes: string[] = ['w-10 h-10 flex items-center justify-center transition-colors duration-150'];
        const effectiveFrom = startDate || value.from;
        const effectiveTo = startDate ? hoverDate : value.to;
        const dateStr = toGmt7DateString(date);
        const fromStr = toGmt7DateString(effectiveFrom);
        const toStr = effectiveTo ? toGmt7DateString(effectiveTo) : null;
        const isStart = dateStr === fromStr;
        const isEnd = !!toStr && dateStr === toStr;
        const isInRange = !!toStr && dateStr > fromStr && dateStr < toStr;
        
        classes.push('hover:bg-emerald-50', 'rounded-full');
        if (isInRange) classes.push('bg-emerald-100', 'text-slate-800', 'rounded-none');
        if (isStart) {
            classes.push('bg-[var(--accent-color)]', 'text-white', 'font-bold');
            if (toStr && fromStr !== toStr) classes.push('rounded-l-full', 'rounded-r-none');
            else classes.push('rounded-full');
        }
        if (isEnd) {
             classes.push('bg-[var(--accent-color)]', 'text-white', 'font-bold');
             if (fromStr !== toStr) classes.push('rounded-r-full', 'rounded-l-none');
             else classes.push('rounded-full');
        }
        if (isStart || isEnd || isInRange) {
           const index = classes.indexOf('hover:bg-emerald-50');
           if (index > -1) classes.splice(index, 1);
        }
        return classes.join(' ');
    };

    const renderMonth = (grid: (Date|null)[], monthTitle: string) => (
        <div className="px-4">
            <div className="flex justify-between items-center mb-4">
                 <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Previous month">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="text-center font-semibold text-slate-800">{monthTitle}</div>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Next month">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-7 gap-x-1">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <div key={day} className="font-medium text-slate-500 w-10 h-10 flex items-center justify-center text-sm">{day}</div>)}
                {grid.map((date, index) => (
                    <div key={date ? date.toISOString() : `empty-${index}`} className="flex items-center justify-center">
                        <button disabled={!date} onClick={() => date && handleDateClick(date)} onMouseEnter={() => date && startDate && setHoverDate(date)} className={getDayClassNames(date)}>
                            {date?.getUTCDate()}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
    
    const formattedRange = `${formatShortDate(value.from)} - ${formatShortDate(value.to)}`;

    return (
        <div className="relative w-full" ref={containerRef}>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px] rounded-full px-5">
                <span className="text-slate-800">{formattedRange}</span>
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </button>

            {isOpen && (
                <div className="absolute z-20 mt-1 bg-white border border-[#bfdbfe]/50 p-4 rounded-2xl overflow-hidden" onMouseLeave={() => setHoverDate(null)}>
                    <div className="flex">
                        {renderMonth(leftMonthGrid, formatMonthYear(viewDate))}
                        <div className="border-l border-slate-200 mx-2"></div>
                        {renderMonth(rightMonthGrid, formatMonthYear(nextMonthDate))}
                    </div>
                    <div className="border-t border-slate-200 mt-4 pt-4">
                        <div className="grid grid-cols-5 gap-4">
                            {presetColumns.map((col, colIndex) => (
                                <div key={colIndex} className="flex flex-col space-y-2">
                                    {col.map(item => (
                                        <button key={item} onClick={() => handlePresetClick(item)} className="text-left text-sm text-slate-700 px-2 py-1.5 hover:bg-emerald-50 rounded-md">
                                            {item}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
