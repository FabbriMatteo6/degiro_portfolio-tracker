/**
 * Historical Portfolio Value Calculator
 * 
 * Uses cached historical prices to calculate accurate portfolio values over time.
 * Replaces the simulated growth logic with real market data.
 */

import { PricePoint, getPriceOnDate, getFxRateOnDate } from '../services/priceService';

// Types for the calculator
export interface HistoricalPosition {
    isin: string;
    ticker: string;
    shares: number;
    currency: string;
    name: string;
}

export interface HistoricalCashFlow {
    date: Date;
    amount: number;  // Positive = deposit/sell, Negative = buy
    type: 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend';
}

export interface PortfolioSnapshot {
    date: Date;
    portfolioValue: number;
    investedAmount: number;
    unrealizedGain: number;
    unrealizedGainPercent: number;
}

export interface PriceData {
    [ticker: string]: PricePoint[];
}

export interface FxData {
    [currency: string]: PricePoint[];  // e.g., "USD" -> USD/EUR rates
}

/**
 * Calculate portfolio value on a specific date using historical prices
 */
export function calculatePortfolioValueOnDate(
    date: Date,
    holdings: HistoricalPosition[],
    priceData: PriceData,
    fxData: FxData
): number {
    let totalValue = 0;

    for (const holding of holdings) {
        const prices = priceData[holding.ticker] || [];
        const price = getPriceOnDate(prices, date);

        // Get FX rate if not EUR
        let fxRate = 1;
        if (holding.currency !== 'EUR') {
            const fxRates = fxData[holding.currency] || [];
            fxRate = getFxRateOnDate(fxRates, date);
        }

        const valueEur = holding.shares * price * fxRate;
        totalValue += valueEur;
    }

    return totalValue;
}

/**
 * Build holdings at a specific date based on transactions
 */
export function buildHoldingsAtDate(
    date: Date,
    transactions: Array<{
        date: Date;
        isin: string;
        ticker: string;
        quantity: number;
        currency: string;
        name: string;
    }>
): HistoricalPosition[] {
    const holdings: Record<string, HistoricalPosition> = {};

    for (const tx of transactions) {
        if (tx.date > date) continue;

        if (!holdings[tx.isin]) {
            holdings[tx.isin] = {
                isin: tx.isin,
                ticker: tx.ticker,
                shares: 0,
                currency: tx.currency,
                name: tx.name,
            };
        }

        holdings[tx.isin].shares += tx.quantity;
    }

    // Filter out positions with 0 shares
    return Object.values(holdings).filter(h => h.shares > 0);
}

/**
 * Calculate invested amount at a specific date
 */
export function calculateInvestedAmountAtDate(
    date: Date,
    cashFlows: HistoricalCashFlow[]
): number {
    let invested = 0;

    for (const cf of cashFlows) {
        if (cf.date > date) continue;

        if (cf.type === 'deposit') {
            invested += cf.amount;
        } else if (cf.type === 'withdrawal') {
            invested -= cf.amount;
        }
        // Note: buy/sell don't change invested amount, just allocation
    }

    return invested;
}

/**
 * Generate portfolio time series using real historical prices
 */
export function generateHistoricalTimeSeries(
    startDate: Date,
    endDate: Date,
    transactions: Array<{
        date: Date;
        isin: string;
        ticker: string;
        quantity: number;
        currency: string;
        name: string;
    }>,
    cashFlows: HistoricalCashFlow[],
    priceData: PriceData,
    fxData: FxData,
    intervalDays: number = 7  // Weekly by default
): PortfolioSnapshot[] {
    const snapshots: PortfolioSnapshot[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        const holdings = buildHoldingsAtDate(current, transactions);
        const portfolioValue = calculatePortfolioValueOnDate(current, holdings, priceData, fxData);
        const investedAmount = calculateInvestedAmountAtDate(current, cashFlows);

        const unrealizedGain = portfolioValue - investedAmount;
        const unrealizedGainPercent = investedAmount > 0
            ? (unrealizedGain / investedAmount) * 100
            : 0;

        snapshots.push({
            date: new Date(current),
            portfolioValue,
            investedAmount,
            unrealizedGain,
            unrealizedGainPercent,
        });

        current.setDate(current.getDate() + intervalDays);
    }

    return snapshots;
}

/**
 * Calculate benchmark "matched investment" value
 * Simulates what the portfolio would be worth if deposits were invested in benchmark
 */
export function calculateMatchedBenchmarkValue(
    date: Date,
    cashFlows: HistoricalCashFlow[],
    benchmarkPrices: PricePoint[]
): number {
    let benchmarkShares = 0;

    for (const cf of cashFlows) {
        if (cf.date > date) continue;

        if (cf.type === 'deposit') {
            // Buy benchmark shares at the price on deposit date
            const priceOnDeposit = getPriceOnDate(benchmarkPrices, cf.date);
            if (priceOnDeposit > 0) {
                benchmarkShares += cf.amount / priceOnDeposit;
            }
        } else if (cf.type === 'withdrawal') {
            // Sell benchmark shares at current price
            const currentPrice = getPriceOnDate(benchmarkPrices, cf.date);
            if (currentPrice > 0) {
                benchmarkShares -= cf.amount / currentPrice;
            }
        }
    }

    // Calculate current value of benchmark position
    const currentPrice = getPriceOnDate(benchmarkPrices, date);
    return benchmarkShares * currentPrice;
}

/**
 * Generate benchmark comparison time series
 */
export function generateBenchmarkTimeSeries(
    snapshots: PortfolioSnapshot[],
    cashFlows: HistoricalCashFlow[],
    sp500Prices: PricePoint[],
    msciWorldPrices: PricePoint[]
): Array<{
    date: Date;
    portfolio: number;
    sp500: number;
    msciWorld: number;
    invested: number;
}> {
    return snapshots.map(snapshot => ({
        date: snapshot.date,
        portfolio: snapshot.portfolioValue,
        sp500: calculateMatchedBenchmarkValue(snapshot.date, cashFlows, sp500Prices),
        msciWorld: calculateMatchedBenchmarkValue(snapshot.date, cashFlows, msciWorldPrices),
        invested: snapshot.investedAmount,
    }));
}
