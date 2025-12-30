import { NextResponse } from 'next/server';
import { fetchForexRate } from '@/lib/services/rapidApiService';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const FX_CACHE_FILE = path.join(CACHE_DIR, 'fx_rates.json');

// Default fallback rates if all else fails
const DEFAULT_FALLBACK_RATES: Record<string, number> = {
    EUR: 1,
    USD: 0.95,
    GBP: 1.18,
    CHF: 1.06,
    GBX: 0.0118,
};

interface FxCache {
    lastUpdated: string;
    rates: Record<string, number>;
    source: string;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
    try {
        await fs.access(CACHE_DIR);
    } catch {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    }
}

/**
 * Load FX cache from disk
 */
async function loadFxCache(): Promise<FxCache | null> {
    try {
        const data = await fs.readFile(FX_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Save FX cache to disk
 */
async function saveFxCache(cache: FxCache): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(FX_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Check if cache is fresh (less than configured hours old)
 */
async function isCacheFresh(cache: FxCache | null): Promise<boolean> {
    if (!cache || !cache.lastUpdated) return false;

    const { getCacheFreshnessHours } = await import('@/lib/utils/cacheConfig');
    const freshnessHours = await getCacheFreshnessHours();

    const lastUpdate = new Date(cache.lastUpdated);
    const hoursDiff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    return hoursDiff < freshnessHours;
}

/**
 * Load fallback rates from config file
 */
async function loadFallbackRates(): Promise<Record<string, number>> {
    try {
        const configPath = path.join(process.cwd(), 'config', 'fallback-rates.json');
        const fileContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(fileContent);
        return config.fallbackRates || DEFAULT_FALLBACK_RATES;
    } catch {
        return DEFAULT_FALLBACK_RATES;
    }
}

/**
 * Fetch FX rate from Yahoo Finance 166
 */
async function fetchYahooFxRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
    const YAHOO_HOST = process.env.RAPIDAPI_HOST_FALLBACK || 'yahoo-finance166.p.rapidapi.com';

    if (!RAPIDAPI_KEY) return null;

    try {
        // Yahoo uses format like "USDEUR=X"
        const symbol = `${fromCurrency}${toCurrency}=X`;
        const url = `https://${YAHOO_HOST}/api/stock/get-price?region=US&symbol=${encodeURIComponent(symbol)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YAHOO_HOST,
            },
        });

        if (!response.ok) {
            console.log(`[YAHOO FX] HTTP ${response.status} for ${fromCurrency}/${toCurrency}`);
            return null;
        }

        const data = await response.json();
        const price = data.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;

        if (price && typeof price === 'number') {
            console.log(`[YAHOO FX] ${fromCurrency}/${toCurrency} = ${price}`);
            return price;
        }

        return null;
    } catch (error) {
        console.error(`[YAHOO FX] Error fetching ${fromCurrency}/${toCurrency}:`, error);
        return null;
    }
}

export async function GET() {
    await ensureCacheDir();

    // Check cache first
    const cache = await loadFxCache();
    if (await isCacheFresh(cache) && Object.keys(cache!.rates).length > 1) {
        console.log(`[FX CACHE HIT] Rates: EUR=${cache!.rates.EUR}, USD=${cache!.rates.USD}, GBP=${cache!.rates.GBP}`);
        return NextResponse.json({
            ...cache!.rates,
            source: 'cache',
            cacheAge: Math.round((Date.now() - new Date(cache!.lastUpdated).getTime()) / (1000 * 60 * 60)) + 'h',
        });
    }

    console.log('[FX CACHE MISS] Fetching fresh rates...');

    try {
        const rates: Record<string, number> = { EUR: 1 };
        let fetchedAny = false;

        // Step 1: Try primary RapidAPI
        const currencies = ['USD', 'GBP', 'CHF'];

        for (const curr of currencies) {
            try {
                const rate = await fetchForexRate(curr, 'EUR');
                if (rate) {
                    rates[curr] = rate;
                    fetchedAny = true;
                }
            } catch {
                // Will try Yahoo fallback
            }
        }

        // Step 2: Try Yahoo Finance 166 for any missing currencies
        if (!fetchedAny) {
            console.log('[FX FALLBACK] Primary API failed, trying Yahoo Finance 166...');
            for (const curr of currencies) {
                if (!rates[curr]) {
                    const yahooRate = await fetchYahooFxRate(curr, 'EUR');
                    if (yahooRate) {
                        rates[curr] = yahooRate;
                        fetchedAny = true;
                    }
                }
            }
        }

        // GBX (pence) to EUR
        if (rates['GBP']) {
            rates['GBX'] = rates['GBP'] / 100;
        }

        if (fetchedAny) {
            // Save to cache
            const newCache: FxCache = {
                lastUpdated: new Date().toISOString(),
                rates,
                source: 'api',
            };
            await saveFxCache(newCache);
            console.log(`[FX CACHE UPDATE] Saved rates: USD=${rates.USD}, GBP=${rates.GBP}, CHF=${rates.CHF}`);

            return NextResponse.json({ ...rates, source: 'api' });
        }

        throw new Error('All API sources failed');
    } catch (error) {
        // Step 3: Load from config file as last resort
        const fallbackRates = await loadFallbackRates();
        console.log('[FX] Using fallback rates from config/fallback-rates.json');

        return NextResponse.json({
            ...fallbackRates,
            source: 'fallback (config/fallback-rates.json)',
        });
    }
}
