'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePortfolioStorage } from './usePortfolioStorage';

interface UseSparklinePricesResult {
    isLoading: boolean;
    sparklineData: Record<string, number[]>;
    fetchSparklines: (positions: { isin: string; lastPrice: number }[]) => Promise<void>;
}

/**
 * Hook to fetch 30-day sparkline price data for holdings
 * Uses cached data when available, fetches from API otherwise
 */
export function useSparklinePrices(): UseSparklinePricesResult {
    const [isLoading, setIsLoading] = useState(false);
    const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
    const { loadTickerMappings } = usePortfolioStorage();
    const fetchedRef = useRef(false);

    /**
     * Fetch sparkline data for positions
     */
    const fetchSparklines = useCallback(async (
        positions: { isin: string; lastPrice: number }[]
    ) => {
        if (positions.length === 0 || fetchedRef.current) return;

        setIsLoading(true);
        fetchedRef.current = true;

        try {
            // Load ticker mappings
            const tickerMappings = loadTickerMappings();

            // Get tickers for each position
            const tickers: string[] = [];
            const currentPrices: Record<string, number> = {};
            const isinToTicker: Record<string, string> = {};

            for (const pos of positions) {
                const mapping = tickerMappings[pos.isin];
                if (mapping?.ticker) {
                    tickers.push(mapping.ticker);
                    currentPrices[mapping.ticker] = pos.lastPrice;
                    isinToTicker[pos.isin] = mapping.ticker;
                }
            }

            if (tickers.length === 0) {
                console.log('[SPARKLINE] No tickers mapped, skipping fetch');
                setIsLoading(false);
                return;
            }

            // Fetch sparkline data from API
            const response = await fetch('/api/sparkline-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickers, currentPrices }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Map ticker results back to ISINs
            const isinData: Record<string, number[]> = {};
            for (const pos of positions) {
                const ticker = isinToTicker[pos.isin];
                if (ticker && data.sparklines?.[ticker]) {
                    isinData[pos.isin] = data.sparklines[ticker];
                }
            }

            setSparklineData(isinData);
            console.log(`[SPARKLINE] Loaded data for ${Object.keys(isinData).length} positions`);
        } catch (error) {
            console.error('[SPARKLINE] Error fetching:', error);
        } finally {
            setIsLoading(false);
        }
    }, [loadTickerMappings]);

    return {
        isLoading,
        sparklineData,
        fetchSparklines,
    };
}
