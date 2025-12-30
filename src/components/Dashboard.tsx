'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Moon, Sun, ArrowLeft, BarChart3, Loader2, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PortfolioOverview, PerformanceMetrics } from '@/components/MetricsDisplay';
import { NorthStarMetrics } from '@/components/NorthStarMetrics';
import { PerformanceChart, AllocationPieChart } from '@/components/Charts';
import { PositionsTable, DividendsTable, FeesTable } from '@/components/Tables';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import { SettingsButton } from '@/components/TickerMappingPanel';
import { parseAccountCsv, extractDividends, extractFees, extractDeposits } from '@/lib/parsers/accountParser';
import { parsePortfolioCsv, extractCashPositions, calculateTotalPortfolioValue } from '@/lib/parsers/portfolioParser';
import { parseTransactionsCsv, calculateCostBasis, calculateRealizedGains } from '@/lib/parsers/transactionParser';
import { calculateAllocation } from '@/lib/data/isinMapping';
import { calculateAllMetrics } from '@/lib/calculations/metrics';
import { TimePeriod } from '@/types';
import { getToday, getStartOfYear, subtractYears } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { useIsinMetadata } from '@/lib/hooks/useIsinMetadata';
import { useSparklinePrices } from '@/lib/hooks/useSparklinePrices';
import { PortfolioAnalyst } from '@/components/PortfolioAnalyst';

interface DashboardProps {
    files: {
        account: string;
        portfolio: string;
        transactions: string;
    };
    onReset: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    lastUpdated?: Date | null;
}

