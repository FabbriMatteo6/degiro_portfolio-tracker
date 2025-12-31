/**
 * Yahoo Finance 15 Fallback API Service (Third Fallback)
 * Used when both primary API and yahoo-finance166 are rate-limited
 * 
 * API Host: yahoo-finance15.p.rapidapi.com
 * Endpoint: /api/v1/markets/stock/history
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const YAHOO15_HOST = 'yahoo-finance15.p.rapidapi.com';

/**
 * Convert period to interval and difftime parameters for yahoo-finance15
 */
function convertPeriodToYahoo15(period: string): { interval: string; difftime: string } {
    switch (period.toUpperCase()) {
        case '1D':
            return { interval: '1m', difftime: '1d' };
        case '5D':
            return { interval: '15m', difftime: '5d' };
        case '1M':
        case '1MO':
            return { interval: '1d', difftime: '1mo' };
        case '6M':
        case '6MO':
            return { interval: '1d', difftime: '6mo' };
        case '1Y':
            return { interval: '1d', difftime: '1y' };
        case '5Y':
            return { interval: '1d', difftime: '5y' };
        case 'MAX':
        default:
            return { interval: '1d', difftime: 'max' };
    }
}

/**
 * Fetch stock history from Yahoo Finance 15 API
 */
export async function fetchYahoo15StockHistory(
    symbol: string,
    period: string = '5Y'
): Promise<{ date: string; close: number; adjClose: number }[] | null> {
    if (!RAPIDAPI_KEY) {
        console.error('[YAHOO15 API] No API key configured');
        return null;
    }

    try {
        // Map common exchange suffixes
        let yahooSymbol = symbol;
        if (symbol.includes(':')) {
            // Convert TICKER:EXCHANGE format to Yahoo format
            const [ticker, exchange] = symbol.split(':');
            if (exchange === 'XETRA' || exchange === 'FRA') {
                yahooSymbol = `${ticker}.DE`;
            } else if (exchange === 'LSE') {
                yahooSymbol = `${ticker}.L`;
            } else if (exchange === 'SWX') {
                yahooSymbol = `${ticker}.SW`;
            } else {
                yahooSymbol = ticker;
            }
        }

        const { interval, difftime } = convertPeriodToYahoo15(period);
        const url = `https://${YAHOO15_HOST}/api/v1/markets/stock/history?symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&diffandsplits=false`;

        console.log(`[YAHOO15 API] Fetching ${yahooSymbol} (${difftime})...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YAHOO15_HOST,
            },
        });

        if (!response.ok) {
            console.error(`[YAHOO15 API] HTTP ${response.status} for ${yahooSymbol}`);
            return null;
        }

        const data = await response.json();

        // Handle the response structure from yahoo-finance15
        // Response format: { meta: {...}, body: { date: { open, close, high, low, volume } } }
        if (!data.body || typeof data.body !== 'object') {
            console.error(`[YAHOO15 API] No body data for ${yahooSymbol}`);
            return null;
        }

        const body = data.body;
        const points: { date: string; close: number; adjClose: number }[] = [];

        // Body is an object with timestamps as keys
        for (const [timestamp, values] of Object.entries(body)) {
            const priceData = values as { open?: number; close?: number; high?: number; low?: number };
            if (priceData.close != null && priceData.close > 0) {
                // Convert Unix timestamp to ISO date
                const date = new Date(parseInt(timestamp) * 1000).toISOString().slice(0, 10);
                points.push({
                    date,
                    close: priceData.close,
                    adjClose: priceData.close, // This API doesn't provide adjusted close
                });
            }
        }

        // Sort by date
        points.sort((a, b) => a.date.localeCompare(b.date));

        console.log(`[YAHOO15 API] Got ${points.length} points for ${yahooSymbol}`);
        return points;
    } catch (error) {
        console.error(`[YAHOO15 API] Error fetching ${symbol}:`, error);
        return null;
    }
}
