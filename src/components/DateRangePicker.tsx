'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRange } from '@/types';

interface DateRangePickerProps {
    range: DateRange | null;
    onChange: (range: DateRange | null) => void;
    minDate?: Date;
    maxDate?: Date;
    className?: string;
}

/**
 * Format a date to YYYY-MM-DD for input value
 */
function formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Parse a date string from input to Date object
 */
function parseInputDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * DateRangePicker Component
 * 
 * A popover-based date range picker for selecting custom time horizons.
 * Uses native HTML date inputs for maximum compatibility.
 */
export function DateRangePicker({
    range,
    onChange,
    minDate,
    maxDate,
    className = '',
}: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [startDate, setStartDate] = useState(range?.startDate ? formatDateForInput(range.startDate) : '');
    const [endDate, setEndDate] = useState(range?.endDate ? formatDateForInput(range.endDate) : '');
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync local state with prop changes
    useEffect(() => {
        if (range) {
            setStartDate(formatDateForInput(range.startDate));
            setEndDate(formatDateForInput(range.endDate));
        } else {
            setStartDate('');
            setEndDate('');
        }
    }, [range]);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleApply = () => {
        const start = parseInputDate(startDate);
        const end = parseInputDate(endDate);

        if (start && end && start <= end) {
            onChange({ startDate: start, endDate: end });
            setIsOpen(false);
        }
    };

    const handleClear = () => {
        setStartDate('');
        setEndDate('');
        onChange(null);
        setIsOpen(false);
    };

    const isValidRange = () => {
        const start = parseInputDate(startDate);
        const end = parseInputDate(endDate);
        return start && end && start <= end;
    };

    // Format display text
    const getDisplayText = () => {
        if (range) {
            const start = range.startDate.toLocaleDateString('it-IT');
            const end = range.endDate.toLocaleDateString('it-IT');
            return `${start} - ${end}`;
        }
        return 'Select dates';
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger Button */}
            <Button
                variant={range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="gap-2"
            >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">{range ? getDisplayText() : 'Custom'}</span>
                {range && (
                    <X
                        className="h-3 w-3 ml-1 opacity-70 hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                    />
                )}
            </Button>

            {/* Popover */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 z-50 p-4 bg-popover border rounded-lg shadow-lg min-w-[280px]">
                    <div className="space-y-4">
                        <h4 className="font-medium text-sm">Select Date Range</h4>

                        {/* Start Date */}
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Start Date</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                min={minDate ? formatDateForInput(minDate) : undefined}
                                max={endDate || (maxDate ? formatDateForInput(maxDate) : undefined)}
                                className="w-full"
                            />
                        </div>

                        {/* End Date */}
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">End Date</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate || (minDate ? formatDateForInput(minDate) : undefined)}
                                max={maxDate ? formatDateForInput(maxDate) : undefined}
                                className="w-full"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClear}
                                className="flex-1"
                            >
                                Clear
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleApply}
                                disabled={!isValidRange()}
                                className="flex-1"
                            >
                                Apply
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
