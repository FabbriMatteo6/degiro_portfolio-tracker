/**
 * Yearly TWR (Time-Weighted Return) Calculator
 * 
 * Calculates TWR for each calendar year using sub-period linking.
 * Handles edge cases: assets bought later, assets bought/sold same year, partial years.
 */

import { Transaction } from '@/types';

export interface YearlyReturn {
    year: number;
    twr: number;           // Decimal (e.g., 0.12 for 12%)
    absoluteGain: number;  // In EUR
    startValue: number;
    endValue: number;
    isPartialYear: boolean;
    startDate: Date;
    endDate: Date;
}

interface PortfolioHoldings {
    [isin: string]: {
        quantity: number;
        product: string;
    };
}

interface PriceData {
    [ticker: string]: {
        date: string;
        close: number;
    }[];
}

/**
 * Reconstruct portfolio holdings at a specific date from transaction history
 */
export function getHoldingsAtDate(
    transactions: Transaction[],
    targetDate: Date
): PortfolioHoldings {
    const holdings: PortfolioHoldings = {};

    for (const tx of transactions) {
        if (tx.date > targetDate) break; // Transactions are sorted by date

        if (!tx.isin) continue;

        if (!holdings[tx.isin]) {
            holdings[tx.isin] = { quantity: 0, product: tx.product };
        }

        holdings[tx.isin].quantity += tx.quantity;

        // Clean up zero holdings
        if (holdings[tx.isin].quantity === 0) {
            delete holdings[tx.isin];
        }
    }

    return holdings;
}

/**
 * Get the price for an ISIN on a specific date from cached price data
 * Falls back to the most recent available price before the target date
 */
export function getPriceAtDate(
    priceData: PriceData,
    ticker: string,
    targetDate: Date
): number {
    const prices = priceData[ticker];
    if (!prices || prices.length === 0) return 0;

    const targetTime = targetDate.getTime();
    let closestPrice = prices[0];

    for (const price of prices) {
        const priceTime = new Date(price.date).getTime();
        if (priceTime <= targetTime) {
            closestPrice = price;
        } else {
            break;
        }
    }

    return closestPrice.close;
}

/**
 * Calculate portfolio value at a specific date
 */
export function calculatePortfolioValueAtDate(
    holdings: PortfolioHoldings,
    priceData: PriceData,
    tickerMappings: Record<string, { ticker: string }>,
    exchangeRates: Record<string, number>,
    targetDate: Date
): number {
    let totalValue = 0;

    for (const [isin, holding] of Object.entries(holdings)) {
        const mapping = tickerMappings[isin];
        if (!mapping?.ticker) continue;

        const price = getPriceAtDate(priceData, mapping.ticker, targetDate);
        // Assume prices are in the relevant currency; convert to EUR if needed
        // For simplicity, we'll assume all prices are already normalized
        totalValue += holding.quantity * price;
    }

    return totalValue;
}

/**
 * Calculate cost basis of holdings at a specific date
 * Uses average cost method (same as transactionParser)
 */
export function calculateCostBasisAtDate(
    transactions: Transaction[],
    targetDate: Date
): { [isin: string]: { totalCost: number; quantity: number } } {
    const costBasis: { [isin: string]: { totalCost: number; quantity: number; avgCost: number } } = {};

    for (const tx of transactions) {
        if (tx.date > targetDate) break; // Transactions are sorted by date

        if (!tx.isin) continue;

        if (!costBasis[tx.isin]) {
            costBasis[tx.isin] = { totalCost: 0, quantity: 0, avgCost: 0 };
        }

        if (tx.quantity > 0) {
            // Buy - update total cost and average
            const newTotalCost = costBasis[tx.isin].totalCost + Math.abs(tx.totalEur);
            const newQuantity = costBasis[tx.isin].quantity + tx.quantity;
            costBasis[tx.isin].totalCost = newTotalCost;
            costBasis[tx.isin].quantity = newQuantity;
            costBasis[tx.isin].avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
        } else if (tx.quantity < 0) {
            // Sell - reduce cost basis proportionally
            const sellQuantity = Math.abs(tx.quantity);
            const costReduction = costBasis[tx.isin].avgCost * sellQuantity;
            costBasis[tx.isin].totalCost -= costReduction;
            costBasis[tx.isin].quantity -= sellQuantity;

            // Clean up if fully sold
            if (costBasis[tx.isin].quantity <= 0) {
                delete costBasis[tx.isin];
            }
        }
    }

    // Return without avgCost for compatibility
    const result: { [isin: string]: { totalCost: number; quantity: number } } = {};
    for (const [isin, data] of Object.entries(costBasis)) {
        result[isin] = { totalCost: data.totalCost, quantity: data.quantity };
    }
    return result;
}

/**
 * Calculate total portfolio cost basis at a specific date
 */
export function getTotalCostBasisAtDate(
    transactions: Transaction[],
    targetDate: Date
): number {
    const costBasis = calculateCostBasisAtDate(transactions, targetDate);
    return Object.values(costBasis).reduce((sum, cb) => sum + cb.totalCost, 0);
}

/**
 * Get all unique years that have transactions
 */
