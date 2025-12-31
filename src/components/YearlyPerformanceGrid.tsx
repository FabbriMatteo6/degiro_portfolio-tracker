'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatPercent, formatCurrency } from '@/lib/utils/format';
import { YearlyReturn } from '@/lib/calculations/calculateYearlyTWR';

interface YearlyPerformanceGridProps {
    yearlyReturns: YearlyReturn[];
    loading?: boolean;
}

/**
 * Get color for a performance square based on TWR value
 * Green gradients for positive, red gradients for negative
 */
function getPerformanceColor(twr: number): string {
    const percent = twr * 100;

    if (percent >= 30) return 'bg-green-700';
    if (percent >= 20) return 'bg-green-600';
    if (percent >= 10) return 'bg-green-500';
    if (percent >= 5) return 'bg-green-400';
    if (percent > 0) return 'bg-green-300';
    if (percent === 0) return 'bg-gray-300 dark:bg-gray-600';
    if (percent >= -5) return 'bg-red-300';
    if (percent >= -10) return 'bg-red-400';
    if (percent >= -20) return 'bg-red-500';
    if (percent >= -30) return 'bg-red-600';
    return 'bg-red-700';
}

/**
 * Get text color for contrast on the colored background
 */
function getTextColor(twr: number): string {
    const percent = Math.abs(twr * 100);
    // Darker backgrounds need white text
    if (percent >= 20 || twr < 0 && percent >= 10) {
        return 'text-white';
    }
    return 'text-gray-900 dark:text-white';
}

/**
 * Performance square component for a single year
 */
function YearSquare({
    data,
    isSelected,
    onSelect
}: {
    data: YearlyReturn;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const bgColor = getPerformanceColor(data.twr);
    const textColor = getTextColor(data.twr);
    const isPositive = data.twr >= 0;

    return (
        <button
            onClick={onSelect}
            className={`
                relative flex flex-col items-center justify-center
                w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24
                rounded-lg transition-all duration-200
                ${bgColor} ${textColor}
                hover:scale-105 hover:shadow-lg
                ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
                ${data.isPartialYear ? 'opacity-80' : ''}
            `}
            title={`${data.year}: ${formatPercent(data.twr)} (${formatCurrency(data.absoluteGain)})`}
        >
            <span className="text-xs font-medium opacity-80">{data.year}</span>
            <span className="text-sm sm:text-base md:text-lg font-bold">
                {isPositive ? '+' : ''}{(data.twr * 100).toFixed(1)}%
            </span>
            {data.isPartialYear && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full" title="Partial year" />
            )}
        </button>
    );
}

/**
 * Yearly Performance Grid Component
 * 
 * Displays a grid of squares representing annual portfolio performance (TWR).
 * Color-coded: green for gains, red for losses, intensity scales with magnitude.
 */
export function YearlyPerformanceGrid({ yearlyReturns, loading }: YearlyPerformanceGridProps) {
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [legendOpen, setLegendOpen] = useState(false);

    const selectedData = selectedYear
        ? yearlyReturns.find(r => r.year === selectedYear)
        : null;

    if (loading) {
        return (
            <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Annual Performance
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 animate-pulse">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="w-20 h-20 bg-muted rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (yearlyReturns.length === 0) {
        return (
            <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Annual Performance
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        No yearly performance data available. Make sure ticker mappings are configured.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Annual Performance
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Performance Grid */}
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    {yearlyReturns.map(data => (
                        <YearSquare
                            key={data.year}
                            data={data}
                            isSelected={selectedYear === data.year}
                            onSelect={() => setSelectedYear(
                                selectedYear === data.year ? null : data.year
                            )}
                        />
                    ))}
                </div>

                {/* Selected Year Details */}
                {selectedData && (
                    <div className="p-4 rounded-lg bg-muted/50 border">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-lg">{selectedData.year} Performance</h4>
                            {selectedData.isPartialYear && (
                                <span className="text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded">
                                    Partial Year
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">TWR Return</p>
                                <p className={`font-bold ${selectedData.twr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {selectedData.twr >= 0 ? '+' : ''}{formatPercent(selectedData.twr)}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Absolute Gain</p>
                                <p className={`font-bold ${selectedData.absoluteGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {selectedData.absoluteGain >= 0 ? '+' : ''}{formatCurrency(selectedData.absoluteGain)}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Start Value</p>
                                <p className="font-medium">{formatCurrency(selectedData.startValue)}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">End Value</p>
                                <p className="font-medium">{formatCurrency(selectedData.endValue)}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Collapsible Legend */}
                <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-muted-foreground text-xs gap-1">
                            <Info className="h-3 w-3" />
                            How is this calculated?
                            {legendOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                        <div className="p-4 rounded-lg bg-muted/30 border text-sm space-y-3">
                            <div>
                                <h5 className="font-medium mb-1">Time-Weighted Return (TWR)</h5>
                                <p className="text-muted-foreground text-xs">
                                    Each square shows the annual TWR, which measures your investment performance
                                    independent of cash flow timing. TWR removes the impact of deposits and
                                    withdrawals, showing pure investment skill.
                                </p>
                            </div>

                            <div>
                                <h5 className="font-medium mb-2">Color Scale</h5>
                                <div className="flex flex-wrap gap-1">
                                    <span className="px-2 py-1 text-xs rounded bg-red-700 text-white">&lt;-30%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-red-500 text-white">-20%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-red-300 text-gray-900">-5%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-gray-300 text-gray-900">0%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-green-300 text-gray-900">+5%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-green-500 text-white">+10%</span>
                                    <span className="px-2 py-1 text-xs rounded bg-green-700 text-white">&gt;+30%</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                                <span>Yellow dot indicates a partial year (started investing mid-year)</span>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </CardContent>
        </Card>
    );
}
