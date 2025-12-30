import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const PRIMARY_HOST = process.env.RAPIDAPI_HOST || 'real-time-finance-data.p.rapidapi.com';
const YAHOO_HOST = process.env.RAPIDAPI_HOST_FALLBACK || 'yahoo-finance166.p.rapidapi.com';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const SPARKLINE_CACHE_FILE = path.join(CACHE_DIR, 'sparkline_prices.json');

interface SparklineEntry {
    ticker: string;
    prices: number[];  // 30 daily closing prices
    lastUpdated: string;
}

interface SparklineCache {
    [ticker: string]: SparklineEntry;
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
 * Load sparkline cache from disk
 */
async function loadCache(): Promise<SparklineCache> {
    try {
        const data = await fs.readFile(SPARKLINE_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * Save sparkline cache to disk
 */
async function saveCache(cache: SparklineCache): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(SPARKLINE_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Check if cache entry is fresh (within configured hours)
 */
async function isCacheFresh(entry: SparklineEntry | undefined): Promise<boolean> {
    if (!entry || !entry.lastUpdated) return false;

    const { getCacheFreshnessHours } = await import('@/lib/utils/cacheConfig');
    const freshnessHours = await getCacheFreshnessHours();

    const lastUpdate = new Date(entry.lastUpdated);
    const hoursDiff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    return hoursDiff < freshnessHours;
}

/**
 * Fetch 30-day price history from PRIMARY API
 */
async function fetchFromPrimaryApi(ticker: string): Promise<number[] | null> {
    if (!RAPIDAPI_KEY) return null;

    try {
        const url = `https://${PRIMARY_HOST}/stock-time-series?symbol=${encodeURIComponent(ticker)}&period=1M&language=en`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': PRIMARY_HOST,
            },
        });

        if (!response.ok) {
            console.log(`[SPARKLINE] Primary HTTP ${response.status} for ${ticker}`);
            return null;
        }

        const data = await response.json();

        if (data.status === 'OK' && data.data?.time_series) {
            // Extract closing prices from time series object
            const timeSeries = data.data.time_series;
            const entries = Object.entries(timeSeries)
                .map(([date, values]: [string, any]) => ({
                    date,
                    price: values.close || values.price || 0,
                }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Take last 30 entries
            const prices = entries.slice(-30).map(e => e.price);

            if (prices.length > 0) {
                console.log(`[SPARKLINE] Primary: ${ticker} → ${prices.length} points`);
                return prices;
            }
        }

        return null;
    } catch (error) {
        console.error(`[SPARKLINE] Primary error for ${ticker}:`, error);
        return null;
    }
}

/**
 * Fetch 30-day price history from YAHOO FINANCE fallback
 */
async function fetchFromYahooApi(ticker: string): Promise<number[] | null> {
    if (!RAPIDAPI_KEY) return null;

    try {
        // Calculate date range (last 45 days to ensure 30 trading days)
        const endDate = Math.floor(Date.now() / 1000);
        const startDate = endDate - (45 * 24 * 60 * 60);

        const url = `https://${YAHOO_HOST}/api/stock/get-chart?region=US&symbol=${encodeURIComponent(ticker)}&interval=1d&range=1mo`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YAHOO_HOST,
            },
        });

        if (!response.ok) {
            console.log(`[SPARKLINE] Yahoo HTTP ${response.status} for ${ticker}`);
            return null;
        }

        const data = await response.json();

        // Extract from Yahoo chart response
        const result = data.chart?.result?.[0];
        if (result?.indicators?.quote?.[0]?.close) {
            const closes = result.indicators.quote[0].close.filter((c: any) => c != null);
            if (closes.length > 0) {
                console.log(`[SPARKLINE] Yahoo: ${ticker} → ${closes.length} points`);
                return closes.slice(-30);
            }
        }

        return null;
    } catch (error) {
        console.error(`[SPARKLINE] Yahoo error for ${ticker}:`, error);
        return null;
    }
}

/**
 * Generate fallback data based on current price
 */
function generateFallbackData(currentPrice: number): number[] {
    const prices: number[] = [];
    let price = currentPrice * 0.95; // Start 5% lower

    for (let i = 0; i < 30; i++) {
        const change = (Math.random() - 0.48) * 0.02; // Slight upward bias
        price *= (1 + change);
        prices.push(price);
    }

    // Scale so last price matches current
    const scale = currentPrice / prices[prices.length - 1];
    return prices.map(p => p * scale);
}

// POST endpoint to fetch sparkline data for multiple tickers
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tickers, currentPrices } = body as {
            tickers: string[];
            currentPrices: Record<string, number>;
        };

        if (!tickers || !Array.isArray(tickers)) {
            return NextResponse.json({ error: 'tickers array required' }, { status: 400 });
        }

        await ensureCacheDir();
        const cache = await loadCache();
        const results: Record<string, number[]> = {};
        let cachedCount = 0;
        let fetchedCount = 0;
        let fallbackCount = 0;

        for (const ticker of tickers) {
            if (!ticker) continue;

            // Check cache first
            const cached = cache[ticker];
            if (cached && await isCacheFresh(cached) && cached.prices.length > 0) {
                results[ticker] = cached.prices;
                cachedCount++;
                continue;
            }

            // Try primary API
            let prices = await fetchFromPrimaryApi(ticker);

            // Try Yahoo fallback
            if (!prices || prices.length === 0) {
                prices = await fetchFromYahooApi(ticker);
            }

            // Use fallback data if APIs failed
            if (!prices || prices.length === 0) {
                const currentPrice = currentPrices?.[ticker] || 100;
                prices = generateFallbackData(currentPrice);
                fallbackCount++;
                console.log(`[SPARKLINE] Fallback: ${ticker} → synthetic data`);
            } else {
                fetchedCount++;
            }

            // Save to cache
            cache[ticker] = {
                ticker,
                prices,
                lastUpdated: new Date().toISOString(),
            };
            results[ticker] = prices;
        }

        // Save updated cache
        if (fetchedCount > 0 || fallbackCount > 0) {
            await saveCache(cache);
        }

        console.log(`[SPARKLINE] Results: ${cachedCount} cached, ${fetchedCount} fetched, ${fallbackCount} fallback`);

        return NextResponse.json({
            sparklines: results,
            summary: {
                total: tickers.length,
                cached: cachedCount,
                fetched: fetchedCount,
                fallback: fallbackCount,
            },
        });
    } catch (error) {
        console.error('[SPARKLINE] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

// GET endpoint to retrieve all cached sparkline data
export async function GET() {
    try {
        await ensureCacheDir();
        const cache = await loadCache();

        return NextResponse.json({
            sparklines: cache,
            count: Object.keys(cache).length,
        });
    } catch (error) {
        console.error('[SPARKLINE] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