export function Dashboard({ files, onReset, isDarkMode, onToggleDarkMode, lastUpdated }: DashboardProps) {
    const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');
    const [showBenchmarks, setShowBenchmarks] = useState(true);
    const [showDeposits, setShowDeposits] = useState(false);
    const [benchmarkData, setBenchmarkData] = useState<{
        sp500: { date: string; value: number }[];
        msciWorld: { date: string; value: number }[];
    } | null>(null);
    const [benchmarkLoading, setBenchmarkLoading] = useState(true);
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
        EUR: 1, USD: 0.85, GBP: 1.17, CHF: 1.08, GBX: 0.0117
    });

    // Fetch exchange rates from API
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('/api/exchange-rates');
                if (response.ok) {
                    const data = await response.json();
                    setExchangeRates(data);
                }
            } catch (err) {
                console.error('Error fetching exchange rates:', err);
            }
        };
        fetchRates();
    }, []);

    // Fetch benchmark data from API
    useEffect(() => {
        const fetchBenchmarks = async () => {
            try {
                setBenchmarkLoading(true);
                const startDate = new Date(2020, 0, 1).toISOString().split('T')[0];
                const endDate = new Date().toISOString().split('T')[0];

                const response = await fetch(
                    `/api/benchmarks?startDate=${startDate}&endDate=${endDate}`
                );

                if (response.ok) {
                    const data = await response.json();
                    setBenchmarkData(data);
                }
            } catch (err) {
                console.error('Error fetching benchmarks:', err);
            } finally {
                setBenchmarkLoading(false);
            }
        };
        fetchBenchmarks();
    }, []);
    const parsedData = useMemo(() => {
        const accountEntries = parseAccountCsv(files.account);
        const portfolioPositions = parsePortfolioCsv(files.portfolio);
        const cashPositions = extractCashPositions(files.portfolio);
        const transactions = parseTransactionsCsv(files.transactions);
        const dividends = extractDividends(accountEntries);
        const fees = extractFees(accountEntries);
        const deposits = extractDeposits(accountEntries);

        return {
            accountEntries,
            portfolioPositions,
            cashPositions,
            transactions,
            dividends,
            fees,
            deposits,
        };
    }, [files]);

    // Fetch ISIN metadata (sector, geography, assetClass) from API
    const { fetchMetadata: fetchIsinMetadata, isLoading: isinMetadataLoading } = useIsinMetadata();

    useEffect(() => {
        if (parsedData.portfolioPositions.length > 0) {
            const isins = parsedData.portfolioPositions.map(p => p.isin);
            const productNames: Record<string, string> = {};
            parsedData.portfolioPositions.forEach(p => {
                productNames[p.isin] = p.product;
            });

            fetchIsinMetadata(isins, productNames);
        }
    }, [parsedData.portfolioPositions, fetchIsinMetadata]);

    // Fetch 30-day sparkline prices for holdings
    const { sparklineData, fetchSparklines } = useSparklinePrices();

    useEffect(() => {
        if (parsedData.portfolioPositions.length > 0) {
            const positions = parsedData.portfolioPositions.map(p => ({
                isin: p.isin,
                lastPrice: p.lastPrice,
            }));
            fetchSparklines(positions);
        }
    }, [parsedData.portfolioPositions, fetchSparklines]);

    // Calculate metrics
    const calculations = useMemo(() => {
        const { portfolioPositions, transactions, cashPositions, dividends, fees, deposits } = parsedData;

        // Total portfolio value
        const investmentsValue = calculateTotalPortfolioValue(portfolioPositions);
        const cashValue = cashPositions.reduce((sum, c) => {
            // Convert to EUR (simple estimate)
            const rate = c.currency === 'USD' ? 0.85 : c.currency === 'GBP' ? 1.17 : 1;
            return sum + c.amount * rate;
        }, 0);
        const totalValue = investmentsValue + cashValue;

        // Cost basis
        const costBasis = calculateCostBasis(transactions);
        let totalCost = 0;
        for (const pos of portfolioPositions) {
            const cb = costBasis[pos.isin];
            if (cb) {
                totalCost += cb.totalCost;
            }
        }

        // Gains
        const totalGain = investmentsValue - totalCost;
        const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

        // Realized gains
        const { totalRealizedGain } = calculateRealizedGains(transactions);

        // Dividends and fees YTD
        const today = getToday();
        const startOfYear = getStartOfYear(today);
        const dividendsYTD = dividends
            .filter(d => d.date >= startOfYear)
            .reduce((sum, d) => sum + d.netAmount, 0);
        const feesYTD = fees
            .filter(f => f.date >= startOfYear)
            .reduce((sum, f) => sum + f.amount, 0);

        // Positions with gains
        const positionsWithGains = portfolioPositions.map(pos => {
            const cb = costBasis[pos.isin];
            const costBasisValue = cb ? cb.totalCost : 0;
            const gain = pos.valueEur - costBasisValue;
            const gainPercent = costBasisValue > 0 ? (gain / costBasisValue) * 100 : 0;

            return {
                product: pos.product,
                isin: pos.isin,
                quantity: pos.quantity,
                lastPrice: pos.lastPrice,
                value: pos.valueEur,
                costBasis: costBasisValue,
                gain,
                gainPercent,
                currency: pos.valueCurrency,
            };
        });

        // Allocations
        const allocationBySector = calculateAllocation(portfolioPositions, 'sector');
        const allocationByGeography = calculateAllocation(portfolioPositions, 'geography');
        const allocationByAssetClass = calculateAllocation(portfolioPositions, 'assetClass');

        // Generate time series data for chart (simplified - monthly portfolio values)
        const sortedTx = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
        const firstDate = sortedTx.length > 0 ? sortedTx[0].date : new Date(2021, 0, 1);

        const timeSeriesData: { date: string; portfolio: number; sp500: number; msciWorld: number; deposit: number }[] = [];
        let runningValue = 0;

        // Create maps for benchmark data lookup
        const sp500Map = new Map<string, number>();
        const msciMap = new Map<string, number>();

        if (benchmarkData) {
            benchmarkData.sp500.forEach(d => {
                const dateKey = new Date(d.date).toISOString().slice(0, 7);
                sp500Map.set(dateKey, d.value);
            });
            benchmarkData.msciWorld.forEach(d => {
                const dateKey = new Date(d.date).toISOString().slice(0, 7);
                msciMap.set(dateKey, d.value);
            });
        }

        // Get starting values for normalization
        const sp500Start = benchmarkData?.sp500[0]?.value || 1;
        const msciStart = benchmarkData?.msciWorld[0]?.value || 1;

        // Generate monthly data points
        const currentDate = getToday();
        const tempDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

        // Track cumulative invested amount (cost basis)
        let cumulativeInvested = 0;
        let txIndex = 0;

        while (tempDate <= currentDate) {
            // Add transactions that occurred up to this month
            while (txIndex < sortedTx.length && sortedTx[txIndex].date <= tempDate) {
                // Buys are negative totalEur (money out), sells are positive
                cumulativeInvested += Math.abs(sortedTx[txIndex].totalEur);
                txIndex++;
            }

            // Calculate portfolio value at this point
            // Use time-weighted growth from invested amount to current value
            const monthsFromStart = (tempDate.getTime() - firstDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
            const totalMonths = (currentDate.getTime() - firstDate.getTime()) / (30 * 24 * 60 * 60 * 1000);

            // Linear interpolation from 0 to current value based on invested amount ratio
            const investedRatio = totalCost > 0 ? cumulativeInvested / totalCost : 0;
            const timeProgress = totalMonths > 0 ? monthsFromStart / totalMonths : 0;

            // Portfolio value = invested * growth factor to reach final value
            const growthFactor = totalCost > 0 ? totalValue / totalCost : 1;
            const portfolioValue = cumulativeInvested * (1 + (growthFactor - 1) * timeProgress);

            // Get benchmark values for this month
            const dateKey = tempDate.toISOString().slice(0, 7);
            const sp500RawValue = sp500Map.get(dateKey);
            const msciRawValue = msciMap.get(dateKey);

            // Normalize benchmarks: if I had invested same amount in benchmark, what would it be worth?
            // Benchmark return = (current price / price at investment date) - 1
            let sp500Value = 0;
            let msciValue = 0;

            if (sp500RawValue && sp500Start > 0 && portfolioValue > 0) {
                const benchmarkGrowth = sp500RawValue / sp500Start;
                sp500Value = cumulativeInvested * benchmarkGrowth;
            }

            if (msciRawValue && msciStart > 0 && portfolioValue > 0) {
                const benchmarkGrowth = msciRawValue / msciStart;
                msciValue = cumulativeInvested * benchmarkGrowth;
            }

            // Calculate deposits for this month
            const monthDeposit = deposits
                .filter(d => {
                    const depDate = new Date(d.date);
                    return depDate.getFullYear() === tempDate.getFullYear() &&
                        depDate.getMonth() === tempDate.getMonth();
                })
                .reduce((sum, d) => sum + d.amount, 0);

            timeSeriesData.push({
                date: tempDate.toISOString(),
                portfolio: portfolioValue,
                sp500: sp500Value || portfolioValue * 0.98,
                msciWorld: msciValue || portfolioValue * 0.95,
                deposit: monthDeposit,
            });

            tempDate.setMonth(tempDate.getMonth() + 1);
        }

        // Ensure last point matches current actual values
        if (timeSeriesData.length > 0) {
            timeSeriesData[timeSeriesData.length - 1].portfolio = totalValue;
        }

        // Calculate performance metrics (using simulated data for demo)
        // In production, you'd fetch actual historical portfolio values
        const cashFlows = deposits.map(d => ({ date: d.date, amount: -d.amount }));

        // Simulated monthly returns for metrics calculation
        const portfolioReturns = timeSeriesData.slice(1).map((d, i) => {
            const prev = timeSeriesData[i].portfolio;
            return prev > 0 ? (d.portfolio - prev) / prev : 0;
        });

        const sp500Returns = timeSeriesData.slice(1).map((d, i) => {
            const prev = timeSeriesData[i].sp500;
            return prev > 0 ? (d.sp500 - prev) / prev : 0;
        });

        const msciReturns = timeSeriesData.slice(1).map((d, i) => {
            const prev = timeSeriesData[i].msciWorld;
            return prev > 0 ? (d.msciWorld - prev) / prev : 0;
        });

        // Calculate years since first transaction
        const years = (currentDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

        const metrics = calculateAllMetrics(
            timeSeriesData.map(d => ({
                date: new Date(d.date),
                portfolioValue: d.portfolio,
                cashFlow: 0,
                benchmark1: d.sp500,
                benchmark2: d.msciWorld,
            })),
            cashFlows,
            { sp500: sp500Returns, msciWorld: msciReturns }
        );

        return {
            totalValue,
            totalCost,
            totalGain,
            totalGainPercent,
            totalRealizedGain,
            cashValue,
            dividendsYTD,
            feesYTD,
            positionsWithGains,
            allocationBySector,
            allocationByGeography,
            allocationByAssetClass,
            timeSeriesData,
            metrics,
            dividends: parsedData.dividends,
            fees: parsedData.fees,
        };
    }, [parsedData, benchmarkData]);

    // Filter data by time period
    const filteredChartData = useMemo(() => {
        const today = getToday();
        let startDate: Date;

        switch (timePeriod) {
            case 'YTD':
                startDate = getStartOfYear(today);
                break;
            case '1Y':
                startDate = subtractYears(today, 1);
                break;
            case '3Y':
                startDate = subtractYears(today, 3);
                break;
            case '5Y':
                startDate = subtractYears(today, 5);
                break;
            default:
                startDate = new Date(2020, 0, 1);
        }

        return calculations.timeSeriesData.filter(
            d => new Date(d.date) >= startDate
        );
    }, [calculations.timeSeriesData, timePeriod]);

    // Calculate metrics for the selected time period
    const filteredMetrics = useMemo(() => {
        if (filteredChartData.length < 2) {
            return calculations.metrics;
        }

        // Calculate returns for filtered data
        const returns = filteredChartData.slice(1).map((d, i) => {
            const prev = filteredChartData[i].portfolio;
            return prev > 0 ? (d.portfolio - prev) / prev : 0;
        });

        const sp500Returns = filteredChartData.slice(1).map((d, i) => {
            const prev = filteredChartData[i].sp500;
            return prev > 0 ? (d.sp500 - prev) / prev : 0;
        });

        // Calculate basic metrics for filtered period
        const startValue = filteredChartData[0].portfolio;
        const endValue = filteredChartData[filteredChartData.length - 1].portfolio;
        const totalReturn = startValue > 0 ? (endValue - startValue) / startValue : 0;

        // Time in years
        const startDate = new Date(filteredChartData[0].date);
        const endDate = new Date(filteredChartData[filteredChartData.length - 1].date);
        const years = Math.max(0.1, (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        // CAGR
        const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;

        // Volatility (annualized standard deviation)
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const monthlyVol = Math.sqrt(variance);
        const volatility = monthlyVol * Math.sqrt(12);

        // Sharpe Ratio (using 3.5% risk-free rate)
        const riskFreeRate = 0.035;
        const excessReturn = cagr - riskFreeRate;
        const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;

        // Max Drawdown
        let maxDrawdown = 0;
        let peak = filteredChartData[0].portfolio;
        for (const point of filteredChartData) {
            if (point.portfolio > peak) peak = point.portfolio;
            const drawdown = (peak - point.portfolio) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Sortino Ratio (downside deviation)
        const downsideReturns = returns.filter(r => r < 0);
        const downsideVariance = downsideReturns.length > 0
            ? downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length
            : 0;
        const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(12);
        const sortinoRatio = downsideDeviation > 0 ? excessReturn / downsideDeviation : sharpeRatio;

        // Alpha & Beta vs S&P 500
        const avgBenchmarkReturn = sp500Returns.reduce((a, b) => a + b, 0) / sp500Returns.length;
        const covariance = returns.reduce((sum, r, i) =>
            sum + (r - avgReturn) * (sp500Returns[i] - avgBenchmarkReturn), 0) / returns.length;
        const benchmarkVariance = sp500Returns.reduce((sum, r) =>
            sum + Math.pow(r - avgBenchmarkReturn, 2), 0) / sp500Returns.length;
        const betaSP500 = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;
        const alphaSP500 = cagr - (riskFreeRate + betaSP500 * (avgBenchmarkReturn * 12 - riskFreeRate));

        return {
            twr: totalReturn,
            mwr: calculations.metrics.mwr, // Keep original MWR
            cagr,
            sharpeRatio,
            sortinoRatio,
            maxDrawdown,
            volatility,
            alphaSP500,
            betaSP500,
            alphaMSCI: alphaSP500 * 0.9, // Approximate
            betaMSCI: betaSP500 * 0.95,
        };
    }, [filteredChartData, calculations.metrics]);

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-6 w-6 text-primary" />
                            <h1 className="text-xl font-bold">Portfolio Tracker</h1>
                        </div>
                        {/* Data Source & Last Updated Indicators */}
                        <div className="hidden md:flex items-center gap-2">
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                                <span className="text-green-500">●</span>
                                DEGIRO
                            </Badge>
                            {lastUpdated && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/50">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                        {(() => {
                                            const now = new Date();
                                            const diff = now.getTime() - lastUpdated.getTime();
                                            const hours = Math.floor(diff / (1000 * 60 * 60));
                                            const days = Math.floor(hours / 24);
                                            if (days > 0) return `${days}d ago`;
                                            if (hours > 0) return `${hours}h ago`;
                                            return 'Just now';
                                        })()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <TimePeriodSelector selected={timePeriod} onChange={setTimePeriod} />
                        <SettingsButton
                            detectedIsins={calculations.positionsWithGains.map(p => ({
                                isin: p.isin,
                                name: p.product
                            }))}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onReset}
                            className="gap-1"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Clear Data</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleDarkMode}
                        >
                            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container py-6 space-y-6">
                {/* Tier 1: North Star Hero */}
                <NorthStarMetrics
                    totalValue={calculations.totalValue}
                    totalGain={calculations.totalGain}
                    totalGainPercent={calculations.totalGainPercent}
                    twr={filteredMetrics.twr}
                />

                {/* Tier 2: Secondary Metrics */}
                <PortfolioOverview
                    totalValue={calculations.totalValue}
                    totalCost={calculations.totalCost}
                    totalGain={calculations.totalGain}
                    totalGainPercent={calculations.totalGainPercent}
                    cashBalance={calculations.cashValue}
                    dividendsYTD={calculations.dividendsYTD}
                    feesYTD={calculations.feesYTD}
                />

                {/* Tabs for different views */}
                <Tabs defaultValue="performance" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="performance">Performance</TabsTrigger>
                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                        <TabsTrigger value="allocation">Allocation</TabsTrigger>
                        <TabsTrigger value="income">Income & Costs</TabsTrigger>
                    </TabsList>

                    <TabsContent value="performance" className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold">Performance Analysis</h2>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={showDeposits ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setShowDeposits(!showDeposits)}
                                >
                                    {showDeposits ? '💰 Hide' : '💰 Show'} Deposits
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowBenchmarks(!showBenchmarks)}
                                >
                                    {showBenchmarks ? 'Hide' : 'Show'} Benchmarks
                                </Button>
                            </div>
                        </div>
                        <PerformanceChart data={filteredChartData} showBenchmarks={showBenchmarks} showDeposits={showDeposits} />
                        <PerformanceMetrics
                            twr={filteredMetrics.twr}
                            mwr={filteredMetrics.mwr}
                            cagr={filteredMetrics.cagr}
                            sharpeRatio={filteredMetrics.sharpeRatio}
                            sortinoRatio={filteredMetrics.sortinoRatio}
                            maxDrawdown={filteredMetrics.maxDrawdown}
                            volatility={filteredMetrics.volatility}
                            alphaSP500={filteredMetrics.alphaSP500}
                            betaSP500={filteredMetrics.betaSP500}
                            alphaMSCI={filteredMetrics.alphaMSCI}
                            betaMSCI={filteredMetrics.betaMSCI}
                        />

                        {/* AI Portfolio Analyst */}
                        <div className="pt-6 border-t">
                            <PortfolioAnalyst
                                portfolioData={{
                                    totalValue: calculations.totalValue,
                                    totalCost: calculations.totalCost,
                                    totalGain: calculations.totalGain,
                                    totalGainPercent: calculations.totalGainPercent,
                                    cashBalance: calculations.cashValue,
                                    positions: calculations.positionsWithGains.map(p => ({
                                        name: p.product,
                                        isin: p.isin,
                                        value: p.value,
                                        percentage: (p.value / calculations.totalValue) * 100,
                                        sector: 'Technology', // TODO: from classification
                                        geography: 'USA',
                                        assetClass: 'Stock',
                                    })),
                                    allocations: {
                                        bySector: calculations.allocationBySector,
                                        byGeography: calculations.allocationByGeography,
                                        byAssetClass: calculations.allocationByAssetClass,
                                    },
                                    metrics: {
                                        twr: filteredMetrics.twr,
                                        mwr: filteredMetrics.mwr,
                                        cagr: filteredMetrics.cagr,
                                        sharpeRatio: filteredMetrics.sharpeRatio,
                                        sortinoRatio: filteredMetrics.sortinoRatio,
                                        maxDrawdown: filteredMetrics.maxDrawdown,
                                        volatility: filteredMetrics.volatility,
                                    },
                                    benchmarkComparison: benchmarkData ? {
                                        sp500Return: filteredMetrics.twr - filteredMetrics.alphaSP500,
                                        msciWorldReturn: filteredMetrics.twr - filteredMetrics.alphaMSCI,
                                    } : undefined,
                                }}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="holdings" className="space-y-6">
                        <h2 className="text-2xl font-bold">Portfolio Holdings</h2>
                        <PositionsTable positions={calculations.positionsWithGains} sparklineData={sparklineData} />
                    </TabsContent>

                    <TabsContent value="allocation" className="space-y-6">
                        <h2 className="text-2xl font-bold">Asset Allocation</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <AllocationPieChart
                                data={calculations.allocationByAssetClass}
                                title="By Asset Class"
                            />
                            <AllocationPieChart
                                data={calculations.allocationBySector}
                                title="By Sector"
                                colors={['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#6366f1', '#ec4899']}
                            />
                            <AllocationPieChart
                                data={calculations.allocationByGeography}
                                title="By Geography"
                                colors={['#14b8a6', '#f97316', '#84cc16', '#6366f1', '#f43f5e', '#0ea5e9']}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="income" className="space-y-6">
                        <h2 className="text-2xl font-bold">Income & Costs</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <DividendsTable dividends={calculations.dividends} />
                            <FeesTable fees={calculations.fees} />
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
