'use client';

import { useState, useEffect, useCallback } from 'react';
import { HistoricalRatesCache } from '@/lib/services/historicalExchangeRateService';

interface UseHistoricalRatesResult {
    cache: HistoricalRatesCache | null;
    loading: boolean;
    error: string | null;
    updateCache: () => Promise<void>;
    convertToEur: (amount: number, currency: string, date: Date | string) => number;
}

/**
 * Hook to use historical exchange rates for currency conversion
 */
export function useHistoricalRates(): UseHistoricalRatesResult {
    const [cache, setCache] = useState<HistoricalRatesCache | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch cached rates on mount
    useEffect(() => {
        const fetchCache = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/historical-exchange-rates');

                if (response.status === 404) {
                    // Cache not initialized, trigger update
                    console.log('[FX Hook] Cache not found, initializing...');
                    await updateCacheInternal();
                    return;
                }

                if (!response.ok) {
                    throw new Error('Failed to fetch historical rates');
                }

                const data = await response.json();
                setCache({
                    lastUpdated: data.lastUpdated,
                    rates: data.rates
                });
            } catch (err) {
                console.error('[FX Hook] Error:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchCache();
    }, []);

    // Update cache function
    const updateCacheInternal = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/historical-exchange-rates', {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to update historical rates');
            }

            const data = await response.json();
            setCache({
                lastUpdated: data.lastUpdated,
                rates: data.rates
            });
        } catch (err) {
            console.error('[FX Hook] Update error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const updateCache = useCallback(async () => {
        await updateCacheInternal();
    }, []);

    // Convert amount to EUR using historical rate
    const convertToEur = useCallback((
        amount: number,
        currency: string,
        date: Date | string
    ): number => {
        if (!cache) {
            // No cache available, return amount as-is (will use current rates)
            return amount;
        }

        // Handle GBX (pence) by converting to GBP first
        if (currency === 'GBX') {
            const gbpRate = getRate(cache, 'GBP', date);
            return amount * (gbpRate / 100);
        }

        // EUR is always 1
        if (currency === 'EUR') {
            return amount;
        }

        const rate = getRate(cache, currency, date);
        return amount * rate;
    }, [cache]);

    return {
        cache,
        loading,
        error,
        updateCache,
        convertToEur
    };
}

/**
 * Get rate from cache with fallback logic
 */
function getRate(
    cache: HistoricalRatesCache,
    currency: string,
    date: Date | string
): number {
    const dateStr = typeof date === 'string'
        ? date
        : date.toISOString().split('T')[0];

    const currencyRates = cache.rates[currency];

    if (!currencyRates) {
        console.warn(`[FX] No rates for currency: ${currency}`);
        return 1;
    }

    // Try exact date
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

    // Use earliest available
    if (sortedDates.length > 0) {
        return currencyRates[sortedDates[sortedDates.length - 1]];
    }

    return 1;
}
