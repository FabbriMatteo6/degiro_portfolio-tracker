/**
 * API endpoint for historical exchange rates
 * 
 * GET: Retrieve cached historical rates
 * POST: Update cache with latest rates
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    loadHistoricalRates,
    updateHistoricalRatesCache,
    getCacheStats
} from '@/lib/services/historicalExchangeRateService';

/**
 * GET /api/historical-exchange-rates
 * Returns the cached historical exchange rates
 */
export async function GET() {
    try {
        const cache = loadHistoricalRates();

        if (!cache) {
            return NextResponse.json(
                {
                    error: 'Cache not initialized',
                    message: 'POST to this endpoint to initialize the cache'
                },
                { status: 404 }
            );
        }

        const stats = getCacheStats(cache);

        return NextResponse.json({
            ...stats,
            rates: cache.rates
        });
    } catch (error) {
        console.error('Error reading historical rates:', error);
        return NextResponse.json(
            { error: 'Failed to read historical rates' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/historical-exchange-rates
 * Updates the cache with any missing rates
 */
export async function POST(request: NextRequest) {
    try {
        console.log('[API] Updating historical exchange rates cache...');

        const cache = await updateHistoricalRatesCache();

        if (!cache) {
            return NextResponse.json(
                { error: 'Failed to update historical rates cache' },
                { status: 500 }
            );
        }

        const stats = getCacheStats(cache);

        return NextResponse.json({
            success: true,
            message: 'Historical exchange rates cache updated',
            ...stats
        });
    } catch (error) {
        console.error('Error updating historical rates:', error);
        return NextResponse.json(
            { error: 'Failed to update historical rates' },
            { status: 500 }
        );
    }
}
