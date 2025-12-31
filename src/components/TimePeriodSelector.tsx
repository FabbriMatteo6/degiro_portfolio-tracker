'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/DateRangePicker';
import { TimePeriod, DateRange } from '@/types';

interface TimePeriodSelectorProps {
    selected: TimePeriod;
    onChange: (period: TimePeriod) => void;
    customRange?: DateRange | null;
    onCustomRangeChange?: (range: DateRange | null) => void;
    minDate?: Date;
    maxDate?: Date;
}

export function TimePeriodSelector({
    selected,
    onChange,
    customRange,
    onCustomRangeChange,
    minDate,
    maxDate,
}: TimePeriodSelectorProps) {
    const periods: { value: TimePeriod; label: string }[] = [
        { value: 'YTD', label: 'YTD' },
        { value: '1Y', label: '1Y' },
        { value: '3Y', label: '3Y' },
        { value: '5Y', label: '5Y' },
        { value: 'ALL', label: 'All Time' },
    ];

    const handleCustomRangeChange = (range: DateRange | null) => {
        if (range) {
            onChange('CUSTOM');
        }
        onCustomRangeChange?.(range);
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {periods.map(({ value, label }) => (
                <Button
                    key={value}
                    variant={selected === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                        onChange(value);
                        // Clear custom range when selecting preset
                        if (onCustomRangeChange) {
                            onCustomRangeChange(null);
                        }
                    }}
                    className={selected === value ? 'bg-primary' : ''}
                >
                    {label}
                </Button>
            ))}

            {/* Custom Date Range Picker */}
            {onCustomRangeChange && (
                <DateRangePicker
                    range={customRange ?? null}
                    onChange={handleCustomRangeChange}
                    minDate={minDate}
                    maxDate={maxDate}
                />
            )}
        </div>
    );
}
