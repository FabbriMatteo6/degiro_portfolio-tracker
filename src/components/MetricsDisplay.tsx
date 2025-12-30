'use client';

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

interface MetricCardProps {
    title: string;
    value: string;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
    icon?: React.ReactNode;
}

function MetricCard({ title, value, subtitle, trend, icon }: MetricCardProps) {
    return (
        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/70 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                {icon || (trend === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                ) : trend === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                ) : null)}
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${trend === 'up' ? 'text-green-500' :
                        trend === 'down' ? 'text-red-500' : ''
                    }`}>
                    {value}
                </div>
                {subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {subtitle}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

interface PortfolioOverviewProps {
    totalValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPercent: number;
    cashBalance: number;
    dividendsYTD: number;
    feesYTD: number;
}

export function PortfolioOverview({
    totalValue,
    totalCost,
    totalGain,
    totalGainPercent,
    cashBalance,
    dividendsYTD,
    feesYTD,
}: PortfolioOverviewProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
                title="Total Portfolio Value"
                value={formatCurrency(totalValue)}
                subtitle={`Cost basis: ${formatCurrency(totalCost)}`}
                icon={<DollarSign className="h-4 w-4 text-blue-500" />}
            />
            <MetricCard
                title="Total Gain/Loss"
                value={formatCurrency(totalGain)}
                subtitle={formatPercent(totalGainPercent / 100)}
                trend={totalGain >= 0 ? 'up' : 'down'}
            />
            <MetricCard
                title="Cash Balance"
                value={formatCurrency(cashBalance)}
                subtitle="Available for investment"
                icon={<PieChart className="h-4 w-4 text-purple-500" />}
            />
            <MetricCard
                title="Dividends (YTD)"
                value={formatCurrency(dividendsYTD)}
                subtitle={`Fees: ${formatCurrency(feesYTD)}`}
                icon={<Activity className="h-4 w-4 text-green-500" />}
            />
        </div>
    );
}

interface PerformanceMetricsProps {
    twr: number;
    mwr: number;
    cagr: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    volatility: number;
    alphaSP500: number;
    betaSP500: number;
    alphaMSCI: number;
    betaMSCI: number;
}

export function PerformanceMetrics({
    twr,
    mwr,
    cagr,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    volatility,
    alphaSP500,
    betaSP500,
    alphaMSCI,
    betaMSCI,
}: PerformanceMetricsProps) {
    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Performance Metrics
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">TWR</p>
                        <p className={`text-xl font-bold ${twr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatPercent(twr)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">MWR (IRR)</p>
                        <p className={`text-xl font-bold ${mwr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatPercent(mwr)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">CAGR</p>
                        <p className={`text-xl font-bold ${cagr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatPercent(cagr)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Volatility</p>
                        <p className="text-xl font-bold">
                            {formatPercent(volatility)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                        <p className="text-xl font-bold">
                            {sharpeRatio.toFixed(2)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Sortino Ratio</p>
                        <p className="text-xl font-bold">
                            {isFinite(sortinoRatio) ? sortinoRatio.toFixed(2) : '∞'}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Max Drawdown</p>
                        <p className="text-xl font-bold text-red-500">
                            -{(maxDrawdown * 100).toFixed(1)}%
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Beta (S&P 500)</p>
                        <p className="text-xl font-bold">
                            {betaSP500.toFixed(2)}
                        </p>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Alpha vs Benchmarks</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm">vs S&P 500</span>
                            <span className={`font-bold ${alphaSP500 >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatPercent(alphaSP500)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm">vs MSCI World</span>
                            <span className={`font-bold ${alphaMSCI >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatPercent(alphaMSCI)}
                            </span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
