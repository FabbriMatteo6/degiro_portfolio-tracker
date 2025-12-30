'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { TimePeriod } from '@/types';

interface TimePeriodSelectorProps {
    selected: TimePeriod;
    onChange: (period: TimePeriod) => void;
}

export function TimePeriodSelector({ selected, onChange }: TimePeriodSelectorProps) {
    const periods: { value: TimePeriod; label: string }[] = [
        { value: 'YTD', label: 'YTD' },
        { value: '1Y', label: '1Y' },
        { value: '3Y', label: '3Y' },
        { value: '5Y', label: '5Y' },
        { value: 'ALL', label: 'All Time' },
    ];

    return (
        <div className="flex flex-wrap gap-2">
            {periods.map(({ value, label }) => (
                <Button
                    key={value}
                    variant={selected === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onChange(value)}
                    className={selected === value ? 'bg-primary' : ''}
                >
                    {label}
                </Button>
            ))}
        </div>
    );
}
