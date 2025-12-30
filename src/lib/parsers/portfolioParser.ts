import Papa from 'papaparse';
import { PortfolioPosition } from '@/types';
import { parseItalianNumber, cleanCsvValue } from '@/lib/utils/format';

/**
 * Parses Portfolio.csv from DEGIRO (Italian locale)
 * 
 * Column mapping:
 * Prodotto,Codice,Quantità,Ultimo,Valore,,Valore in EUR
 */
export function parsePortfolioCsv(csvContent: string): PortfolioPosition[] {
    const result = Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
    });

    const positions: PortfolioPosition[] = [];
    const rows = result.data as string[][];

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 7) continue;

        const productName = cleanCsvValue(row[0]);
        if (!productName || productName.trim() === '') continue;

        // Skip cash positions (handle separately)
        if (productName.toLowerCase().includes('cash')) continue;

        try {
            const position: PortfolioPosition = {
                product: productName,
                isin: cleanCsvValue(row[1]),
                quantity: parseItalianNumber(row[2]),
                lastPrice: parseItalianNumber(row[3]),
                valueCurrency: cleanCsvValue(row[4]),
                value: parseItalianNumber(row[5]),
                valueEur: parseItalianNumber(row[6]),
            };

            if (position.quantity > 0) {
                positions.push(position);
            }
        } catch (error) {
            console.warn('Failed to parse portfolio row:', row, error);
        }
    }

    return positions;
}

/**
 * Extracts cash positions from Portfolio.csv
 */
export function extractCashPositions(csvContent: string): { currency: string; amount: number }[] {
    const result = Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
    });

    const cashPositions: { currency: string; amount: number }[] = [];
    const rows = result.data as string[][];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 7) continue;

        const productName = cleanCsvValue(row[0]);
        if (productName.toLowerCase().includes('cash')) {
            // Extract currency from product name like "CASH & CASH FUND & FTX CASH (EUR)"
            const currencyMatch = productName.match(/\(([A-Z]{3})\)/);
            const currency = currencyMatch ? currencyMatch[1] : 'EUR';
            const amount = parseItalianNumber(row[5]);

            cashPositions.push({ currency, amount });
        }
    }

    return cashPositions;
}

/**
 * Calculates total portfolio value in EUR
 */
export function calculateTotalPortfolioValue(positions: PortfolioPosition[]): number {
    return positions.reduce((sum, pos) => sum + pos.valueEur, 0);
}

/**
 * Groups positions by asset class based on ISIN patterns and product names
 */
export function groupByAssetClass(positions: PortfolioPosition[]) {
    const groups: { [key: string]: PortfolioPosition[] } = {
        'ETFs': [],
        'Stocks': [],
        'Crypto': [],
        'ADRs': [],
        'Other': [],
    };

    for (const pos of positions) {
        const name = pos.product.toLowerCase();

        if (name.includes('etf') || name.includes('vanguard') || name.includes('ishares')) {
            groups['ETFs'].push(pos);
        } else if (name.includes('bitcoin') || name.includes('crypto') || name.includes('coinshares')) {
            groups['Crypto'].push(pos);
        } else if (name.includes('adr')) {
            groups['ADRs'].push(pos);
        } else if (pos.isin) {
            groups['Stocks'].push(pos);
        } else {
            groups['Other'].push(pos);
        }
    }

    return groups;
}
