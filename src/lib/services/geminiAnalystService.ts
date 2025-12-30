/**
 * Gemini Analyst Service
 * 
 * Uses Google Gemini LLM to analyze portfolio and provide personalized advice.
 * Features:
 * - 3 model fallback chain
 * - Structured JSON responses
 * - Comprehensive portfolio context
 */

import { promises as fs } from 'fs';
import path from 'path';

// Configuration paths
const CONFIG_PATH = path.join(process.cwd(), 'config', 'gemini-analyst.json');

// API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY_PORTFOLIO || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface AnalystConfig {
    models: {
        primary: string;
        secondary: string;
        tertiary: string;
    };
    userInputOptions: {
        riskTolerance: string[];
        investingObjective: string[];
        incomeLevel: string[];
    };
    prompt: {
        system: string;
        user: string;
    };
}

export interface UserProfile {
    age: number;
    riskTolerance: string;
    investingObjective: string;
    investingDeadline: number; // years
    monthlyInvestmentCapacity: number;
    incomeLevel: string;
    existingDebts: number;
    countryOfResidence: string;
}

export interface PortfolioSnapshot {
    totalValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPercent: number;
    cashBalance: number;
    positions: {
        name: string;
        isin: string;
        value: number;
        percentage: number;
        sector: string;
        geography: string;
        assetClass: string;
    }[];
    allocations: {
        bySector: { name: string; value: number; percentage: number }[];
        byGeography: { name: string; value: number; percentage: number }[];
        byAssetClass: { name: string; value: number; percentage: number }[];
    };
    metrics: {
        twr: number;
        mwr: number;
        cagr: number;
        sharpeRatio: number;
        sortinoRatio: number;
        maxDrawdown: number;
        volatility: number;
    };
    benchmarkComparison?: {
        sp500Return: number;
        msciWorldReturn: number;
    };
}

export interface AnalysisResult {
    healthScore: number;
    healthScoreReason: string;
    riskAssessment: {
        currentRisk: string;
        matchesProfile: boolean;
        explanation: string;
    };
    diversificationAnalysis: {
        sectorDiversification: string;
        geographicDiversification: string;
        assetClassDiversification: string;
        details: string;
    };
    benchmarkComparison: {
        vsSP500: string;
        vsMSCIWorld: string;
        commentary: string;
    };
    suggestions: string[];
    warnings: string[];
    targetAllocation: Record<string, number>;
    timelineGoals: {
        onTrack: boolean;
        projectedValue: string;
        monthlyNeeded: string;
        analysis: string;
    };
    generatedAt: string;
}

let cachedConfig: AnalystConfig | null = null;

/**
 * Load Gemini analyst config
 */
async function loadConfig(): Promise<AnalystConfig> {
    if (cachedConfig) return cachedConfig;

    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        cachedConfig = JSON.parse(data);
        return cachedConfig!;
    } catch (error) {
        console.error('[ANALYST] Failed to load config:', error);
        throw new Error('Gemini analyst config not found');
    }
}

/**
 * Export config options for UI dropdowns
 */
export async function getAnalystConfigOptions(): Promise<AnalystConfig['userInputOptions']> {
    const config = await loadConfig();
    return config.userInputOptions;
}

/**
 * Format user profile for prompt
 */
function formatUserProfile(profile: UserProfile): string {
    return `
- Age: ${profile.age} years old
- Risk Tolerance: ${profile.riskTolerance}
- Investment Objective: ${profile.investingObjective}
- Investment Timeline: ${profile.investingDeadline} years
- Monthly Investment Capacity: €${profile.monthlyInvestmentCapacity.toLocaleString()}
- Annual Income Level: ${profile.incomeLevel}
- Existing Debts: €${profile.existingDebts.toLocaleString()}
- Country of Residence: ${profile.countryOfResidence}
`.trim();
}

/**
 * Format portfolio summary for prompt
 */
function formatPortfolioSummary(snapshot: PortfolioSnapshot): string {
    return `
- Total Portfolio Value: €${snapshot.totalValue.toLocaleString()}
- Total Cost Basis: €${snapshot.totalCost.toLocaleString()}
- Total Gain/Loss: €${snapshot.totalGain.toLocaleString()} (${(snapshot.totalGainPercent).toFixed(2)}%)
- Cash Balance: €${snapshot.cashBalance.toLocaleString()}
- Number of Positions: ${snapshot.positions.length}

Top 5 Holdings:
${snapshot.positions.slice(0, 5).map(p => `  - ${p.name}: €${p.value.toLocaleString()} (${p.percentage.toFixed(1)}%)`).join('\n')}
`.trim();
}

/**
 * Format allocations for prompt
 */
