/**
 * Historical Exchange Rate Service
 * 
 * Fetches and caches historical exchange rates from frankfurter.app (ECB data)
 * Used for converting dividends to EUR at the rate from the dividend date.
 */

import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'cache', 'historical-exchange-rates.json');
const FRANKFURTER_API = 'https://api.frankfurter.app';

// Supported currencies (to EUR)
const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'CHF'] as const;
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export interface HistoricalRatesCache {
    lastUpdated: string; // ISO date string YYYY-MM-DD
    rates: {
        [currency: string]: {
            [date: string]: number; // date -> rate (X to EUR)
        };
    };
}

/**
 * Load historical rates from cache file
 */
export function loadHistoricalRates(): HistoricalRatesCache | null {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf-8');
            return JSON.parse(data) as HistoricalRatesCache;
        }
    } catch (error) {
        console.error('Failed to load historical exchange rates cache:', error);
    }
    return null;
}

/**
 * Save historical rates to cache file
 */
export function saveHistoricalRates(cache: HistoricalRatesCache): void {
    try {
        // Ensure cache directory exists
        const cacheDir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        console.log(`[FX] Saved historical exchange rates cache (${cache.lastUpdated})`);
    } catch (error) {
        console.error('Failed to save historical exchange rates cache:', error);
    }
}

/**
 * Fetch historical rates from frankfurter.app for a date range
 * Note: frankfurter.app returns rates FROM EUR, we need to invert them
 */
export async function fetchHistoricalRates(
    startDate: string,
    endDate: string,
    currencies: string[] = [...SUPPORTED_CURRENCIES]
): Promise<{ [currency: string]: { [date: string]: number } } | null> {
    try {
        const currencyList = currencies.join(',');
        const url = `${FRANKFURTER_API}/${startDate}..${endDate}?from=EUR&to=${currencyList}`;

        console.log(`[FX] Fetching historical rates: ${startDate} to ${endDate}`);

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`[FX] API error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        // Transform: frankfurter returns EUR -> X, we need X -> EUR
        const result: { [currency: string]: { [date: string]: number } } = {};

        for (const currency of currencies) {
            result[currency] = {};
        }

        // data.rates structure: { "2024-01-01": { "USD": 1.1034, "GBP": 0.8654, ... }, ... }
        if (data.rates) {
            for (const [date, rates] of Object.entries(data.rates)) {
                const ratesObj = rates as { [key: string]: number };
                for (const currency of currencies) {
                    if (ratesObj[currency]) {
                        // Invert rate: if 1 EUR = 1.10 USD, then 1 USD = 1/1.10 = 0.909 EUR
                        result[currency][date] = 1 / ratesObj[currency];
                    }
                }
            }
        }

        console.log(`[FX] Fetched ${Object.keys(data.rates || {}).length} days of rates`);
        return result;
    } catch (error) {
        console.error('[FX] Failed to fetch historical rates:', error);
        return null;
    }
}

/**
 * Initialize or update the historical rates cache
 * - If cache is empty, fetch all rates from 1999-01-04
 * - If cache exists, fetch only missing days since lastUpdated
 */
export async function updateHistoricalRatesCache(): Promise<HistoricalRatesCache | null> {
    const today = new Date().toISOString().split('T')[0];
    let cache = loadHistoricalRates();

    // ECB data starts from 1999-01-04
    const ECB_START_DATE = '1999-01-04';

    if (!cache) {
        // First time: fetch all historical rates
        console.log('[FX] Initializing historical exchange rates cache...');

        // Fetch in chunks to avoid timeout (max ~5 years at a time for safety)
        cache = {
            lastUpdated: today,
            rates: { USD: {}, GBP: {}, CHF: {} }
        };

        // Fetch rates in yearly chunks
        const startYear = 1999;
        const endYear = new Date().getFullYear();

        for (let year = startYear; year <= endYear; year++) {
            const chunkStart = year === startYear ? ECB_START_DATE : `${year}-01-01`;
            const chunkEnd = year === endYear ? today : `${year}-12-31`;

            const rates = await fetchHistoricalRates(chunkStart, chunkEnd);

            if (rates) {
                // Merge rates into cache
                for (const currency of SUPPORTED_CURRENCIES) {
                    cache.rates[currency] = {
                        ...cache.rates[currency],
                        ...rates[currency]
                    };
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        saveHistoricalRates(cache);
        return cache;
    }

    // Check if we need to update
    if (cache.lastUpdated >= today) {
        console.log('[FX] Cache is up to date');
        return cache;
    }

    // Fetch missing days
    const nextDay = new Date(cache.lastUpdated);
    nextDay.setDate(nextDay.getDate() + 1);
    const startDate = nextDay.toISOString().split('T')[0];

    console.log(`[FX] Updating cache from ${startDate} to ${today}`);

    const newRates = await fetchHistoricalRates(startDate, today);

    if (newRates) {
        // Merge new rates into cache
        for (const currency of SUPPORTED_CURRENCIES) {
            cache.rates[currency] = {
                ...cache.rates[currency],
                ...newRates[currency]
            };
        }
        cache.lastUpdated = today;
        saveHistoricalRates(cache);
    }

    return cache;
}

/**
 * Get the exchange rate for a specific date and currency
 * Falls back to most recent available rate if date is missing (weekend/holiday)
 */
export function getHistoricalRate(
    cache: HistoricalRatesCache,
    currency: string,
    date: Date | string
): number {
    // Handle GBX (pence) by converting to GBP first
    if (currency === 'GBX') {
        const gbpRate = getHistoricalRate(cache, 'GBP', date);
        return gbpRate / 100; // 100 pence = 1 GBP
    }

    // EUR is always 1
    if (currency === 'EUR') {
        return 1;
    }

    const dateStr = typeof date === 'string'
        ? date
        : date.toISOString().split('T')[0];

    const currencyRates = cache.rates[currency];

    if (!currencyRates) {
        console.warn(`[FX] No rates available for currency: ${currency}`);
        return 1; // Fallback to 1:1
    }

    // Try exact date first
    if (currencyRates[dateStr]) {
        return currencyRates[dateStr];
    }

    // Fallback: find most recent rate before the requested date
    const sortedDates = Object.keys(currencyRates).sort().reverse();

    for (const d of sortedDates) {
        if (d < dateStr) {
            return currencyRates[d];
        }
    }

    // If no earlier date found, use the earliest available
    if (sortedDates.length > 0) {
        return currencyRates[sortedDates[sortedDates.length - 1]];
    }

    console.warn(`[FX] No rate found for ${currency} on ${dateStr}`);
    return 1; // Ultimate fallback
}

/**
 * Convert an amount from a foreign currency to EUR using historical rate
 */
export function convertToEurHistorical(
    amount: number,
    currency: string,
    date: Date | string,
    cache: HistoricalRatesCache
): number {
    const rate = getHistoricalRate(cache, currency, date);
    return amount * rate;
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: HistoricalRatesCache): {
    lastUpdated: string;
    currencies: string[];
    totalDays: number;
    dateRange: { start: string; end: string } | null;
} {
    const currencies = Object.keys(cache.rates);
    let totalDays = 0;
    let allDates: string[] = [];

    for (const currency of currencies) {
        const dates = Object.keys(cache.rates[currency]);
        totalDays += dates.length;
        allDates = [...allDates, ...dates];
    }

    allDates.sort();

    return {
        lastUpdated: cache.lastUpdated,
        currencies,
        totalDays: Math.floor(totalDays / currencies.length), // Average per currency
        dateRange: allDates.length > 0
            ? { start: allDates[0], end: allDates[allDates.length - 1] }
            : null
    };
}
