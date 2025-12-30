/**
 * Financial calculations for portfolio performance metrics
 */

import { Transaction, PortfolioPosition, TimeSeriesPoint } from '@/types';

/**
 * Check if a date is valid
 */
function isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Time-Weighted Return (TWR)
 * Measures portfolio performance independent of cash flows
 * 
 * Formula: TWR = [(1 + R₁) × (1 + R₂) × ... × (1 + Rₙ)] - 1
 */
export function calculateTWR(
    timeSeriesData: TimeSeriesPoint[],
    cashFlows: { date: Date; amount: number }[]
): number {
    if (timeSeriesData.length < 2) return 0;

    // Sort time series by date, filtering out invalid dates
    const sorted = [...timeSeriesData]
        .filter(d => isValidDate(d.date))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sorted.length < 2) return 0;

    // Create a map of cash flows by date, filtering out invalid dates
    const cashFlowMap = new Map<string, number>();
    for (const cf of cashFlows) {
        if (!isValidDate(cf.date)) continue;
        const key = cf.date.toISOString().split('T')[0];
        cashFlowMap.set(key, (cashFlowMap.get(key) || 0) + cf.amount);
    }

    // Calculate sub-period returns
    let twr = 1;

    for (let i = 1; i < sorted.length; i++) {
        const prevValue = sorted[i - 1].portfolioValue;
        const currValue = sorted[i].portfolioValue;
        const dateKey = sorted[i].date.toISOString().split('T')[0];
        const cashFlow = cashFlowMap.get(dateKey) || 0;

        // Adjust denominator for cash flows that occurred during the period
        const adjustedPrevValue = prevValue + cashFlow;

        if (adjustedPrevValue > 0) {
            const periodReturn = currValue / adjustedPrevValue;
            twr *= periodReturn;
        }
    }

    return twr - 1;
}

/**
 * Money-Weighted Return (MWR) / Internal Rate of Return (IRR)
 * Uses Newton-Raphson method to solve for IRR
 * 
 * Formula: ∑[CFₜ / (1 + IRR)^t] = 0
 */
export function calculateMWR(
    cashFlows: { date: Date; amount: number }[],
    finalValue: number,
    endDate: Date
): number {
    if (cashFlows.length === 0) return 0;

    // Sort cash flows by date
    const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const startDate = sorted[0].date;

    // Convert to years from start
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;

    const flows = sorted.map(cf => ({
        years: (cf.date.getTime() - startDate.getTime()) / msPerYear,
        amount: cf.amount,
    }));

    // Add final value as positive cash flow
    const endYears = (endDate.getTime() - startDate.getTime()) / msPerYear;
    flows.push({ years: endYears, amount: finalValue });

    // Newton-Raphson iteration
    let irr = 0.1; // Initial guess of 10%
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let derivative = 0;

        for (const flow of flows) {
            const discount = Math.pow(1 + irr, -flow.years);
            npv += flow.amount * discount;
            derivative -= flow.years * flow.amount * Math.pow(1 + irr, -flow.years - 1);
        }

        if (Math.abs(npv) < tolerance) break;
        if (derivative === 0) break;

        irr = irr - npv / derivative;

        // Clamp to reasonable bounds
        irr = Math.max(-0.99, Math.min(10, irr));
    }

    return irr;
}

/**
 * Compound Annual Growth Rate (CAGR)
 * 
 * Formula: CAGR = (EndValue / StartValue)^(1/years) - 1
 */
