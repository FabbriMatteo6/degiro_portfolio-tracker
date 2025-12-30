/**
 * Price Service with File-System Caching
 * 
 * Provides historical price data with a 20-hour cache to minimize API calls.
 * Cache is stored in data_cache/price_history.json
 */

import fs from 'fs/promises';
import path from 'path';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const PRICE_CACHE_FILE = path.join(CACHE_DIR, 'price_history.json');
const FX_CACHE_FILE = path.join(CACHE_DIR, 'fx_history.json');

// Environment variables
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'real-time-finance-data.p.rapidapi.com';

// Type definitions
export interface PricePoint {
    date: string;
    close: number;
    adjClose?: number;
}

interface CacheEntry {
    lastUpdated: string;
    currency: string;
    history: PricePoint[];
}

interface PriceCache {
    [symbol: string]: CacheEntry;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
    try {
        await fs.access(CACHE_DIR);
    } catch {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        console.log('[CACHE] Created cache directory:', CACHE_DIR);
    }
}

/**
 * Load cache from disk
 */
async function loadCache(cacheFile: string): Promise<PriceCache> {
    try {
        const data = await fs.readFile(cacheFile, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * Save cache to disk
 */
async function saveCache(cacheFile: string, cache: PriceCache): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2));
}
/**
 * Check if cache entry is fresh (less than configured hours old)
 */
async function isCacheFresh(entry: CacheEntry | undefined): Promise<boolean> {
    if (!entry) return false;

    const { getCacheFreshnessHours } = await import('@/lib/utils/cacheConfig');
    const freshnessHours = await getCacheFreshnessHours();

    const lastUpdate = new Date(entry.lastUpdated);
    const hoursDiff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    return hoursDiff < freshnessHours;
}

/**
 * Fetch stock time series from RapidAPI
 */