function formatAllocations(allocations: PortfolioSnapshot['allocations']): string {
    const formatList = (items: { name: string; percentage: number }[]) =>
        items.slice(0, 5).map(i => `  - ${i.name}: ${i.percentage.toFixed(1)}%`).join('\n');

    return `
By Sector:
${formatList(allocations.bySector)}

By Geography:
${formatList(allocations.byGeography)}

By Asset Class:
${formatList(allocations.byAssetClass)}
`.trim();
}

/**
 * Format metrics for prompt
 */
function formatMetrics(metrics: PortfolioSnapshot['metrics'], benchmark?: PortfolioSnapshot['benchmarkComparison']): string {
    let result = `
- Time-Weighted Return (TWR): ${(metrics.twr * 100).toFixed(2)}%
- Money-Weighted Return (MWR/IRR): ${(metrics.mwr * 100).toFixed(2)}%
- CAGR: ${(metrics.cagr * 100).toFixed(2)}%
- Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}
- Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}
- Maximum Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%
- Volatility: ${(metrics.volatility * 100).toFixed(2)}%
`.trim();

    if (benchmark) {
        result += `\n\nBenchmark Returns:
- S&P 500 Return: ${(benchmark.sp500Return * 100).toFixed(2)}%
- MSCI World Return: ${(benchmark.msciWorldReturn * 100).toFixed(2)}%`;
    }

    return result;
}

/**
 * Call Gemini API with a specific model
 */
async function callGeminiModel(
    model: string,
    systemPrompt: string,
    userPrompt: string
): Promise<string | null> {
    if (!GEMINI_API_KEY) {
        console.error('[ANALYST] No API key configured');
        return null;
    }

    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
        ],
        generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
        }
    };

    try {
        console.log(`[ANALYST] Calling ${model}...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ANALYST] ${model} HTTP ${response.status}: ${errorText.substring(0, 200)}`);

            if (response.status === 429) {
                console.log(`[ANALYST] ${model} rate limited, trying fallback...`);
                return null;
            }

            return null;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            console.log(`[ANALYST] ${model} returned response`);
            return text;
        }

        console.error(`[ANALYST] ${model} unexpected response structure`);
        return null;
    } catch (error) {
        console.error(`[ANALYST] ${model} error:`, error);
        return null;
    }
}

/**
 * Call Gemini with model fallback chain
 */
async function callGeminiWithFallback(
    systemPrompt: string,
    userPrompt: string,
    config: AnalystConfig
): Promise<string | null> {
    const models = [config.models.primary, config.models.secondary, config.models.tertiary];

    for (const model of models) {
        const result = await callGeminiModel(model, systemPrompt, userPrompt);
        if (result) return result;
    }

    console.error('[ANALYST] All models failed');
    return null;
}

/**
 * Parse JSON from Gemini response
 */
function parseJsonResponse(response: string): AnalysisResult | null {
    try {
        let cleaned = response.trim();

        // Try direct parse first
        try {
            return JSON.parse(cleaned);
        } catch {
            // Continue to extraction
        }

        // Extract from markdown code blocks
        const codeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            return JSON.parse(codeBlockMatch[1].trim());
        }

        // Extract JSON object
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return JSON.parse(cleaned);
    } catch (error) {
        console.error('[ANALYST] Failed to parse JSON response:', response.substring(0, 300) + '...');
        return null;
    }
}

/**
 * Main analysis function
 */
export async function analyzePortfolio(
    userProfile: UserProfile,
    portfolioSnapshot: PortfolioSnapshot
): Promise<AnalysisResult | null> {
    const config = await loadConfig();

    console.log('[ANALYST] Starting portfolio analysis...');

    // Build prompt with all context
    const userPromptTemplate = config.prompt.user;
    const userPrompt = userPromptTemplate
        .replace('{{userProfile}}', formatUserProfile(userProfile))
        .replace('{{portfolioSummary}}', formatPortfolioSummary(portfolioSnapshot))
        .replace('{{allocations}}', formatAllocations(portfolioSnapshot.allocations))
        .replace('{{metrics}}', formatMetrics(portfolioSnapshot.metrics, portfolioSnapshot.benchmarkComparison))
        .replace('{{benchmarks}}', portfolioSnapshot.benchmarkComparison
            ? `S&P 500: ${(portfolioSnapshot.benchmarkComparison.sp500Return * 100).toFixed(2)}%, MSCI World: ${(portfolioSnapshot.benchmarkComparison.msciWorldReturn * 100).toFixed(2)}%`
            : 'Not available');

    const response = await callGeminiWithFallback(
        config.prompt.system,
        userPrompt,
        config
    );

    if (!response) {
        console.error('[ANALYST] Failed to get analysis from Gemini');
        return null;
    }

    const result = parseJsonResponse(response);

    if (result) {
        result.generatedAt = new Date().toISOString();
        console.log('[ANALYST] Analysis complete');
    }

    return result;
}

/**
 * Check if API key is configured
 */
export function isAnalystConfigured(): boolean {
    return !!GEMINI_API_KEY;
}