export function calculateCAGR(
    startValue: number,
    endValue: number,
    years: number
): number {
    if (startValue <= 0 || years <= 0) return 0;
    return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Sharpe Ratio
 * Measures risk-adjusted return
 * 
 * Formula: Sharpe = (Rₚ - Rᶠ) / σₚ
 * 
 * @param portfolioReturn Annualized portfolio return
 * @param riskFreeRate Risk-free rate (default: 3.5% ECB rate)
 * @param volatility Annualized standard deviation
 */
export function calculateSharpeRatio(
    portfolioReturn: number,
    volatility: number,
    riskFreeRate: number = 0.035
): number {
    if (volatility === 0) return 0;
    return (portfolioReturn - riskFreeRate) / volatility;
}

/**
 * Sortino Ratio
 * Like Sharpe but only penalizes downside volatility
 * 
 * Formula: Sortino = (Rₚ - Rᶠ) / σd
 */
export function calculateSortinoRatio(
    portfolioReturn: number,
    returns: number[],
    riskFreeRate: number = 0.035
): number {
    // Calculate downside deviation (only negative returns)
    const negativeReturns = returns.filter(r => r < 0);

    if (negativeReturns.length === 0) return Infinity;

    const sumSquaredNegative = negativeReturns.reduce((sum, r) => sum + r * r, 0);
    const downsideDeviation = Math.sqrt(sumSquaredNegative / returns.length);

    if (downsideDeviation === 0) return 0;

    // Annualize (assuming monthly returns)
    const annualizedDownside = downsideDeviation * Math.sqrt(12);

    return (portfolioReturn - riskFreeRate) / annualizedDownside;
}

/**
 * Maximum Drawdown
 * Largest peak-to-trough decline
 */
export function calculateMaxDrawdown(values: number[]): number {
    if (values.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = values[0];

    for (const value of values) {
        if (value > peak) {
            peak = value;
        }
        const drawdown = (peak - value) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
}

/**
 * Volatility (Annualized Standard Deviation)
 */
export function calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Annualize (assuming monthly returns)
    return stdDev * Math.sqrt(12);
}

/**
 * Alpha and Beta
 * Measures performance relative to benchmark
 * 
 * β = Cov(Rₚ, Rₘ) / Var(Rₘ)
 * α = Rₚ - [Rᶠ + β × (Rₘ - Rᶠ)]
 */
export function calculateAlphaBeta(
    portfolioReturns: number[],
    benchmarkReturns: number[],
    riskFreeRate: number = 0.035
): { alpha: number; beta: number } {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) {
        return { alpha: 0, beta: 1 };
    }

    const n = portfolioReturns.length;

    // Calculate means
    const meanPortfolio = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
    const meanBenchmark = benchmarkReturns.reduce((sum, r) => sum + r, 0) / n;

    // Calculate covariance and variance
    let covariance = 0;
    let varianceBenchmark = 0;

    for (let i = 0; i < n; i++) {
        covariance += (portfolioReturns[i] - meanPortfolio) * (benchmarkReturns[i] - meanBenchmark);
        varianceBenchmark += Math.pow(benchmarkReturns[i] - meanBenchmark, 2);
    }

    covariance /= n - 1;
    varianceBenchmark /= n - 1;

    // Calculate Beta
    const beta = varianceBenchmark !== 0 ? covariance / varianceBenchmark : 1;

    // Annualize returns (assuming monthly)
    const annualPortfolioReturn = meanPortfolio * 12;
    const annualBenchmarkReturn = meanBenchmark * 12;

    // Calculate Alpha (Jensen's Alpha)
    const expectedReturn = riskFreeRate + beta * (annualBenchmarkReturn - riskFreeRate);
    const alpha = annualPortfolioReturn - expectedReturn;

    return { alpha, beta };
}

/**
 * Calculate monthly returns from time series
 */
export function calculateMonthlyReturns(values: { date: Date; value: number }[]): number[] {
    if (values.length < 2) return [];

    // Sort by date
    const sorted = [...values].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Group by month
    const monthlyValues = new Map<string, number>();
    for (const v of sorted) {
        const key = `${v.date.getFullYear()}-${String(v.date.getMonth() + 1).padStart(2, '0')}`;
        monthlyValues.set(key, v.value);
    }

    // Calculate returns
    const months = Array.from(monthlyValues.keys()).sort();
    const returns: number[] = [];

    for (let i = 1; i < months.length; i++) {
        const prevValue = monthlyValues.get(months[i - 1])!;
        const currValue = monthlyValues.get(months[i])!;

        if (prevValue > 0) {
            returns.push((currValue - prevValue) / prevValue);
        }
    }

    return returns;
}

/**
 * Calculate all performance metrics
 */
export function calculateAllMetrics(
    timeSeriesData: TimeSeriesPoint[],
    cashFlows: { date: Date; amount: number }[],
    benchmarkReturns: { sp500: number[]; msciWorld: number[] }
) {
    if (timeSeriesData.length < 2) {
        return {
            twr: 0,
            mwr: 0,
            cagr: 0,
            sharpeRatio: 0,
            sortinoRatio: 0,
            maxDrawdown: 0,
            volatility: 0,
            alphaSP500: 0,
            betaSP500: 1,
            alphaMSCI: 0,
            betaMSCI: 1,
        };
    }

    const sorted = [...timeSeriesData].sort((a, b) => a.date.getTime() - b.date.getTime());
    const values = sorted.map(d => d.portfolioValue);
    const portfolioReturns = calculateMonthlyReturns(
        sorted.map(d => ({ date: d.date, value: d.portfolioValue }))
    );

    const startValue = sorted[0].portfolioValue;
    const endValue = sorted[sorted.length - 1].portfolioValue;
    const years = (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    const twr = calculateTWR(sorted, cashFlows);
    const mwr = calculateMWR(cashFlows, endValue, sorted[sorted.length - 1].date);
    const cagr = calculateCAGR(startValue, endValue, years);
    const volatility = calculateVolatility(portfolioReturns);
    const maxDrawdown = calculateMaxDrawdown(values);

    const annualizedReturn = cagr;
    const sharpeRatio = calculateSharpeRatio(annualizedReturn, volatility);
    const sortinoRatio = calculateSortinoRatio(annualizedReturn, portfolioReturns);

    const { alpha: alphaSP500, beta: betaSP500 } = calculateAlphaBeta(portfolioReturns, benchmarkReturns.sp500);
    const { alpha: alphaMSCI, beta: betaMSCI } = calculateAlphaBeta(portfolioReturns, benchmarkReturns.msciWorld);

    return {
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
    };
}
