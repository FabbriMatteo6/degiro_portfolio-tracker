import Papa from 'papaparse';
import { Transaction } from '@/types';
import { parseItalianNumber, parseItalianDate, cleanCsvValue } from '@/lib/utils/format';

/**
 * Parses Transactions.csv from DEGIRO (supports both Italian and English locales)
 * 
 * Italian columns: Data,Ora,Prodotto,ISIN,Borsa di riferimento,Borsa,Quantità,Quotazione,,Valore locale,,Valore EUR,Tasso di cambio,Commissione AutoFX,Costi di transazione e/o di terze parti EUR,Totale EUR,ID Ordine,
 * English columns: Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price,,Local value,,Value EUR,Exchange rate,AutoFX Fee,Transaction and/or third party fees EUR,Total EUR,Order ID,
 */
export function parseTransactionsCsv(csvContent: string): Transaction[] {
    const result = Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
    });

    const transactions: Transaction[] = [];
    const rows = result.data as string[][];

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 16) continue;

        const dateStr = cleanCsvValue(row[0]);
        if (!dateStr || dateStr.trim() === '') continue;

        try {
            const transaction: Transaction = {
                date: parseItalianDate(dateStr),
                time: cleanCsvValue(row[1]),
                product: cleanCsvValue(row[2]),
                isin: cleanCsvValue(row[3]),
                referenceExchange: cleanCsvValue(row[4]),
                exchange: cleanCsvValue(row[5]),
                quantity: parseItalianNumber(row[6]),
                price: parseItalianNumber(row[7]),
                priceCurrency: cleanCsvValue(row[8]),
                localValue: parseItalianNumber(row[9]),
                localCurrency: cleanCsvValue(row[10]),
                valueEur: parseItalianNumber(row[11]),
                exchangeRate: parseItalianNumber(row[12]),
                autoFxFee: parseItalianNumber(row[13]),
                transactionFee: parseItalianNumber(row[14]),
                totalEur: parseItalianNumber(row[15]),
                orderId: cleanCsvValue(row[16] || ''),
            };

            // Only add valid transactions
            if (transaction.product && transaction.quantity !== 0) {
                transactions.push(transaction);
            }
        } catch (error) {
            console.warn('Failed to parse transaction row:', row, error);
        }
    }

    return transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calculates cost basis for each position from transactions
 */
export function calculateCostBasis(transactions: Transaction[]) {
    const costBasis: { [isin: string]: { totalCost: number; totalQuantity: number } } = {};

    for (const tx of transactions) {
        if (!tx.isin) continue;

        if (!costBasis[tx.isin]) {
            costBasis[tx.isin] = { totalCost: 0, totalQuantity: 0 };
        }

        // For buys, add cost; for sells, reduce proportionally
        if (tx.quantity > 0) {
            // Buy
            costBasis[tx.isin].totalCost += Math.abs(tx.totalEur);
            costBasis[tx.isin].totalQuantity += tx.quantity;
        } else if (tx.quantity < 0) {
            // Sell - reduce cost basis proportionally
            const sellQuantity = Math.abs(tx.quantity);
            const avgCost = costBasis[tx.isin].totalQuantity > 0
                ? costBasis[tx.isin].totalCost / costBasis[tx.isin].totalQuantity
                : 0;

            costBasis[tx.isin].totalCost -= avgCost * sellQuantity;
            costBasis[tx.isin].totalQuantity -= sellQuantity;
        }
    }

    return costBasis;
}

/**
 * Calculates realized gains from sell transactions
 */
