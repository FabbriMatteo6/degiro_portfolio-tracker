'use client';

import React from 'react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';

interface PerformanceChartProps {
    data: {
        date: string;
        portfolio: number;
        sp500: number;
        msciWorld: number;
        deposit?: number;
    }[];
    showBenchmarks: boolean;
    showDeposits?: boolean;
}

export function PerformanceChart({ data, showBenchmarks, showDeposits = false }: PerformanceChartProps) {
    const formatXAxis = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    };

    const formatTooltipValue = (value: number) => formatCurrency(value);

    // Find max deposit for secondary Y-axis scaling
    const maxDeposit = Math.max(...data.map(d => d.deposit || 0), 1000);

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle>Portfolio Performance</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatXAxis}
                                className="text-xs"
                            />
                            <YAxis
                                yAxisId="left"
                                tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                                className="text-xs"
                            />
                            {showDeposits && (
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    domain={[0, maxDeposit * 2]}
                                    tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                                    className="text-xs"
                                />
                            )}
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                }}
                                labelFormatter={(label) => new Date(String(label)).toLocaleDateString('it-IT')}
                                formatter={(value, name) => [
                                    formatTooltipValue(Number(value)),
                                    String(name) === 'deposit' ? 'Deposit' : String(name)
                                ]}
                            />
                            <Legend />

                            {/* Deposits as bars (behind everything) */}
                            {showDeposits && (
                                <Bar
                                    yAxisId="right"
                                    dataKey="deposit"
                                    name="Deposits"
                                    fill="#3b82f6"
                                    opacity={0.3}
                                    radius={[4, 4, 0, 0]}
                                />
                            )}

                            {/* Portfolio line */}
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="portfolio"
                                name="Portfolio"
                                stroke="#10b981"
                                strokeWidth={3}
                                dot={false}
                                activeDot={{ r: 6 }}
                            />

                            {/* Benchmark lines */}
                            {showBenchmarks && (
                                <>
                                    <Line
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="sp500"
                                        name="S&P 500"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                    <Line
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="msciWorld"
                                        name="MSCI World"
                                        stroke="#8b5cf6"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                </>
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

interface AllocationChartProps {
    data: { name: string; value: number; percentage: number }[];
    title: string;
    colors?: string[];
}

export function AllocationPieChart({ data, title, colors }: AllocationChartProps) {
    const defaultColors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
        '#6366f1', '#f97316', '#14b8a6', '#ef4444', '#84cc16',
    ];
    const chartColors = colors || defaultColors;

    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {data.map((item, index) => (
                        <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                                    />
                                    <span>{item.name}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-muted-foreground">
                                        {item.percentage.toFixed(1)}%
                                    </span>
                                    <span className="font-medium w-24 text-right">
                                        {formatCurrency(item.value)}
                                    </span>
                                </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${item.percentage}%`,
                                        backgroundColor: chartColors[index % chartColors.length],
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-lg font-bold">{formatCurrency(total)}</span>
                </div>
            </CardContent>
        </Card>
    );
}
