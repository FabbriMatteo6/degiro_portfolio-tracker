'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Moon, Sun, ArrowLeft, BarChart3, Loader2, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PortfolioOverview, PerformanceMetrics, getTimePeriodLabel } from '@/components/MetricsDisplay';
import { NorthStarMetrics } from '@/components/NorthStarMetrics';
import { PerformanceChart, AllocationPieChart } from '@/components/Charts';
import { PositionsTable, DividendsTable, FeesTable } from '@/components/Tables';
import { OperationsTable } from '@/components/OperationsTable';
import { TimePeriodSelector } from '@/components/TimePeriodSelector';
import { SettingsButton } from '@/components/TickerMappingPanel';
import { parseAccountCsv, extractDividends, extractFees, extractDeposits } from '@/lib/parsers/accountParser';
import { parsePortfolioCsv, extractCashPositions, calculateTotalPortfolioValue } from '@/lib/parsers/portfolioParser';
import { parseTransactionsCsv, calculateCostBasis, calculateRealizedGains, calculateRealizedGainsForPeriod } from '@/lib/parsers/transactionParser';
import { calculateAllocation } from '@/lib/data/isinMapping';
import { calculateAllMetrics } from '@/lib/calculations/metrics';
import { TimePeriod, PortfolioPosition } from '@/types';

