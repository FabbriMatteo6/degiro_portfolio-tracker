'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePortfolioStorage } from './usePortfolioStorage';
import { setCachedMappings } from '@/lib/data/isinMapping';

interface IsinMetadata {
    isin: string;
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    geography: string;
    assetClass: string;
    lastUpdated: string;
}

interface UseIsinMetadataResult {
    isLoading: boolean;
    fetchMetadata: (isins: string[], productNames: Record<string, string>) => Promise<void>;
    metadata: IsinMetadata[];
    summary: { total: number; cached: number; fetched: number } | null;
}

/**
 * Hook to fetch and cache ISIN metadata (sector, geography, assetClass)
 * Automatically integrates with ticker mappings from localStorage
 */
export function useIsinMetadata(): UseIsinMetadataResult {
    const [isLoading, setIsLoading] = useState(false);
    const [metadata, setMetadata] = useState<IsinMetadata[]>([]);
    const [summary, setSummary] = useState<{ total: number; cached: number; fetched: number } | null>(null);
    const { loadTickerMappings } = usePortfolioStorage();

    /**
     * Fetch metadata for a list of ISINs
     * Uses ticker mappings from localStorage to resolve ISIN → ticker
     */
    const fetchMetadata = useCallback(async (
        isins: string[],
        productNames: Record<string, string>
    ) => {
        if (isins.length === 0) return;

        setIsLoading(true);

        try {
            // Load ticker mappings
            const storedMappings = loadTickerMappings();

            // Build ticker mappings with product names as fallback
            const tickerMappings: Record<string, { ticker: string; name: string }> = {};
            for (const isin of isins) {
                const storedMapping = storedMappings[isin];
                tickerMappings[isin] = {
                    ticker: storedMapping?.ticker || '',
                    name: storedMapping?.name || productNames[isin] || 'Unknown',
                };
            }

            // Call API to fetch metadata
            const response = await fetch('/api/isin-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isins, tickerMappings }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Update local state
            setMetadata(data.metadata);
            setSummary(data.summary);

            // Update runtime cache in isinMapping module
            if (data.metadata && data.metadata.length > 0) {
                setCachedMappings(data.metadata);
                console.log(`[ISIN METADATA] Loaded ${data.metadata.length} mappings into runtime cache`);
            }
        } catch (error) {
            console.error('[ISIN METADATA] Error fetching:', error);
        } finally {
            setIsLoading(false);
        }
    }, [loadTickerMappings]);

    return {
        isLoading,
        fetchMetadata,
        metadata,
        summary,
    };
}
