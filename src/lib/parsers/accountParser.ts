import Papa from 'papaparse';
import { AccountEntry } from '@/types';
import { parseItalianNumber, parseItalianDate, cleanCsvValue } from '@/lib/utils/format';

/**
 * Parses Account.csv from DEGIRO (Italian locale)
 * 
 * Column mapping:
 * Data,Ora,Data Valore,Prodotto,ISIN,Descrizione,Borsa,Variazioni,,Saldo,,ID Ordine
 */
export function parseAccountCsv(csvContent: string): AccountEntry[] {
    const result = Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
    });

    const entries: AccountEntry[] = [];
    const rows = result.data as string[][];

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 11) continue;

        // Handle multi-line rows (some descriptions span multiple lines)
        const dateStr = cleanCsvValue(row[0]);
        if (!dateStr || dateStr.trim() === '') continue;

        try {
            const entry: AccountEntry = {
                date: parseItalianDate(dateStr),
                time: cleanCsvValue(row[1]),
                valueDate: parseItalianDate(cleanCsvValue(row[2])),
                product: cleanCsvValue(row[3]),
                isin: cleanCsvValue(row[4]),
                description: cleanCsvValue(row[5]),
                exchange: cleanCsvValue(row[6]),
                currency: cleanCsvValue(row[7]),
                amount: parseItalianNumber(row[8]),
                balanceCurrency: cleanCsvValue(row[9]),
                balance: parseItalianNumber(row[10]),
                orderId: cleanCsvValue(row[11] || ''),
            };

            entries.push(entry);
        } catch (error) {
            console.warn('Failed to parse account row:', row, error);
        }
    }

    return entries;
}

/**
 * Extracts dividends from account entries
 */
export function extractDividends(entries: AccountEntry[]) {
    const dividends: {
        date: Date;
        product: string;
        isin: string;
        grossAmount: number;
        withholdingTax: number;
        netAmount: number;
        currency: string;
    }[] = [];

    // Group entries by date and product to combine dividend + tax entries
    const grouped = new Map<string, AccountEntry[]>();

    for (const entry of entries) {
        const desc = entry.description.toLowerCase();
        if (desc.includes('dividendo') || desc.includes('ritenuta')) {
            // Validate date before using toISOString
            if (!entry.date || isNaN(entry.date.getTime())) {
                console.warn('Skipping dividend entry with invalid date:', entry);
                continue;
            }
            const key = `${entry.date.toISOString().split('T')[0]}_${entry.isin}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(entry);
        }
    }

    for (const [, group] of grouped) {
        let grossAmount = 0;
        let withholdingTax = 0;
        let product = '';
        let isin = '';
        let currency = '';
        let date = new Date();

        for (const entry of group) {
            const desc = entry.description.toLowerCase();
            if (desc.includes('ritenuta')) {
                withholdingTax += Math.abs(entry.amount);
            } else if (desc.includes('dividendo')) {
                grossAmount += entry.amount;
            }
            product = entry.product || product;
            isin = entry.isin || isin;
            currency = entry.currency || currency;
            date = entry.date;
        }

        if (grossAmount > 0) {
            dividends.push({
                date,
                product,
                isin,
                grossAmount,
                withholdingTax,
                netAmount: grossAmount - withholdingTax,
                currency,
            });
        }
    }

    return dividends.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Extracts fees from account entries
 */
export function extractFees(entries: AccountEntry[]) {
    const fees: {
        date: Date;
        description: string;
        amount: number;
        currency: string;
        type: 'transaction' | 'fx' | 'connection' | 'other';
    }[] = [];

    for (const entry of entries) {
        const desc = entry.description.toLowerCase();

        if (entry.amount < 0 && (
            desc.includes('costi di transazione') ||
            desc.includes('commissione') ||
            desc.includes('costi di connessione')
        )) {
            let type: 'transaction' | 'fx' | 'connection' | 'other' = 'other';

            if (desc.includes('costi di transazione')) {
                type = 'transaction';
            } else if (desc.includes('commissione') && desc.includes('fx')) {
                type = 'fx';
            } else if (desc.includes('costi di connessione')) {
                type = 'connection';
            }

            fees.push({
                date: entry.date,
                description: entry.description,
                amount: Math.abs(entry.amount),
                currency: entry.currency,
                type,
            });
        }
    }

    return fees.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Extracts deposits from account entries
 */
export function extractDeposits(entries: AccountEntry[]) {
    return entries
        .filter(entry => {
            const desc = entry.description.toLowerCase();
            return desc.includes('deposito') && entry.amount > 0;
        })
        .map(entry => ({
            date: entry.date,
            amount: entry.amount,
            currency: entry.currency,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calculates total cash balance from the latest entries
 */
export function calculateCashBalance(entries: AccountEntry[]) {
    const balances: { [currency: string]: number } = {};

    // Get the most recent balance for each currency
    for (const entry of entries) {
        if (entry.balanceCurrency && entry.balance !== undefined) {
            // Since entries are sorted by date desc, first occurrence is latest
            if (!(entry.balanceCurrency in balances)) {
                balances[entry.balanceCurrency] = entry.balance;
            }
        }
    }

    return balances;
}
