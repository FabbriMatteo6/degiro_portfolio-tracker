/**
 * Gemini Classification Service
 * 
 * Uses Google Gemini LLM with Google Search grounding to classify securities
 * into asset class, sector, and geography categories.
 * 
 * Features:
 * - 3 model fallback chain
 * - Google Search grounding for accurate real-time data
 * - Structured JSON responses
 * - Rate limit handling
 */

import { promises as fs } from 'fs';
import path from 'path';

// Configuration paths
const CONFIG_PATH = path.join(process.cwd(), 'config', 'gemini-classification.json');

// API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY_PORTFOLIO || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiConfig {
    models: {
        primary: string;
        secondary: string;
        tertiary: string;
    };
    enableGrounding: boolean;
    assetClasses: string[];
    sectors: string[];
    prompts: {
        assetClass: { system: string; user: string };
        sector: { system: string; user: string };
        geography: { system: string; user: string };
    };
}

interface SecurityInput {
    isin: string;
    productName: string;
    ticker?: string;
}

interface ClassificationResult {
    assetClass: Record<string, string>;
    sector: Record<string, string>;
    geography: Record<string, string>;
}

let cachedConfig: GeminiConfig | null = null;

/**
 * Load Gemini classification config
 */
async function loadConfig(): Promise<GeminiConfig> {
    if (cachedConfig) return cachedConfig;

    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        cachedConfig = JSON.parse(data);
        return cachedConfig!;
    } catch (error) {
        console.error('[GEMINI] Failed to load config:', error);
        throw new Error('Gemini classification config not found');
    }
}

/**
 * Format securities for prompt
 */
function formatSecuritiesForPrompt(securities: SecurityInput[]): string {
    return securities.map(s => {
        const parts = [`ISIN: ${s.isin}`, `Product: ${s.productName}`];
        if (s.ticker) parts.push(`Ticker: ${s.ticker}`);
        return parts.join(', ');
    }).join('\n');
}

/**
 * Build prompt with template substitution
 */
function buildPrompt(
    template: string,
    securities: SecurityInput[],
    config: GeminiConfig,
    type: 'assetClass' | 'sector' | 'geography'
): string {
    let prompt = template;
    prompt = prompt.replace('{{securities}}', formatSecuritiesForPrompt(securities));
    prompt = prompt.replace('{{assetClasses}}', config.assetClasses.join(', '));
    prompt = prompt.replace('{{sectors}}', config.sectors.join(', '));
    return prompt;
}

/**
 * Call Gemini API with a specific model
 */
async function callGeminiModel(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    enableGrounding: boolean
): Promise<string | null> {
    if (!GEMINI_API_KEY) {
        console.error('[GEMINI] No API key configured');
        return null;
    }

    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Build request body
    // NOTE: responseMimeType and tools (grounding) are mutually exclusive in Gemini
    // We prioritize JSON mode for reliable parsing over grounding
    const requestBody: Record<string, unknown> = {
        contents: [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
        ],
        generationConfig: {
            temperature: 1.0,  // Gemini 3 recommended default
            topP: 0.8,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',  // Enforce structured JSON output
            thinkingConfig: {
                thinkingLevel: 'low'  // Minimize latency for simple classifications
            }
        }
        // Note: Google Search grounding disabled because it's incompatible with JSON mode
    };

    try {
        console.log(`[GEMINI] Calling ${model}...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GEMINI] ${model} HTTP ${response.status}: ${errorText}`);

            // Check for rate limit
            if (response.status === 429) {
                console.log(`[GEMINI] ${model} rate limited, trying fallback...`);
                return null;
            }

            return null;
        }

        const data = await response.json();

        // Check finish reason for truncation
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
            console.warn(`[GEMINI] ${model} finish reason: ${finishReason}`);
        }

        // Extract text from response
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
            console.log(`[GEMINI] ${model} returned response (${text.length} chars, finishReason: ${finishReason})`);
            return text;
        }

        console.error(`[GEMINI] ${model} unexpected response structure:`, JSON.stringify(data, null, 2));
        return null;
    } catch (error) {
        console.error(`[GEMINI] ${model} error:`, error);
        return null;
    }
}

