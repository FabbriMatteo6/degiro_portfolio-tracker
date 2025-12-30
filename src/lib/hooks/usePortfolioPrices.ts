'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePortfolioStorage } from './usePortfolioStorage';

interface PricePoint {
    date: string;
    close: number;
    adjClose?: number;
}

interface PriceDataResult {
    prices: PricePoint[];
    dataPoints: number;
    source: 'cache' | 'api' | 'empty';
    lastUpdated?: string;
}

interface FxDataResult {
    rates: PricePoint[];
    dataPoints: number;
    source: 'cache' | 'api' | 'empty';
}

export interface PortfolioPricesData {
    priceData: Record<string, PriceDataResult>;
    fxData: Record<string, FxDataResult>;
    loading: boolean;
    error: string | null;
    summary: {
        tickersRequested: number;
        cachedCount: number;
        apiCount: number;
        emptyCount: number;
    } | null;
}

/**
 * Hook to fetch historical prices for portfolio positions
 * Uses ticker mappings from localStorage to determine which tickers to fetch
 */
export function usePortfolioPrices(
    positions: { isin: string; name: string; currency?: string }[]
): PortfolioPricesData {
    const { loadTickerMappings } = usePortfolioStorage();
    const [data, setData] = useState<PortfolioPricesData>({
        priceData: {},
        fxData: {},
        loading: false,
        error: null,
        summary: null,
    });

    const fetchPrices = useCallback(async () => {
        if (positions.length === 0) return;

        const mappings = loadTickerMappings();

        // Get tickers from mappings
        const tickers: string[] = [];
        const currencies = new Set<string>();

        for (const pos of positions) {
            const mapping = mappings[pos.isin];
            if (mapping?.ticker) {
                tickers.push(mapping.ticker);
            }
            if (pos.currency && pos.currency !== 'EUR') {
                currencies.add(pos.currency);
            }
        }

        if (tickers.length === 0) {
            setData(prev => ({
                ...prev,
                loading: false,
                error: 'No ticker mappings configured. Open Settings to add mappings.',
            }));
            return;
        }

        setData(prev => ({ ...prev, loading: true, error: null }));

        try {
            const response = await fetch('/api/portfolio-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tickers,
                    currencies: Array.from(currencies),
                    period: '5Y',
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            setData({
                priceData: result.priceData || {},
                fxData: result.fxData || {},
                loading: false,
                error: null,
                summary: result.summary,
            });
        } catch (error) {
            console.error('Failed to fetch portfolio prices:', error);
            setData(prev => ({
                ...prev,
                loading: false,
                error: `Failed to fetch prices: ${error}`,
            }));
        }
    }, [positions, loadTickerMappings]);

    useEffect(() => {
        fetchPrices();
    }, [fetchPrices]);

    return data;
}

/**
 * Get price for a specific ISIN on a specific date using loaded price data
 */
export function getPriceForIsin(
    isin: string,
    date: Date,
    priceData: Record<string, PriceDataResult>,
    mappings: Record<string, { ticker: string }>
): number {
    const mapping = mappings[isin];
    if (!mapping?.ticker) return 0;

    const prices = priceData[mapping.ticker]?.prices || [];
    if (prices.length === 0) return 0;

    const targetTime = date.getTime();
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
