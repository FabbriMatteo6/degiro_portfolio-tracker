import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { classifySecurities, isGeminiConfigured } from '@/lib/services/geminiClassificationService';

export const dynamic = 'force-dynamic';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const ISIN_CACHE_FILE = path.join(CACHE_DIR, 'isin_metadata.json');

interface IsinMetadata {
    isin: string;
    ticker: string;
    name: string;
    sector: string;
    geography: string;
    assetClass: string;
    lastUpdated: string;
    needsRetry?: boolean;  // Flag for items that failed classification
}

interface IsinCache {
    [isin: string]: IsinMetadata;
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
 * Load ISIN metadata cache from disk
 */
async function loadCache(): Promise<IsinCache> {
    try {
        const data = await fs.readFile(ISIN_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * Save ISIN metadata cache to disk
 */
async function saveCache(cache: IsinCache): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(ISIN_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Check if cached entry is valid (has real sector, not "Other", and doesn't need retry)
 */
function isCacheEntryValid(entry: IsinMetadata | undefined): boolean {
    if (!entry) return false;
    if (entry.needsRetry) return false;  // Needs retry
    if (entry.sector === 'Other') return false;  // Failed classification
    return true;
}

/**
 * Get geography from ISIN country code as fallback
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

// POST endpoint to fetch metadata for multiple ISINs using Gemini
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { isins, tickerMappings, forceRetry } = body as {
            isins: string[];
            tickerMappings: Record<string, { ticker: string; name: string }>;
            forceRetry?: boolean;  // Force re-classification of all
        };

        if (!isins || !Array.isArray(isins)) {
            return NextResponse.json({ error: 'isins array required' }, { status: 400 });
        }

        await ensureCacheDir();
        const cache = await loadCache();
        const results: IsinMetadata[] = [];
        const uncachedIsins: string[] = [];
        let cachedCount = 0;
        let retryCount = 0;

        // Separate cached from uncached ISINs
        for (const isin of isins) {
            const cached = cache[isin];

            // Skip cache if forceRetry is true
            if (forceRetry) {
                uncachedIsins.push(isin);
                if (cached?.needsRetry || cached?.sector === 'Other') {
                    retryCount++;
                }
                continue;
            }

            // Use cache only if valid
            if (isCacheEntryValid(cached)) {
                results.push(cached);
                cachedCount++;
            } else {
                uncachedIsins.push(isin);
                if (cached?.needsRetry || cached?.sector === 'Other') {
                    retryCount++;
                }
            }
        }

        console.log(`[ISIN API] ${cachedCount} cached, ${uncachedIsins.length} need classification (${retryCount} retries)`);

        // Classify uncached ISINs using Gemini
        if (uncachedIsins.length > 0 && isGeminiConfigured()) {
            // Prepare input for Gemini
            const securitiesToClassify = uncachedIsins.map(isin => ({
                isin,
                productName: tickerMappings?.[isin]?.name || 'Unknown',
                ticker: tickerMappings?.[isin]?.ticker,
            }));

            try {
                // Call Gemini for classification (3 parallel calls)
                const classification = await classifySecurities(securitiesToClassify);

                // Build metadata from Gemini results
                let successCount = 0;
                let failCount = 0;

                for (const isin of uncachedIsins) {
                    const mapping = tickerMappings?.[isin];
                    const sector = classification.sector[isin] || 'Other';
                    const isSuccess = sector !== 'Other';

                    const metadata: IsinMetadata = {
                        isin,
                        ticker: mapping?.ticker || '',
                        name: mapping?.name || 'Unknown',
                        sector,
                        geography: classification.geography[isin] || getGeographyFromIsin(isin),
                        assetClass: classification.assetClass[isin] || 'Stock',
                        lastUpdated: new Date().toISOString(),
                        needsRetry: !isSuccess,  // Mark for retry if classification failed
                    };

                    // Only cache if successful (don't cache "Other" permanently)
                    if (isSuccess) {
                        cache[isin] = metadata;
                        successCount++;
                    } else {
                        // Still cache but mark as needsRetry so we try again next time
                        cache[isin] = metadata;
                        failCount++;
                    }

                    results.push(metadata);
                    console.log(`[ISIN API] ${isin} → ${metadata.sector}, ${metadata.geography}, ${metadata.assetClass}${metadata.needsRetry ? ' (retry)' : ''}`);
                }

                // Save updated cache
                await saveCache(cache);
                console.log(`[ISIN API] Saved: ${successCount} classified, ${failCount} need retry`);
            } catch (error) {
                console.error('[ISIN API] Gemini classification failed:', error);

                // Fallback: return basic metadata with ISIN-based geography
                // Mark all as needsRetry so they get tried next time
                for (const isin of uncachedIsins) {
                    const mapping = tickerMappings?.[isin];
                    const fallbackData: IsinMetadata = {
                        isin,
                        ticker: mapping?.ticker || '',
                        name: mapping?.name || 'Unknown',
                        sector: 'Other',
                        geography: getGeographyFromIsin(isin),
                        assetClass: 'Stock',
                        lastUpdated: new Date().toISOString(),
                        needsRetry: true,  // Will retry on next refresh
                    };

                    cache[isin] = fallbackData;
                    results.push(fallbackData);
                }

                // Save cache with retry flags
                await saveCache(cache);
                console.log(`[ISIN API] Gemini failed, ${uncachedIsins.length} items marked for retry`);
            }
        } else if (uncachedIsins.length > 0) {
            console.warn('[ISIN API] Gemini not configured, using fallback');

            // Fallback without Gemini - mark as needsRetry
            for (const isin of uncachedIsins) {
                const mapping = tickerMappings?.[isin];
                results.push({
                    isin,
                    ticker: mapping?.ticker || '',
                    name: mapping?.name || 'Unknown',
                    sector: 'Other',
                    geography: getGeographyFromIsin(isin),
                    assetClass: 'Stock',
                    lastUpdated: new Date().toISOString(),
                    needsRetry: true,
                });
            }
        }

        return NextResponse.json({
            metadata: results,
            summary: {
                total: isins.length,
                cached: cachedCount,
                classified: uncachedIsins.length,
                retried: retryCount,
            },
        });
    } catch (error) {
        console.error('[ISIN API] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

// GET endpoint to retrieve all cached metadata
export async function GET() {
    try {
        await ensureCacheDir();
        const cache = await loadCache();

        const metadata = Object.values(cache);
        const needsRetryCount = metadata.filter(m => m.needsRetry).length;

        return NextResponse.json({
            metadata,
            count: metadata.length,
            needsRetry: needsRetryCount,
        });
    } catch (error) {
        console.error('[ISIN API] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

// DELETE endpoint to clear cache (force re-classification)
export async function DELETE() {
    try {
        await ensureCacheDir();
        await fs.writeFile(ISIN_CACHE_FILE, '{}');
        console.log('[ISIN API] Cache cleared');

        return NextResponse.json({ message: 'Cache cleared' });
    } catch (error) {
        console.error('[ISIN API] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
