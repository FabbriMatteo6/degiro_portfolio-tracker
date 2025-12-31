
import { Transaction, PortfolioPosition } from '@/types';
import { getHoldingsAtDate, getPriceAtDate } from './calculateYearlyTWR';

// Define PriceData matching useYearlyPerformance
type PriceData = {
    [ticker: string]: { date: string; close: number }[];
};

/**
 * Calculate Adjusted Cost Basis for Period-Sensitive Gain/Loss
 * 
 * Logic:
 * 1. For positions held at start date: Cost = Price @ StartDate
 * 2. For positions bought after start date: Cost = Purchase Price
 * 3. Sold positions are excluded (since we only look at current holdings)
 */
export function calculateAdjustedCostBasis(
    currentHoldings: PortfolioPosition[],
    transactions: Transaction[],
    priceData: PriceData,
    tickerMappings: Record<string, { ticker: string }>,
    exchangeRates: Record<string, number>,
    startDate: Date
): number {
    let totalAdjustedCost = 0;

    // Get holdings as they were at the start date
    // Note: getHoldingsAtDate returns Record<string, {quantity: number, product: string}> 
    const startHoldings = getHoldingsAtDate(transactions, startDate);

    // Create a currency map from transactions (fallback if position currency unknown)
    const currencyMap: Record<string, string> = {};
    for (const tx of transactions) {
        if (tx.isin && tx.priceCurrency && !currencyMap[tx.isin]) {
            currencyMap[tx.isin] = tx.priceCurrency;
        }
    }

    // Iterate through current holdings
    for (const position of currentHoldings) {
        const isin = position.isin;
        const currentQty = position.quantity;
        if (currentQty <= 0) continue;

        const startHolding = startHoldings[isin];
        const startQty = startHolding ? startHolding.quantity : 0;
        const ticker = tickerMappings[isin]?.ticker;

        // Part 1: Shares held at Start Date (Mark to Market at Start Date)
        const keptShares = Math.min(currentQty, startQty);
        let keptSharesCost = 0;

        if (keptShares > 0 && ticker) {
            // Get price on start date
            const priceAtStart = getPriceAtDate(priceData, ticker, startDate);

            // Determine currency for FX conversion
            let currency = 'EUR';

            if (position.valueCurrency) {
                currency = position.valueCurrency;
            } else if (currencyMap[isin]) {
                currency = currencyMap[isin];
            } else {
                // Try to guess from priceData? No reliable way.
                // Fallback to EUR (no conversion).
            }

            let exchangeRate = 1;
            if (currency !== 'EUR') {
                exchangeRate = exchangeRates[currency] || 1;
            }

            keptSharesCost = keptShares * priceAtStart * exchangeRate;
        }

        // Part 2: Shares bought AFTER Start Date (Use Original Cost)
        let newSharesCost = 0;
        const newShares = currentQty - keptShares;

        if (newShares > 0) {
            // Find buy transactions after start date
            // We sum up the cost of relevant buys. 
            // Simplified: Iterate transactions for this ISIN after startDate

            let totalBuyQty = 0;
            let totalBuyCostEur = 0;

            for (const tx of transactions) {
                // Buy identification: Quantity > 0 AND TotalEur < 0 (money spent)
                // Note: Transaction type usually has quantity > 0 for Buy.
                if (tx.isin === isin && tx.date > startDate && tx.quantity > 0 && tx.totalEur < 0) {
                    totalBuyQty += tx.quantity;
                    totalBuyCostEur += Math.abs(tx.totalEur);
                }
            }

            if (totalBuyQty > 0) {
                const avgBuyPrice = totalBuyCostEur / totalBuyQty;
                newSharesCost = newShares * avgBuyPrice;
            }
        }

        totalAdjustedCost += (keptSharesCost + newSharesCost);
    }

    return totalAdjustedCost;
}