async function fetchStockTimeSeries(symbol: string, period: string = '5Y'): Promise<PricePoint[] | null> {
    if (!RAPIDAPI_KEY) {
        console.error('[API] RapidAPI key not configured');
        return null;
    }

    try {
        const url = `https://${RAPIDAPI_HOST}/stock-time-series?symbol=${encodeURIComponent(symbol)}&period=${period}&language=en`;

        console.log(`[API] Fetching ${symbol}...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error(`[API] HTTP ${response.status} for ${symbol}`);
            return null;
        }

        const data = await response.json();

        if (data.status !== 'OK' || !data.data?.time_series) {
            console.error(`[API] Invalid response for ${symbol}:`, data.status);
            return null;
        }

        // Convert time_series object to array
        const timeSeries = data.data.time_series;
        const points: PricePoint[] = Object.entries(timeSeries)
            .map(([timestamp, values]: [string, any]) => ({
                date: timestamp,
                close: values.price || values.close || 0,
                adjClose: values.adj_close || values.price || values.close || 0,
            }))
            .filter(p => p.close > 0)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        console.log(`[API] Got ${points.length} price points for ${symbol}`);
        return points;
    } catch (error) {
        console.error(`[API] Error fetching ${symbol}:`, error);
        return null;
    }
}

/**
 * Get historical prices for a symbol with caching
 */
export async function getHistoricalPrices(symbol: string, period: string = '5Y'): Promise<{
    prices: PricePoint[];
    source: 'cache' | 'api' | 'empty';
    lastUpdated?: Date;
}> {
    await ensureCacheDir();

    // Load existing cache
    const cache = await loadCache(PRICE_CACHE_FILE);
    const entry = cache[symbol];

    // Return cached data if fresh
    if (await isCacheFresh(entry)) {
        console.log(`[CACHE HIT] ${symbol} (${entry.history.length} points)`);
        return {
            prices: entry.history,
            source: 'cache',
            lastUpdated: new Date(entry.lastUpdated),
        };
    }

    // Fetch fresh data from API
    console.log(`[CACHE MISS] ${symbol} - fetching from API...`);
    let freshData = await fetchStockTimeSeries(symbol, period);

    // Try Yahoo Finance 166 as fallback if primary API fails
    if (!freshData || freshData.length === 0) {
        console.log(`[FALLBACK] Primary API failed for ${symbol}, trying Yahoo Finance 166...`);
        const { fetchYahooStockChart, convertPeriodToYahoo } = await import('./yahooApiService');
        const yahooPeriod = convertPeriodToYahoo(period);
        const yahooData = await fetchYahooStockChart(symbol, yahooPeriod);

        if (yahooData && yahooData.length > 0) {
            freshData = yahooData;
            console.log(`[FALLBACK] Yahoo Finance 166 returned ${freshData.length} points for ${symbol}`);
        }
    }

    if (freshData && freshData.length > 0) {
        // Update cache
        cache[symbol] = {
            lastUpdated: new Date().toISOString(),
            currency: 'USD', // Default, could be detected from API
            history: freshData,
        };

        await saveCache(PRICE_CACHE_FILE, cache);
        console.log(`[CACHE UPDATE] ${symbol} saved with ${freshData.length} points`);

        return {
            prices: freshData,
            source: 'api',
            lastUpdated: new Date(),
        };
    }

    // Return stale cache if available, otherwise empty
    if (entry) {
        console.log(`[CACHE STALE] Using old data for ${symbol}`);
        return {
            prices: entry.history,
            source: 'cache',
            lastUpdated: new Date(entry.lastUpdated),
        };
    }

    return { prices: [], source: 'empty' };
}

/**
 * Fetch FX time series from RapidAPI
 * Currency pairs use format like EURUSD for EUR to USD rate
 */
async function fetchFxTimeSeries(fromCurrency: string, toCurrency: string): Promise<PricePoint[] | null> {
    if (!RAPIDAPI_KEY) {
        console.error('[FX API] RapidAPI key not configured');
        return null;
    }

    try {
        // Use forex-currency-exchange endpoint
        const symbol = `${fromCurrency}${toCurrency}=X`;
        const url = `https://${RAPIDAPI_HOST}/stock-time-series?symbol=${encodeURIComponent(symbol)}&period=5Y&language=en`;

        console.log(`[FX API] Fetching ${fromCurrency}/${toCurrency}...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error(`[FX API] HTTP ${response.status} for ${symbol}`);
            return null;
        }

        const data = await response.json();

        if (data.status !== 'OK' || !data.data?.time_series) {
            console.error(`[FX API] Invalid response for ${symbol}:`, data.status);
            return null;
        }

        const timeSeries = data.data.time_series;
        const points: PricePoint[] = Object.entries(timeSeries)
            .map(([timestamp, values]: [string, any]) => ({
                date: timestamp,
                close: values.price || values.close || 0,
            }))
            .filter(p => p.close > 0)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        console.log(`[FX API] Got ${points.length} FX points for ${fromCurrency}/${toCurrency}`);
        return points;
    } catch (error) {
        console.error(`[FX API] Error fetching ${fromCurrency}/${toCurrency}:`, error);
        return null;
    }
}

/**
 * Get historical FX rate with caching
 * Uses currency pairs like EURUSD=X for Forex
 */
export async function getHistoricalFxRate(fromCurrency: string, toCurrency: string = 'EUR'): Promise<{
    rates: PricePoint[];
    source: 'cache' | 'api' | 'empty';
    lastUpdated?: Date;
}> {
    const symbol = `${fromCurrency}${toCurrency}`;

    await ensureCacheDir();
    const cache = await loadCache(FX_CACHE_FILE);
    const entry = cache[symbol];

    if (await isCacheFresh(entry)) {
        console.log(`[FX CACHE HIT] ${symbol}`);
        return {
            rates: entry.history,
            source: 'cache',
            lastUpdated: new Date(entry.lastUpdated),
        };
    }

    // Fetch fresh FX data
    console.log(`[FX CACHE MISS] ${symbol} - fetching from API...`);
    const freshData = await fetchFxTimeSeries(fromCurrency, toCurrency);

    if (freshData && freshData.length > 0) {
        cache[symbol] = {
            lastUpdated: new Date().toISOString(),
            currency: toCurrency,
            history: freshData,
        };

        await saveCache(FX_CACHE_FILE, cache);
        console.log(`[FX CACHE UPDATE] ${symbol} saved with ${freshData.length} points`);

        return {
            rates: freshData,
            source: 'api',
            lastUpdated: new Date(),
        };
    }

    // Return stale cache if available
    if (entry) {
        console.log(`[FX CACHE STALE] Using old data for ${symbol}`);
        return {
            rates: entry.history,
            source: 'cache',
            lastUpdated: new Date(entry.lastUpdated),
        };
    }

    return { rates: [], source: 'empty' };
}

/**
 * Get FX rate for a specific date (or nearest available)
 */
export function getFxRateOnDate(rates: PricePoint[], targetDate: Date): number {
    if (rates.length === 0) return 1; // Default to 1 if no data

    const targetTime = targetDate.getTime();

    // Find the closest rate before or on the target date
    let closest = rates[0];
    for (const rate of rates) {
        const rateTime = new Date(rate.date).getTime();
        if (rateTime <= targetTime) {
            closest = rate;
        } else {
            break;
        }
    }

    return closest.close;
}

/**
 * Get price for a specific date (or nearest available)
 */
export function getPriceOnDate(prices: PricePoint[], targetDate: Date): number {
    if (prices.length === 0) return 0;

    const targetTime = targetDate.getTime();

    let closest = prices[0];
    for (const price of prices) {
        const priceTime = new Date(price.date).getTime();
        if (priceTime <= targetTime) {
            closest = price;
        } else {
            break;
        }
    }

    return closest.adjClose || closest.close;
}

/**
 * Get all cached symbols
 */
export async function getCachedSymbols(): Promise<string[]> {
    try {
        const cache = await loadCache(PRICE_CACHE_FILE);
        return Object.keys(cache);
    } catch {
        return [];
    }
}

/**
 * Clear specific symbol from cache
 */
export async function clearCacheForSymbol(symbol: string): Promise<void> {
    const cache = await loadCache(PRICE_CACHE_FILE);
    delete cache[symbol];
    await saveCache(PRICE_CACHE_FILE, cache);
    console.log(`[CACHE] Cleared ${symbol}`);
}

/**
 * Clear entire cache
 */
export async function clearAllCache(): Promise<void> {
    try {
        await fs.unlink(PRICE_CACHE_FILE);
        await fs.unlink(FX_CACHE_FILE);
        console.log('[CACHE] Cleared all cache files');
    } catch {
        // Files may not exist
    }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    symbolCount: number;
    totalDataPoints: number;
    oldestUpdate: Date | null;
    newestUpdate: Date | null;
}> {
    const cache = await loadCache(PRICE_CACHE_FILE);
    const entries = Object.values(cache);

    if (entries.length === 0) {
        return {
            symbolCount: 0,
            totalDataPoints: 0,
            oldestUpdate: null,
            newestUpdate: null,
        };
    }

    const dates = entries.map(e => new Date(e.lastUpdated).getTime());

    return {
        symbolCount: entries.length,
        totalDataPoints: entries.reduce((sum, e) => sum + e.history.length, 0),
        oldestUpdate: new Date(Math.min(...dates)),
        newestUpdate: new Date(Math.max(...dates)),
    };
}
