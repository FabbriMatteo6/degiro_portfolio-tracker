import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'real-time-finance-data.p.rapidapi.com';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const BENCHMARK_CACHE_FILE = path.join(CACHE_DIR, 'benchmark_history.json');

interface BenchmarkCache {
    lastUpdated: string;
    spy: { date: string; value: number }[];
    urth: { date: string; value: number }[];
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
 * Load benchmark cache from disk
 */
async function loadCache(): Promise<BenchmarkCache | null> {
    try {
        const data = await fs.readFile(BENCHMARK_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Save benchmark cache to disk
 */
async function saveCache(cache: BenchmarkCache): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(BENCHMARK_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Check if cache is fresh (less than configured hours old)
 */
async function isCacheFresh(cache: BenchmarkCache | null): Promise<boolean> {
    if (!cache || !cache.lastUpdated) return false;

    const { getCacheFreshnessHours } = await import('@/lib/utils/cacheConfig');
    const freshnessHours = await getCacheFreshnessHours();

    const lastUpdate = new Date(cache.lastUpdated);
    const hoursDiff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    return hoursDiff < freshnessHours;
}

function generateMockData(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sp500: { date: string; value: number }[] = [];
    const msciWorld: { date: string; value: number }[] = [];

    let sp500Value = 450;
    let msciValue = 120;

    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
        const months = (current.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000);
        sp500Value *= 1 + (0.008 + Math.cos(months * 0.2) * 0.01);
        msciValue *= 1 + (0.006 + Math.cos(months * 0.3) * 0.008);

        sp500.push({ date: current.toISOString(), value: sp500Value });
        msciWorld.push({ date: current.toISOString(), value: msciValue });

        current.setMonth(current.getMonth() + 1);
    }

    return { sp500, msciWorld };
}

interface TimeSeriesPoint {
    price: number;
    change: number;
    change_percent: number;
}

function parseTimeSeries(timeSeries: Record<string, TimeSeriesPoint>): { date: string; value: number }[] {
    return Object.entries(timeSeries)
        .map(([timestamp, data]) => ({
            date: timestamp,
            value: data.price,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function fetchSymbol(symbol: string): Promise<{ date: string; value: number }[] | null> {
    try {
        const url = `https://${RAPIDAPI_HOST}/stock-time-series?symbol=${encodeURIComponent(symbol)}&period=5Y&language=en`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST,
            },
            cache: 'no-store',
        });

        const data = await response.json();
        const timeSeries = data.data?.time_series;

        if (data.status === 'OK' && timeSeries && typeof timeSeries === 'object') {
            const entries = Object.keys(timeSeries);
            if (entries.length > 0) {
                return parseTimeSeries(timeSeries);
            }
        }

        // Primary API failed, try Yahoo Finance 166 fallback
        console.log(`[BENCHMARK FALLBACK] Primary API failed for ${symbol}, trying Yahoo Finance 166...`);
        const { fetchYahooStockChart } = await import('@/lib/services/yahooApiService');

        // Convert symbol format (SPY:NYSEARCA -> SPY)
        const ticker = symbol.split(':')[0];
        const yahooData = await fetchYahooStockChart(ticker, '5y');

        if (yahooData && yahooData.length > 0) {
            console.log(`[BENCHMARK FALLBACK] Yahoo Finance 166 returned ${yahooData.length} points for ${ticker}`);
            return yahooData.map(p => ({ date: p.date, value: p.close }));
        }

        return null;
    } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
        return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
    }

    await ensureCacheDir();

    // Check cache first
    const cache = await loadCache();
    if (await isCacheFresh(cache) && cache!.spy.length > 0 && cache!.urth.length > 0) {
        console.log(`[BENCHMARK CACHE HIT] SPY: ${cache!.spy.length} points, URTH: ${cache!.urth.length} points`);

        const startMs = new Date(startDate).getTime();
        const endMs = new Date(endDate).getTime();

        const sp500 = cache!.spy.filter(d => {
            const dateMs = new Date(d.date).getTime();
            return dateMs >= startMs && dateMs <= endMs;
        });

        const msciWorld = cache!.urth.filter(d => {
            const dateMs = new Date(d.date).getTime();
            return dateMs >= startMs && dateMs <= endMs;
        });

        return NextResponse.json({
            sp500,
            msciWorld,
            source: 'cache',
            cacheAge: Math.round((Date.now() - new Date(cache!.lastUpdated).getTime()) / (1000 * 60 * 60)) + 'h',
            spyPoints: cache!.spy.length,
            urthPoints: cache!.urth.length,
        });
    }

    // Cache miss - fetch fresh data
    console.log('[BENCHMARK CACHE MISS] Fetching fresh data from API...');

    try {
        // Fetch both SPY (S&P 500) and URTH (MSCI World) from API
        const [spyData, urthData] = await Promise.all([
            fetchSymbol('SPY:NYSEARCA'),
            fetchSymbol('URTH:NYSEARCA'),
        ]);

        if (spyData && spyData.length > 0) {
            // Save to cache
            const newCache: BenchmarkCache = {
                lastUpdated: new Date().toISOString(),
                spy: spyData,
                urth: urthData || [],
            };
            await saveCache(newCache);
            console.log(`[BENCHMARK CACHE UPDATE] Saved SPY: ${spyData.length}, URTH: ${urthData?.length || 0} points`);

            const startMs = new Date(startDate).getTime();
            const endMs = new Date(endDate).getTime();

            // Filter S&P 500 to date range
            const sp500 = spyData.filter(d => {
                const dateMs = new Date(d.date).getTime();
                return dateMs >= startMs && dateMs <= endMs;
            });

            // Filter MSCI World to date range (or approximate from SPY if not available)
            let msciWorld: { date: string; value: number }[];

            if (urthData && urthData.length > 0) {
                msciWorld = urthData.filter(d => {
                    const dateMs = new Date(d.date).getTime();
                    return dateMs >= startMs && dateMs <= endMs;
                });
            } else {
                // Fallback: approximate MSCI World from SPY if URTH data not available
                msciWorld = sp500.map(d => ({
                    date: d.date,
                    value: d.value * 0.22, // Approximate price ratio
                }));
            }

            return NextResponse.json({
                sp500,
                msciWorld,
                source: 'api',
                spyPoints: spyData.length,
                urthPoints: urthData?.length || 0,
            });
        }

        throw new Error('No valid time series data');
    } catch (error) {
        console.warn('RapidAPI failed:', error);
        return NextResponse.json({
            ...generateMockData(startDate, endDate),
            source: 'mock',
            error: String(error),
        });
    }
}
