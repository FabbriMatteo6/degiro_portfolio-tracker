import { NextResponse } from 'next/server';
import { getHistoricalPrices, getHistoricalFxRate, getCacheStats } from '@/lib/services/priceService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portfolio-prices
 * 
 * Fetches historical prices for multiple tickers in a single request.
 * Uses file-system cache with 20-hour freshness.
 * 
 * Body:
 * {
 *   "tickers": ["AAPL", "MSFT", "VWCE.DE"],
 *   "currencies": ["USD", "GBP"],  // Optional: FX pairs to fetch
 *   "period": "5Y"  // Optional, default: 5Y
 * }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tickers = [], currencies = [], period = '5Y' } = body;

        if (!Array.isArray(tickers) || tickers.length === 0) {
            return NextResponse.json(
                { error: 'tickers array is required' },
                { status: 400 }
            );
        }

        // Limit batch size to avoid overwhelming API
        const maxTickers = 50;
        if (tickers.length > maxTickers) {
            return NextResponse.json(
                { error: `Maximum ${maxTickers} tickers per request` },
                { status: 400 }
            );
        }

        // Fetch all ticker prices in parallel
        const pricePromises = tickers.map(async (ticker: string) => {
            const result = await getHistoricalPrices(ticker, period);
            return {
                ticker,
                prices: result.prices,
                source: result.source,
                lastUpdated: result.lastUpdated?.toISOString(),
            };
        });

        // Fetch FX rates if requested
        const fxPromises = (currencies as string[]).map(async (currency: string) => {
            if (currency === 'EUR') {
                return { currency, rates: [], source: 'skip' };
            }
            const result = await getHistoricalFxRate(currency, 'EUR');
            return {
                currency,
                rates: result.rates,
                source: result.source,
                lastUpdated: result.lastUpdated?.toISOString(),
            };
        });

        const [priceResults, fxResults, cacheStats] = await Promise.all([
            Promise.all(pricePromises),
            Promise.all(fxPromises),
            getCacheStats(),
        ]);

        // Build response
        const priceData: Record<string, any> = {};
        let cachedCount = 0;
        let apiCount = 0;
        let emptyCount = 0;

        for (const result of priceResults) {
            priceData[result.ticker] = {
                prices: result.prices,
                dataPoints: result.prices.length,
                source: result.source,
                lastUpdated: result.lastUpdated,
            };

            if (result.source === 'cache') cachedCount++;
            else if (result.source === 'api') apiCount++;
            else emptyCount++;
        }

        const fxData: Record<string, any> = {};
        for (const result of fxResults) {
            if (result.source !== 'skip') {
                fxData[result.currency] = {
                    rates: result.rates,
                    dataPoints: result.rates.length,
                    source: result.source,
                };
            }
        }

        return NextResponse.json({
            priceData,
            fxData,
            summary: {
                tickersRequested: tickers.length,
                cachedCount,
                apiCount,
                emptyCount,
                currenciesRequested: currencies.length,
            },
            cacheStats,
        });
    } catch (error) {
        console.error('[API] Error getting portfolio prices:', error);
        return NextResponse.json(
            { error: 'Failed to fetch portfolio prices', details: String(error) },
            { status: 500 }
        );
    }
}
