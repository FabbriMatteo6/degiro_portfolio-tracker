/**
 * Yahoo Finance 166 Fallback API Service
 * Used when the primary RapidAPI (real-time-finance-data) is rate-limited
 * 
 * API Host: yahoo-finance166.p.rapidapi.com
 * See: https://rapidapi.com/yahoo-finance166/
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const YAHOO_HOST = process.env.RAPIDAPI_HOST_FALLBACK || 'yahoo-finance166.p.rapidapi.com';

// Yahoo Finance API response structures
interface YahooChartResponse {
    chart: {
        result?: Array<{
            meta: {
                symbol: string;
                currency: string;
                regularMarketPrice: number;
            };
            timestamp?: number[];
            indicators: {
                quote: Array<{
                    close?: (number | null)[];
                    high?: (number | null)[];
                    low?: (number | null)[];
                    open?: (number | null)[];
                    volume?: (number | null)[];
                }>;
                adjclose?: Array<{
                    adjclose?: (number | null)[];
                }>;
            };
        }>;
        error?: {
            code: string;
            description: string;
        };
    };
}

/**
 * Fetch stock chart data from Yahoo Finance 166 API
 * Uses the stockGetChart endpoint with proper date ranges
 */
export async function fetchYahooStockChart(
    symbol: string,
    period: '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max' = '5y'
): Promise<{ date: string; close: number; adjClose: number }[] | null> {
    if (!RAPIDAPI_KEY) {
        console.error('[YAHOO API] No API key configured');
        return null;
    }

    try {
        // Map common exchange suffixes
        let yahooSymbol = symbol;
        if (!symbol.includes('.') && !symbol.includes(':')) {
            // Default to no suffix for US stocks
            yahooSymbol = symbol;
        } else if (symbol.includes(':')) {
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

        const interval = period === '1d' || period === '5d' ? '1h' : '1d';
        const url = `https://${YAHOO_HOST}/api/stock/get-chart?region=US&symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&range=${period}`;

        console.log(`[YAHOO API] Fetching ${yahooSymbol} (${period})...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YAHOO_HOST,
            },
        });

        if (!response.ok) {
            console.error(`[YAHOO API] HTTP ${response.status} for ${yahooSymbol}`);
            return null;
        }

        const data: YahooChartResponse = await response.json();

        if (data.chart?.error) {
            console.error(`[YAHOO API] Error for ${yahooSymbol}:`, data.chart.error.description);
            return null;
        }

        const result = data.chart?.result?.[0];
        if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) {
            console.error(`[YAHOO API] No chart data for ${yahooSymbol}`);
            return null;
        }

        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        const adjCloses = result.indicators.adjclose?.[0]?.adjclose || closes;

        const points: { date: string; close: number; adjClose: number }[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const close = closes[i];
            const adjClose = adjCloses?.[i];
            if (close != null && adjClose != null) {
                points.push({
                    date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
                    close,
                    adjClose,
                });
            }
        }

        console.log(`[YAHOO API] Got ${points.length} points for ${yahooSymbol}`);
        return points;
    } catch (error) {
        console.error(`[YAHOO API] Error fetching ${symbol}:`, error);
        return null;
    }
}

/**
 * Fetch market quotes (multiple symbols at once)
 */
export async function fetchYahooQuotes(
    symbols: string[]
): Promise<Record<string, { price: number; change: number; changePercent: number }> | null> {
    if (!RAPIDAPI_KEY || symbols.length === 0) {
        return null;
    }

    try {
        const symbolsParam = symbols.join(',');
        const url = `https://${YAHOO_HOST}/api/market/get-quotes?symbols=${encodeURIComponent(symbolsParam)}&region=US`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': YAHOO_HOST,
            },
        });

        if (!response.ok) {
            console.error(`[YAHOO API] Quotes HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        const quotes: Record<string, { price: number; change: number; changePercent: number }> = {};

        if (data.quoteResponse?.result) {
            for (const quote of data.quoteResponse.result) {
                quotes[quote.symbol] = {
                    price: quote.regularMarketPrice || 0,
                    change: quote.regularMarketChange || 0,
                    changePercent: quote.regularMarketChangePercent || 0,
                };
            }
        }

        return quotes;
    } catch (error) {
        console.error('[YAHOO API] Error fetching quotes:', error);
        return null;
    }
}

/**
 * Convert Yahoo period to standard format
 */
export function convertPeriodToYahoo(period: string): '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max' {
    const mapping: Record<string, '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max'> = {
        '1D': '1d',
        '5D': '5d',
        '1M': '1mo',
        '6M': '6mo',
        'YTD': 'ytd',
        '1Y': '1y',
        '5Y': '5y',
        'MAX': 'max',
    };
    return mapping[period] || '5y';
}