/**
 * Call Gemini with model fallback chain
 */
async function callGeminiWithFallback(
    systemPrompt: string,
    userPrompt: string,
    config: GeminiConfig
): Promise<string | null> {
    const models = [config.models.primary, config.models.secondary, config.models.tertiary];

    for (const model of models) {
        const result = await callGeminiModel(model, systemPrompt, userPrompt, config.enableGrounding);
        if (result) return result;
    }

    console.error('[GEMINI] All models failed');
    return null;
}

/**
 * Parse JSON from Gemini response (handles markdown code blocks and mixed content)
 */
function parseJsonResponse(response: string): Record<string, string> | null {
    try {
        let cleaned = response.trim();

        // Try direct parse first (for strict JSON responses)
        try {
            const result = JSON.parse(cleaned);
            if (typeof result === 'object' && result !== null) {
                return result;
            }
        } catch {
            // Continue to extraction methods
        }

        // Extract JSON from markdown code blocks
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch {
                // Continue to other methods
            }
        }

        // Extract JSON object - find first { and last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(jsonCandidate);
            } catch {
                // Continue to other methods
            }
        }

        // Legacy markdown removal
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        return JSON.parse(cleaned);
    } catch (error) {
        console.error('[GEMINI] Failed to parse JSON response. Full response:');
        console.error(response);
        console.error('[GEMINI] Parse error:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}

/**
 * Classify securities by asset class
 */
async function classifyAssetClass(
    securities: SecurityInput[],
    config: GeminiConfig
): Promise<Record<string, string>> {
    const prompt = buildPrompt(
        config.prompts.assetClass.user,
        securities,
        config,
        'assetClass'
    );

    console.log('[GEMINI] Classifying asset classes...');
    const response = await callGeminiWithFallback(
        config.prompts.assetClass.system,
        prompt,
        config
    );

    if (!response) return {};

    const result = parseJsonResponse(response);
    return result || {};
}

/**
 * Classify securities by sector
 */
async function classifySector(
    securities: SecurityInput[],
    config: GeminiConfig
): Promise<Record<string, string>> {
    const prompt = buildPrompt(
        config.prompts.sector.user,
        securities,
        config,
        'sector'
    );

    console.log('[GEMINI] Classifying sectors...');
    const response = await callGeminiWithFallback(
        config.prompts.sector.system,
        prompt,
        config
    );

    if (!response) return {};

    const result = parseJsonResponse(response);
    return result || {};
}

/**
 * Classify securities by geography
 */
async function classifyGeography(
    securities: SecurityInput[],
    config: GeminiConfig
): Promise<Record<string, string>> {
    const prompt = buildPrompt(
        config.prompts.geography.user,
        securities,
        config,
        'geography'
    );

    console.log('[GEMINI] Classifying geography...');
    const response = await callGeminiWithFallback(
        config.prompts.geography.system,
        prompt,
        config
    );

    if (!response) return {};

    const result = parseJsonResponse(response);
    return result || {};
}

/**
 * Main classification function
 * Makes 3 distinct calls for asset class, sector, and geography
 */
export async function classifySecurities(
    securities: SecurityInput[]
): Promise<ClassificationResult> {
    if (securities.length === 0) {
        return { assetClass: {}, sector: {}, geography: {} };
    }

    const config = await loadConfig();

    console.log(`[GEMINI] Classifying ${securities.length} securities...`);

    // Make 3 parallel calls for efficiency
    const [assetClass, sector, geography] = await Promise.all([
        classifyAssetClass(securities, config),
        classifySector(securities, config),
        classifyGeography(securities, config),
    ]);

    console.log(`[GEMINI] Classification complete: ${Object.keys(assetClass).length} asset classes, ${Object.keys(sector).length} sectors, ${Object.keys(geography).length} geographies`);

    return { assetClass, sector, geography };
}

/**
 * Check if API key is configured
 */
export function isGeminiConfigured(): boolean {
    return !!GEMINI_API_KEY;
}
