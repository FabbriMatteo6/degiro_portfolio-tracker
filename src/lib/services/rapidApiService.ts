/**
 * RapidAPI Real-Time Finance Data service
 * API: https://rapidapi.com/letscrape-6bRBa3QguO5/api/real-time-finance-data
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'real-time-finance-data.p.rapidapi.com';

// Response structure from RapidAPI
interface ApiResponse<T> {
    status: 'OK' | 'ERROR';
    request_id: string;
    data?: T;
    error?: { message: string; code: number };
}

interface StockQuoteData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    previous_close: number;
}

interface TimeSeriesPoint {
    date: string;
    price: number;
}

interface StockTimeSeriesData {
    symbol: string;
    name: string;
    price: number;
    time_series: TimeSeriesPoint[];
}

interface CurrencyExchangeData {
    from_symbol: string;
    to_symbol: string;
    exchange_rate: number;
    previous_close: number;
}

/**
 * Fetch stock quote from RapidAPI
 */
export async function fetchStockQuote(symbol: string): Promise<StockQuoteData | null> {
    try {
        const response = await fetch(
            `https://${RAPIDAPI_HOST}/stock-quote?symbol=${encodeURIComponent(symbol)}&language=en`,
            {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': RAPIDAPI_HOST,
                },
            }
        );

        if (!response.ok) {
            console.error('Stock quote API error:', response.status);
            return null;
        }

        const result: ApiResponse<StockQuoteData> = await response.json();

        if (result.status === 'OK' && result.data) {
            return result.data;
        }

        console.error('Stock quote API error:', result.error?.message);
        return null;
    } catch (error) {
        console.error('Failed to fetch stock quote:', error);
        return null;
    }
}

/**
 * Fetch forex/currency exchange rate from RapidAPI
 */
export async function fetchForexRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    try {
        const response = await fetch(
            `https://${RAPIDAPI_HOST}/currency-exchange-rate?from_symbol=${fromCurrency}&to_symbol=${toCurrency}&language=en`,
            {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': RAPIDAPI_HOST,
                },
            }
        );

        if (!response.ok) {
            console.error('Forex API error:', response.status);
            return null;
        }

        const result: ApiResponse<CurrencyExchangeData> = await response.json();

        if (result.status === 'OK' && result.data?.exchange_rate) {
            return result.data.exchange_rate;
        }

        console.error('Forex API error:', result.error?.message);
        return null;
    } catch (error) {
        console.error('Failed to fetch forex rate:', error);
        return null;
    }
}

/**
 * Fetch stock time series data from RapidAPI
 * Symbol format: TICKER:EXCHANGE (e.g., SPY:NYSEARCA, AAPL:NASDAQ)
 * Period: 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX
 */
export async function fetchStockTimeSeries(
    symbol: string,
    period: '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX' = '5Y'
): Promise<{ date: string; value: number }[] | null> {
    try {
        console.log(`Fetching time series for ${symbol} with period ${period}`);

        const response = await fetch(
            `https://${RAPIDAPI_HOST}/stock-time-series?symbol=${encodeURIComponent(symbol)}&period=${period}&language=en`,
            {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': RAPIDAPI_HOST,
                },
            }
        );

        if (!response.ok) {
            console.error('Stock time series API error:', response.status);
            return null;
        }

        const result: ApiResponse<StockTimeSeriesData> = await response.json();

        if (result.status === 'OK' && result.data?.time_series && result.data.time_series.length > 0) {
            console.log(`Got ${result.data.time_series.length} data points for ${symbol}`);
            return result.data.time_series.map(point => ({
                date: point.date,
                value: point.price,
            }));
        }

        console.error('Stock time series API error:', result.error?.message || 'No time series data');
        return null;
    } catch (error) {
        console.error('Failed to fetch stock time series:', error);
        return null;
    }
}

/**
 * Fetch index time series (for S&P 500, MSCI World benchmarks)
 */
export async function fetchIndexTimeSeries(
    indexSymbol: string,
    period: '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX' = '5Y'
): Promise<{ date: string; value: number }[] | null> {
    return fetchStockTimeSeries(indexSymbol, period);
}

/**
 * Get all exchange rates to EUR
 */
export async function fetchAllExchangeRates(): Promise<Record<string, number>> {
    const rates: Record<string, number> = { EUR: 1 };

    const currencies = ['USD', 'GBP', 'CHF'];

    for (const curr of currencies) {
        const rate = await fetchForexRate(curr, 'EUR');
        if (rate) {
            rates[curr] = rate;
        }
    }

    // GBX (pence) to EUR
    if (rates['GBP']) {
        rates['GBX'] = rates['GBP'] / 100;
    }

    return rates;
}
