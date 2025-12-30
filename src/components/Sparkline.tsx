'use client';

import React from 'react';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    className?: string;
}

/**
 * Sparkline Component
 * 
 * A minimal SVG line graph for inline trend visualization.
 * Shows price movement direction at a glance.
 */
export function Sparkline({
    data,
    width = 80,
    height = 24,
    strokeColor,
    fillColor,
    strokeWidth = 1.5,
    className = '',
}: SparklineProps) {
    if (!data || data.length < 2) {
        return (
            <div
                className={`flex items-center justify-center text-muted-foreground text-xs ${className}`}
                style={{ width, height }}
            >
                —
            </div>
        );
    }

    // Calculate trend direction
    const firstValue = data[0];
    const lastValue = data[data.length - 1];
    const isPositive = lastValue >= firstValue;
    const changePercent = ((lastValue - firstValue) / firstValue) * 100;

    // Default colors based on trend
    const defaultStrokeColor = isPositive ? '#10b981' : '#ef4444'; // Green / Red
    const defaultFillColor = isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    const stroke = strokeColor || defaultStrokeColor;
    const fill = fillColor || defaultFillColor;

    // Calculate SVG path
    const minValue = Math.min(...data);
    const maxValue = Math.max(...data);
    const range = maxValue - minValue || 1;

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
        return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;

    // Create area path (line + bottom + back to start)
    const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

    return (
        <div className={`relative inline-flex items-center gap-1 ${className}`}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="overflow-visible"
            >
                {/* Area fill */}
                <path
                    d={areaPath}
                    fill={fill}
                    strokeWidth={0}
                />
                {/* Line stroke */}
                <path
                    d={linePath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* End dot */}
                <circle
                    cx={width - padding}
                    cy={padding + chartHeight - ((lastValue - minValue) / range) * chartHeight}
                    r={2}
                    fill={stroke}
                />
            </svg>
            {/* Change indicator */}
            <span
                className={`text-[10px] font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}
            >
                {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
            </span>
        </div>
    );
}

/**
 * SparklineWithLabel
 * 
 * Sparkline with a label above showing the period
 */
interface SparklineWithLabelProps extends SparklineProps {
    label?: string;
}

export function SparklineWithLabel({ label = '30D', ...props }: SparklineWithLabelProps) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] uppercase text-muted-foreground tracking-wider">
                {label}
            </span>
            <Sparkline {...props} />
        </div>
    );
}

/**
 * Generate mock sparkline data for demo purposes
 * In production, this would come from historical price data
 */
export function generateMockSparklineData(
    currentPrice: number,
    volatility: number = 0.02,
    points: number = 30,
    trend: 'up' | 'down' | 'neutral' = 'neutral'
): number[] {
    const data: number[] = [];
    let price = currentPrice * (1 - volatility * 10); // Start slightly lower

    // Add a trend bias
    const trendBias = trend === 'up' ? 0.003 : trend === 'down' ? -0.003 : 0;

    for (let i = 0; i < points; i++) {
        const randomChange = (Math.random() - 0.5) * volatility * 2;
        price *= 1 + randomChange + trendBias;
        data.push(price);
    }

    // Ensure last value is close to current price
    const scale = currentPrice / data[data.length - 1];
    return data.map(v => v * scale);
}
