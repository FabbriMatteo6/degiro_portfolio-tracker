/**
 * Hook for fetching historical prices for yearly TWR calculations
 * 
 * Fetches and caches historical prices for all portfolio positions
 * to enable yearly performance grid calculations.
 * 
 * Uses session-level caching via useRef to prevent repeated API calls.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { Transaction } from '@/types';
import { calculateAllYearlyTWR, YearlyReturn } from '@/lib/calculations/calculateYearlyTWR';

interface PriceData {
    [ticker: string]: {
        date: string;
        close: number;
    }[];
}

interface UseYearlyPerformanceResult {
    yearlyReturns: YearlyReturn[];
    loading: boolean;
    error: string | null;
    priceData: PriceData;
    fetchYearlyPerformance: (
        transactions: Transaction[],
        tickerMappings: Record<string, { ticker: string; name: string }>,
        exchangeRates?: Record<string, number>
    ) => Promise<void>;
    clearCache: () => void;
}

// Session-level cache (persists across re-renders)
const sessionCache: {
    priceData: PriceData;
    yearlyReturns: YearlyReturn[];
    fetchedTickers: Set<string>;
    lastFetchTime: number;
} = {
    priceData: {},
    yearlyReturns: [],
    fetchedTickers: new Set(),
    lastFetchTime: 0,
};

// Cache freshness: 5 minutes for session cache
const SESSION_CACHE_FRESHNESS_MS = 5 * 60 * 1000;

/**
 * Hook that calculates yearly TWR for portfolio performance grid
 */
export function useYearlyPerformance(): UseYearlyPerformanceResult {
    const [yearlyReturns, setYearlyReturns] = useState<YearlyReturn[]>(sessionCache.yearlyReturns);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isFetching = useRef(false);

    const clearCache = useCallback(() => {
        sessionCache.priceData = {};
        sessionCache.yearlyReturns = [];
        sessionCache.fetchedTickers.clear();
        sessionCache.lastFetchTime = 0;
        setYearlyReturns([]);
    }, []);

    const fetchYearlyPerformance = useCallback(async (
        transactions: Transaction[],
        tickerMappings: Record<string, { ticker: string; name: string }>,
        exchangeRates: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.08 }
    ) => {
        if (transactions.length === 0) {
            setYearlyReturns([]);
            return;
        }

        // Check if cache is still fresh
        const now = Date.now();
        if (
            sessionCache.yearlyReturns.length > 0 &&
            now - sessionCache.lastFetchTime < SESSION_CACHE_FRESHNESS_MS
        ) {
            console.log('[YearlyPerformance] Using session cache');
            setYearlyReturns(sessionCache.yearlyReturns);
            return;
        }

        // Prevent concurrent fetches
        if (isFetching.current) {
            console.log('[YearlyPerformance] Fetch already in progress, skipping');
            return;
        }

        isFetching.current = true;
        setLoading(true);
        setError(null);

        try {
            // Get unique tickers from mappings
            const isinsWithTickers = transactions
                .map(tx => tx.isin)
                .filter((isin, idx, arr) => isin && arr.indexOf(isin) === idx)
                .filter(isin => tickerMappings[isin]?.ticker);

            const uniqueTickers = [...new Set(
                isinsWithTickers.map(isin => tickerMappings[isin].ticker)
            )];

            if (uniqueTickers.length === 0) {
                console.warn('[YearlyPerformance] No ticker mappings found');
                setYearlyReturns([]);
                setLoading(false);
                isFetching.current = false;
                return;
            }

            // Only fetch tickers not already in cache
            const tickersToFetch = uniqueTickers.filter(
                ticker => !sessionCache.fetchedTickers.has(ticker)
            );

            console.log(`[YearlyPerformance] Fetching ${tickersToFetch.length} tickers (${uniqueTickers.length - tickersToFetch.length} cached)`);

            // Fetch historical prices for each ticker not in cache
            if (tickersToFetch.length > 0) {
                await Promise.all(
                    tickersToFetch.map(async (ticker) => {
                        try {
                            const response = await fetch(
                                `/api/historical-prices?ticker=${encodeURIComponent(ticker)}&period=MAX`
                            );

                            if (response.ok) {
                                const data = await response.json();
                                if (data.prices && Array.isArray(data.prices)) {
                                    sessionCache.priceData[ticker] = data.prices;
                                    sessionCache.fetchedTickers.add(ticker);
                                }
                            }
                        } catch (err) {
                            console.warn(`[YearlyPerformance] Failed to fetch prices for ${ticker}:`, err);
                        }
                    })
                );
            }

            // Calculate yearly TWR using cached prices
            const returns = calculateAllYearlyTWR(
                transactions,
                sessionCache.priceData,
                tickerMappings,
                exchangeRates,
                new Date()
            );

            // Update session cache
            sessionCache.yearlyReturns = returns;
            sessionCache.lastFetchTime = Date.now();

            setYearlyReturns(returns);
        } catch (err) {
            console.error('[YearlyPerformance] Error calculating yearly returns:', err);
            setError(err instanceof Error ? err.message : 'Failed to calculate yearly returns');
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    }, []);

    return {
        yearlyReturns,
        loading,
        error,
        priceData: sessionCache.priceData,
        fetchYearlyPerformance,
        clearCache,
    };
}