function getYearsWithActivity(transactions: Transaction[]): number[] {
    const years = new Set<number>();
    for (const tx of transactions) {
        years.add(tx.date.getFullYear());
    }
    return Array.from(years).sort();
}

/**
 * Get cash flow events (buys and sells) for a specific year
 */
function getCashFlowsForYear(
    transactions: Transaction[],
    year: number
): { date: Date; amount: number }[] {
    return transactions
        .filter(tx => tx.date.getFullYear() === year)
        .map(tx => ({
            date: tx.date,
            amount: -tx.totalEur, // Negative for buys (cash out), positive for sells
        }));
}

/**
 * Calculate TWR for a year using sub-period linking
 * 
 * @param transactions All transactions (sorted by date)
 * @param priceData Historical price data for all tickers
 * @param tickerMappings ISIN to ticker mappings
 * @param exchangeRates Exchange rates for currency conversion
 * @param year The calendar year to calculate
 * @param previousYearEndHoldings Holdings at the end of the previous year (or null for first year)
 */
export function calculateTWRForYear(
    transactions: Transaction[],
    priceData: PriceData,
    tickerMappings: Record<string, { ticker: string }>,
    exchangeRates: Record<string, number>,
    year: number,
    currentDate: Date = new Date()
): YearlyReturn {
    // Determine start and end dates for this year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = year === currentDate.getFullYear()
        ? currentDate
        : new Date(year, 11, 31);

    // Find first transaction date to handle partial first year
    const firstTx = transactions.find(tx => tx.date.getFullYear() === year);
    const isPartialYear = firstTx && firstTx.date > yearStart;
    const effectiveStart = isPartialYear ? firstTx.date : yearStart;

    // Get holdings at start and end of year
    const startHoldings = getHoldingsAtDate(transactions, effectiveStart);
    const endHoldings = getHoldingsAtDate(transactions, yearEnd);

    // Calculate values
    const startValue = calculatePortfolioValueAtDate(
        startHoldings,
        priceData,
        tickerMappings,
        exchangeRates,
        effectiveStart
    );

    const endValue = calculatePortfolioValueAtDate(
        endHoldings,
        priceData,
        tickerMappings,
        exchangeRates,
        yearEnd
    );

    // Get cash flows for this year
    const cashFlows = getCashFlowsForYear(transactions, year);

    // If no start value and no cash flows, return zero
    if (startValue === 0 && cashFlows.length === 0) {
        return {
            year,
            twr: 0,
            absoluteGain: 0,
            startValue: 0,
            endValue,
            isPartialYear: isPartialYear || false,
            startDate: effectiveStart,
            endDate: yearEnd,
        };
    }

    // Calculate TWR using sub-period linking
    let twr = 1;
    let periodStartValue = startValue;
    let periodStartDate = effectiveStart;

    // Sort cash flows by date
    const sortedCashFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const cf of sortedCashFlows) {
        // Calculate holdings and value just before this cash flow
        const preFlowHoldings = getHoldingsAtDate(
            transactions.filter(tx => tx.date < cf.date),
            cf.date
        );
        const preFlowValue = calculatePortfolioValueAtDate(
            preFlowHoldings,
            priceData,
            tickerMappings,
            exchangeRates,
            cf.date
        );

        // Calculate sub-period return
        if (periodStartValue > 0) {
            const periodReturn = preFlowValue / periodStartValue;
            twr *= periodReturn;
        }

        // Update for next period (post cash flow)
        // Buys are positive (add to base), Sells are negative (remove from base)
        periodStartValue = preFlowValue + cf.amount;
        periodStartDate = cf.date;
    }

    // Final sub-period from last cash flow to year end
    if (periodStartValue > 0) {
        const finalReturn = endValue / periodStartValue;
        twr *= finalReturn;
    }

    // TWR = linked returns - 1
    twr = twr - 1;

    // Calculate absolute gain
    // Gain = End Value - Start Value - Net Inflows (Buys - Sells)
    const netFlows = cashFlows.reduce((sum, cf) => sum + cf.amount, 0);
    const absoluteGain = endValue - startValue - netFlows;

    return {
        year,
        twr,
        absoluteGain,
        startValue,
        endValue,
        isPartialYear: isPartialYear || false,
        startDate: effectiveStart,
        endDate: yearEnd,
    };
}

/**
 * Calculate TWR for all years with portfolio activity
 */
export function calculateAllYearlyTWR(
    transactions: Transaction[],
    priceData: PriceData,
    tickerMappings: Record<string, { ticker: string }>,
    exchangeRates: Record<string, number> = { EUR: 1 },
    currentDate: Date = new Date()
): YearlyReturn[] {
    if (transactions.length === 0) return [];

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
    );

    // Get all years with activity
    const years = getYearsWithActivity(sortedTransactions);
    if (years.length === 0) return [];

    // Extend to current year if not included
    const currentYear = currentDate.getFullYear();
    if (!years.includes(currentYear)) {
        years.push(currentYear);
    }

    // Calculate TWR for each year
    const yearlyReturns: YearlyReturn[] = [];

    for (const year of years) {
        const yearReturn = calculateTWRForYear(
            sortedTransactions,
            priceData,
            tickerMappings,
            exchangeRates,
            year,
            currentDate
        );
        yearlyReturns.push(yearReturn);
    }

    return yearlyReturns;
}
