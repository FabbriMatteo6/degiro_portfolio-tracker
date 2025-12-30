import { NextResponse } from 'next/server';
import { getHistoricalPrices, getCacheStats } from '@/lib/services/priceService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/historical-prices
 * 
 * Fetches historical price data for a given ticker symbol.
 * Uses file-system cache with 20-hour freshness.
 * 
 * Query params:
 * - ticker: Stock ticker symbol (e.g., "AAPL", "MSFT", "VWCE.DE")
 * - period: Time period (default: "5Y") - options: "1M", "3M", "6M", "1Y", "5Y", "MAX"
 * - stats: If "true", returns cache statistics instead of prices
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Check if requesting cache stats
    if (searchParams.get('stats') === 'true') {
        try {
            const stats = await getCacheStats();
            return NextResponse.json(stats);
        } catch (error) {
            return NextResponse.json(
                { error: 'Failed to get cache stats', details: String(error) },
                { status: 500 }
            );
        }
    }

    const ticker = searchParams.get('ticker');
    const period = searchParams.get('period') || '5Y';

    if (!ticker) {
        return NextResponse.json(
            { error: 'ticker parameter is required' },
            { status: 400 }
        );
    }

    try {
        const result = await getHistoricalPrices(ticker, period);

        return NextResponse.json({
            ticker,
            period,
            dataPoints: result.prices.length,
            source: result.source,
            lastUpdated: result.lastUpdated?.toISOString(),
            prices: result.prices,
        });
    } catch (error) {
        console.error(`[API] Error getting prices for ${ticker}:`, error);

        return NextResponse.json(
            { error: 'Failed to fetch historical prices', details: String(error) },
            { status: 500 }
        );
    }
}