import { getToday, getStartOfYear, subtractYears } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { useIsinMetadata } from '@/lib/hooks/useIsinMetadata';
import { useSparklinePrices } from '@/lib/hooks/useSparklinePrices';
import { useHistoricalRates } from '@/lib/hooks/useHistoricalRates';
import { PortfolioAnalyst } from '@/components/PortfolioAnalyst';
import { YearlyPerformanceGrid } from '@/components/YearlyPerformanceGrid';
import { useYearlyPerformance } from '@/lib/hooks/useYearlyPerformance';
import { usePortfolioStorage } from '@/lib/hooks/usePortfolioStorage';
import {
    getHoldingsAtDate,
    calculatePortfolioValueAtDate,
    getTotalCostBasisAtDate
} from '@/lib/calculations/calculateYearlyTWR';

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
    const [customDateRange, setCustomDateRange] = useState<{ startDate: Date; endDate: Date } | null>(null);
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

    // Historical exchange rates for dividend conversion
    const { convertToEur: convertHistorical, loading: historicalRatesLoading } = useHistoricalRates();

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

    // Yearly performance for grid
    const { yearlyReturns, loading: yearlyLoading, priceData, fetchYearlyPerformance } = useYearlyPerformance();
    const { loadTickerMappings } = usePortfolioStorage();

    useEffect(() => {
        if (parsedData.portfolioPositions.length > 0) {
            const positions = parsedData.portfolioPositions.map(p => ({
                isin: p.isin,
                lastPrice: p.lastPrice,
            }));
            fetchSparklines(positions);
        }
    }, [parsedData.portfolioPositions, fetchSparklines]);

    // Fetch yearly performance data when transactions are available
    // Note: Using useRef to ensure we only fetch once per session
    const hasFetchedYearlyPerformance = React.useRef(false);

    useEffect(() => {
        if (parsedData.transactions.length > 0 && !hasFetchedYearlyPerformance.current) {
            hasFetchedYearlyPerformance.current = true;
            const mappings = loadTickerMappings();
            fetchYearlyPerformance(parsedData.transactions, mappings, exchangeRates);
        }
    }, [parsedData.transactions]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Convert dividends to EUR using historical exchange rates from dividend date
        const dividendsYTD = dividends
            .filter(d => d.date >= startOfYear)
            .reduce((sum, d) => {
                // Convert dividend amount using rate from dividend date
                const amountInEur = convertHistorical(d.netAmount, d.currency, d.date);
                return sum + amountInEur;
            }, 0);
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

        const timeSeriesData: { date: string; portfolio: number; invested: number; sp500: number; msciWorld: number; deposit: number }[] = [];
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
                invested: cumulativeInvested,
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
    }, [parsedData, benchmarkData, convertHistorical]);

    // Filter data by time period
    const filteredChartData = useMemo(() => {
        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    startDate = new Date(2020, 0, 1);
                }
                break;
            default:
                startDate = new Date(2020, 0, 1);
        }

        return calculations.timeSeriesData.filter(
            d => {
                const date = new Date(d.date);
                return date >= startDate && date <= endDate;
            }
        );
    }, [calculations.timeSeriesData, timePeriod, customDateRange]);

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

    // Calculate period-filtered dividends and fees
    const periodFilteredDividends = useMemo(() => {
        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return calculations.dividendsYTD;
                }
                break;
            default:
                // ALL - return all dividends from parsedData
                return calculations.dividends.reduce((sum, d) => {
                    const amountInEur = convertHistorical(d.netAmount, d.currency, d.date);
                    return sum + amountInEur;
                }, 0);
        }

        return calculations.dividends
            .filter(d => d.date >= startDate && d.date <= endDate)
            .reduce((sum, d) => {
                const amountInEur = convertHistorical(d.netAmount, d.currency, d.date);
                return sum + amountInEur;
            }, 0);
    }, [timePeriod, customDateRange, calculations.dividends, calculations.dividendsYTD, convertHistorical]);

    const periodFilteredFees = useMemo(() => {
        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return calculations.feesYTD;
                }
                break;
            default:
                // ALL - return all fees
                return calculations.fees.reduce((sum, f) => sum + f.amount, 0);
        }

        return calculations.fees
            .filter(f => f.date >= startDate && f.date <= endDate)
            .reduce((sum, f) => sum + f.amount, 0);
    }, [timePeriod, customDateRange, calculations.fees, calculations.feesYTD]);

    // Calculate period-filtered operational (realized) gains
    const periodFilteredOperationalGains = useMemo(() => {
        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return calculations.totalRealizedGain;
                }
                break;
            default:
                // ALL - return all realized gains
                return calculations.totalRealizedGain;
        }

        const { totalRealizedGain } = calculateRealizedGainsForPeriod(
            parsedData.transactions,
            startDate,
            endDate
        );

        return totalRealizedGain;
    }, [timePeriod, customDateRange, parsedData.transactions, calculations.totalRealizedGain]);

    // Calculate period-sensitive portfolio value and gain/loss
    // Uses historical prices from the yearly performance cache to calculate
    // what the portfolio looked like at the END of the selected period
    /* const periodSensitiveMetrics = useMemo(() => {
        // Determine the end date of the selected period
        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

        switch (timePeriod) {
            case 'YTD':
                startDate = getStartOfYear(today);
                endDate = today;
                break;
            case '1Y':
                startDate = subtractYears(today, 1);
                endDate = today;
                break;
            case '3Y':
                startDate = subtractYears(today, 3);
                endDate = today;
                break;
            case '5Y':
                startDate = subtractYears(today, 5);
                endDate = today;
                break;
            case 'ALL':
                startDate = new Date(1900, 0, 1);
                endDate = today;
                break;
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    startDate = new Date(1900, 0, 1);
                }
                break;
            default:
                startDate = new Date(1900, 0, 1);
        }

        // If the period ends today (or close to it), ALWAYS use current real values
        // This ensures YTD/1Y/3Y/5Y/All match the "North Star" metrics and are accurate
        const isToday = endDate.toDateString() === today.toDateString();
        const hasPriceData = Object.keys(priceData).length > 0;
        const tickerMappings = loadTickerMappings();

        // SCENARIO 1: Current Period (YTD, 1Y, 3Y, 5Y, All, or Custom ending today)
        // Benefit: We use the actual current portfolio value which is most accurate
        if (isToday) {
            // Calculate Adjusted Cost Basis for true "Holding Gain" relative to start date
            let adjustedCostBasis = calculations.totalCost; // Fallback to original cost

            if (hasPriceData && startDate.getFullYear() > 1900) {
                adjustedCostBasis = calculateAdjustedCostBasis(
                    parsedData.portfolioPositions,
                    parsedData.transactions,
                    priceData,
                    tickerMappings,
                    exchangeRates,
                    startDate
                );
            }

            return {
                portfolioValue: calculations.totalValue,
                costBasis: adjustedCostBasis,
                gain: (calculations.totalValue - calculations.cashValue) - adjustedCostBasis,
                gainPercent: adjustedCostBasis > 0 ? (((calculations.totalValue - calculations.cashValue) - adjustedCostBasis) / adjustedCostBasis) * 100 : 0,
                cashBalance: calculations.cashValue,
            };
        }

        // SCENARIO 2: Historical Period (Custom Range in Past)

        // 1. Determine Value & Cost Basis:
        // We calculate strictly based on Holdings at End Date to ensure "Holding Gain" excludes Cash.
        // This is more accurate than Chart Data which simulates Total Value (inc. Cash).

        const sortedTransactions = [...parsedData.transactions].sort(
            (a, b) => a.date.getTime() - b.date.getTime()
        );
        const holdingsAtEnd = getHoldingsAtDate(sortedTransactions, endDate);

        // Convert to PortfolioPosition[] for helper
        const historicalPositions: PortfolioPosition[] = Object.entries(holdingsAtEnd).map(([isin, h]) => ({
            isin,
            quantity: h.quantity,
            product: h.product || '',
            lastPrice: 0,
            value: 0,
            valueEur: 0,
            valueCurrency: '' // Helper will fallback to transactions or defaults
        }));

        // Calculate Securities Value at End Date (Strictly Holdings, No Cash)
        const portfolioValue = calculatePortfolioValueAtDate(
            holdingsAtEnd,
            priceData,
            tickerMappings,
            exchangeRates,
            endDate
        );

        let adjustedCostBasis = 0;
        if (hasPriceData && startDate.getFullYear() > 1900) {
            adjustedCostBasis = calculateAdjustedCostBasis(
                historicalPositions,
                parsedData.transactions,
                priceData,
                tickerMappings,
                exchangeRates,
                startDate
            );
        } else {
            // Fallback: Use standard cost basis at end date (Original Cost)
            adjustedCostBasis = getTotalCostBasisAtDate(sortedTransactions, endDate);
        }

        // Safety fallback if calculation yielded 0 cost but value exists
        if (adjustedCostBasis === 0 && portfolioValue > 0) {
            adjustedCostBasis = getTotalCostBasisAtDate(sortedTransactions, endDate);
        }

        return {
            portfolioValue,
            costBasis: adjustedCostBasis,
            gain: portfolioValue - adjustedCostBasis,
            gainPercent: adjustedCostBasis > 0 ? ((portfolioValue - adjustedCostBasis) / adjustedCostBasis) * 100 : 0,
            cashBalance: calculations.cashValue, // Historical cash difficult, keep current
        };

    }, [timePeriod, customDateRange, priceData, calculations, parsedData, exchangeRates, loadTickerMappings, filteredChartData]); */

    // Calculate period-filtered dividends and fees LISTS for tables
    const periodFilteredDividendsList = useMemo(() => {
        if (timePeriod === 'ALL' && !customDateRange) {
            return calculations.dividends;
        }

        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return calculations.dividends;
                }
                break;
            default:
                return calculations.dividends;
        }

        return calculations.dividends.filter(d => d.date >= startDate && d.date <= endDate);
    }, [timePeriod, customDateRange, calculations.dividends]);

    const periodFilteredFeesList = useMemo(() => {
        if (timePeriod === 'ALL' && !customDateRange) {
            return calculations.fees;
        }

        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return calculations.fees;
                }
                break;
            default:
                return calculations.fees;
        }

        return calculations.fees.filter(f => f.date >= startDate && f.date <= endDate);
    }, [timePeriod, customDateRange, calculations.fees]);

    const periodFilteredTransactions = useMemo(() => {
        if (timePeriod === 'ALL' && !customDateRange) {
            return parsedData.transactions;
        }

        const today = getToday();
        let startDate: Date;
        let endDate: Date = today;

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
            case 'CUSTOM':
                if (customDateRange) {
                    startDate = customDateRange.startDate;
                    endDate = customDateRange.endDate;
                } else {
                    return parsedData.transactions;
                }
                break;
            default:
                return parsedData.transactions;
        }

        return parsedData.transactions.filter(t => t.date >= startDate && t.date <= endDate);
    }, [timePeriod, customDateRange, parsedData.transactions]);

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
                        <TimePeriodSelector
                            selected={timePeriod}
                            onChange={setTimePeriod}
                            customRange={customDateRange}
                            onCustomRangeChange={setCustomDateRange}
                            maxDate={getToday()}
                        />
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
                    totalCost={calculations.totalCost}
                    totalGain={calculations.totalGain}
                    totalGainPercent={calculations.totalGainPercent}
                    twr={filteredMetrics.twr}
                />

                {/* Tier 2: Secondary Metrics */}
                <PortfolioOverview
                    cashBalance={calculations.cashValue}
                    dividendsYTD={periodFilteredDividends}
                    feesYTD={periodFilteredFees}
                    timePeriod={timePeriod}
                    operationalGainLoss={periodFilteredOperationalGains}
                    operationalDividends={periodFilteredDividends}
                />

                {/* Tabs for different views */}
                <Tabs defaultValue="performance" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="performance">Performance</TabsTrigger>
                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
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
                        {/* Yearly Performance Grid */}
                        <YearlyPerformanceGrid yearlyReturns={yearlyReturns} loading={yearlyLoading} />

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

                    <TabsContent value="operations" className="space-y-6">
                        <h2 className="text-2xl font-bold">Trading Operations</h2>
                        <OperationsTable
                            transactions={periodFilteredTransactions}
                            timePeriodLabel={getTimePeriodLabel(timePeriod)}
                        />
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
                            <DividendsTable dividends={periodFilteredDividendsList} convertToEur={convertHistorical} />
                            <FeesTable fees={periodFilteredFeesList} />
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div >
    );
}