export function calculateRealizedGains(transactions: Transaction[]) {
    const positions: { [isin: string]: { avgCost: number; quantity: number } } = {};
    let totalRealizedGain = 0;
    const gains: { date: Date; product: string; isin: string; gain: number }[] = [];

    for (const tx of transactions) {
        if (!tx.isin) continue;

        if (!positions[tx.isin]) {
            positions[tx.isin] = { avgCost: 0, quantity: 0 };
        }

        if (tx.quantity > 0) {
            // Buy - update average cost
            const newTotalCost = (positions[tx.isin].avgCost * positions[tx.isin].quantity) + Math.abs(tx.totalEur);
            const newQuantity = positions[tx.isin].quantity + tx.quantity;
            positions[tx.isin].avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
            positions[tx.isin].quantity = newQuantity;
        } else if (tx.quantity < 0) {
            // Sell - calculate realized gain
            const sellQuantity = Math.abs(tx.quantity);
            const costBasis = positions[tx.isin].avgCost * sellQuantity;
            const proceeds = Math.abs(tx.totalEur);
            const gain = proceeds - costBasis;

            totalRealizedGain += gain;
            gains.push({
                date: tx.date,
                product: tx.product,
                isin: tx.isin,
                gain,
            });

            positions[tx.isin].quantity -= sellQuantity;
        }
    }

    return { totalRealizedGain, gains };
}

/**
 * Calculates realized gains from sell transactions within a specific date range.
 * 
 * NOTE: This function processes ALL transactions up to endDate to maintain accurate
 * cost basis tracking, but only counts gains from sells that occur within the date range.
 * This ensures correct average cost calculation even when selling shares that were
 * bought before the period started.
 * 
 * @param transactions All transactions (must be sorted by date)
 * @param startDate Start of the period (inclusive)
 * @param endDate End of the period (inclusive)
 */
export function calculateRealizedGainsForPeriod(
    transactions: Transaction[],
    startDate: Date,
    endDate: Date
) {
    const positions: { [isin: string]: { avgCost: number; quantity: number } } = {};
    let totalRealizedGain = 0;
    const gains: { date: Date; product: string; isin: string; gain: number }[] = [];

    for (const tx of transactions) {
        if (!tx.isin) continue;

        // Skip transactions after the end date
        if (tx.date > endDate) break;

        if (!positions[tx.isin]) {
            positions[tx.isin] = { avgCost: 0, quantity: 0 };
        }

        if (tx.quantity > 0) {
            // Buy - update average cost (always track for cost basis)
            const newTotalCost = (positions[tx.isin].avgCost * positions[tx.isin].quantity) + Math.abs(tx.totalEur);
            const newQuantity = positions[tx.isin].quantity + tx.quantity;
            positions[tx.isin].avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
            positions[tx.isin].quantity = newQuantity;
        } else if (tx.quantity < 0) {
            // Sell - calculate realized gain
            const sellQuantity = Math.abs(tx.quantity);
            const costBasis = positions[tx.isin].avgCost * sellQuantity;
            const proceeds = Math.abs(tx.totalEur);
            const gain = proceeds - costBasis;

            // Only count if within the date range
            if (tx.date >= startDate) {
                totalRealizedGain += gain;
                gains.push({
                    date: tx.date,
                    product: tx.product,
                    isin: tx.isin,
                    gain,
                });
            }

            positions[tx.isin].quantity -= sellQuantity;
        }
    }

    return { totalRealizedGain, gains };
}

/**
 * Groups transactions by month for time series analysis
 */
export function groupTransactionsByMonth(transactions: Transaction[]) {
    const grouped: { [key: string]: Transaction[] } = {};

    for (const tx of transactions) {
        const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(tx);
    }

    return grouped;
}

/**
 * Calculates monthly cash flows (net of buys and sells)
 */
export function calculateMonthlyCashFlows(transactions: Transaction[]) {
    const grouped = groupTransactionsByMonth(transactions);
    const cashFlows: { month: string; inflow: number; outflow: number; net: number }[] = [];

    for (const [month, txs] of Object.entries(grouped).sort()) {
        let inflow = 0;
        let outflow = 0;

        for (const tx of txs) {
            if (tx.totalEur < 0) {
                outflow += Math.abs(tx.totalEur);
            } else {
                inflow += tx.totalEur;
            }
        }

        cashFlows.push({
            month,
            inflow,
            outflow,
            net: inflow - outflow,
        });
    }

    return cashFlows;
}
