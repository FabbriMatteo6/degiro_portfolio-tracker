import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
    analyzePortfolio,
    isAnalystConfigured,
    getAnalystConfigOptions,
    UserProfile,
    PortfolioSnapshot,
    AnalysisResult
} from '@/lib/services/geminiAnalystService';

export const dynamic = 'force-dynamic';

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), 'data_cache');
const ANALYSIS_CACHE_FILE = path.join(CACHE_DIR, 'portfolio_analysis.json');

interface CachedAnalysis {
    userProfile: UserProfile;
    analysis: AnalysisResult;
    cachedAt: string;
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
 * Load cached analysis
 */
async function loadCachedAnalysis(): Promise<CachedAnalysis | null> {
    try {
        const data = await fs.readFile(ANALYSIS_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Save analysis to cache
 */
async function saveAnalysisToCache(userProfile: UserProfile, analysis: AnalysisResult): Promise<void> {
    await ensureCacheDir();
    const cached: CachedAnalysis = {
        userProfile,
        analysis,
        cachedAt: new Date().toISOString(),
    };
    await fs.writeFile(ANALYSIS_CACHE_FILE, JSON.stringify(cached, null, 2));
}

// GET - Retrieve cached analysis and config options
export async function GET() {
    try {
        await ensureCacheDir();
        const cached = await loadCachedAnalysis();
        const configOptions = await getAnalystConfigOptions();

        return NextResponse.json({
            cached,
            configOptions,
            isConfigured: isAnalystConfigured(),
        });
    } catch (error) {
        console.error('[ANALYST API] GET error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

// POST - Run portfolio analysis
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userProfile, portfolioSnapshot, forceReanalyze } = body as {
            userProfile: UserProfile;
            portfolioSnapshot: PortfolioSnapshot;
            forceReanalyze?: boolean;
        };

        if (!userProfile || !portfolioSnapshot) {
            return NextResponse.json(
                { error: 'userProfile and portfolioSnapshot are required' },
                { status: 400 }
            );
        }

        if (!isAnalystConfigured()) {
            return NextResponse.json(
                { error: 'Gemini API key not configured' },
                { status: 503 }
            );
        }

        // Check cache unless force reanalyze
        if (!forceReanalyze) {
            const cached = await loadCachedAnalysis();
            if (cached && cached.analysis) {
                // Check if user profile matches (simple comparison)
                const profileMatches = JSON.stringify(cached.userProfile) === JSON.stringify(userProfile);
                if (profileMatches) {
                    console.log('[ANALYST API] Returning cached analysis');
                    return NextResponse.json({
                        analysis: cached.analysis,
                        fromCache: true,
                    });
                }
            }
        }

        console.log('[ANALYST API] Running new analysis...');

        // Run analysis
        const analysis = await analyzePortfolio(userProfile, portfolioSnapshot);

        if (!analysis) {
            return NextResponse.json(
                { error: 'Analysis failed. Please try again.' },
                { status: 500 }
            );
        }

        // Cache result
        await saveAnalysisToCache(userProfile, analysis);
        console.log('[ANALYST API] Analysis cached');

        return NextResponse.json({
            analysis,
            fromCache: false,
        });
    } catch (error) {
        console.error('[ANALYST API] POST error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

// DELETE - Clear cached analysis
export async function DELETE() {
    try {
        await ensureCacheDir();

        try {
            await fs.unlink(ANALYSIS_CACHE_FILE);
            console.log('[ANALYST API] Cache cleared');
        } catch {
            // File doesn't exist, that's fine
        }

        return NextResponse.json({ message: 'Analysis cache cleared' });
    } catch (error) {
        console.error('[ANALYST API] DELETE error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
