/**
 * ISIN Mapping Module
 * 
 * Provides classification data for securities loaded from cached API responses.
 * Uses Gemini LLM classification results stored in data_cache/isin_metadata.json.
 */

import { IsinMapping } from '@/types';

// Runtime cache for API-fetched mappings
let cachedMappings: IsinMapping | null = null;

/**
 * Load cached mappings from API response
 */
export function setCachedMappings(apiMappings: Array<{
    isin: string;
    name: string;
    sector: string;
    geography: string;
    assetClass: string;
}>): void {
    cachedMappings = {};
    for (const m of apiMappings) {
        cachedMappings[m.isin] = {
            name: m.name,
            sector: m.sector,
            geography: m.geography,
            assetClass: m.assetClass,
        };
    }
    console.log(`[ISIN MAPPING] Loaded ${apiMappings.length} classifications into runtime cache`);
}

/**
 * Clear cached mappings
 */
export function clearCachedMappings(): void {
    cachedMappings = null;
}

/**
 * Get geography from ISIN country code (fallback)
 */
function getGeographyFromIsin(isin: string): string {
    if (!isin || isin.length < 2) return 'Global';

    const countryMap: Record<string, string> = {
        'US': 'USA',
        'GB': 'UK',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'NL': 'Netherlands',
        'CH': 'Switzerland',
        'IE': 'Ireland',
        'LU': 'Luxembourg',
        'JP': 'Japan',
        'CN': 'China',
        'HK': 'Hong Kong',
        'AU': 'Australia',
        'CA': 'Canada',
        'KY': 'China',
    };

    return countryMap[isin.substring(0, 2)] || 'Global';
}

/**
 * Get mapping for an ISIN
 * Uses cached Gemini classification or fallback
 */
export function getIsinMapping(isin: string, productName?: string): {
    name: string;
    sector: string;
    geography: string;
    assetClass: string;
} {
    // Check cached mappings from API
    if (cachedMappings?.[isin]) {
        return cachedMappings[isin];
    }

    // Fallback with ISIN-based geography
    return {
        name: productName || 'Unknown',
        sector: 'Other',
        geography: getGeographyFromIsin(isin),
        assetClass: 'Stock',
    };
}

/**
 * Calculate allocation breakdown by category
 */
export function calculateAllocation(
    positions: { isin: string; valueEur: number; product?: string }[],
    category: 'sector' | 'geography' | 'assetClass'
) {
    const totals = new Map<string, number>();
    let totalValue = 0;

    for (const pos of positions) {
        const mapping = getIsinMapping(pos.isin, pos.product);
        const key = mapping[category];
        totals.set(key, (totals.get(key) || 0) + pos.valueEur);
        totalValue += pos.valueEur;
    }

    return Array.from(totals.entries())
        .map(([name, value]) => ({
            name,
            value,
            percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
}

// Empty static mapping for backward compatibility
export const isinMapping: IsinMapping = {};
export const staticIsinMapping = isinMapping;
