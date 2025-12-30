'use client';

import { useState, useEffect, useCallback } from 'react';

interface BenchmarkData {
    date: string;
    value: number;
}

interface BenchmarkResponse {
    sp500: BenchmarkData[];
    msciWorld: BenchmarkData[];
}

interface ExchangeRates {
    [currency: string]: number;
}

/**
 * Hook to fetch benchmark data from Yahoo Finance API
 */
export function useBenchmarks(startDate: Date, endDate: Date) {
    const [data, setData] = useState<BenchmarkResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchBenchmarks = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
            });

            const response = await fetch(`/api/benchmarks?${params}`);

            if (!response.ok) {
                throw new Error('Failed to fetch benchmarks');
            }

            const result = await response.json();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            console.error('Error fetching benchmarks:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchBenchmarks();
    }, [fetchBenchmarks]);

    return { data, loading, error, refetch: fetchBenchmarks };
}

/**
 * Hook to fetch exchange rates
 */
export function useExchangeRates() {
    const [rates, setRates] = useState<ExchangeRates>({
        EUR: 1,
        USD: 0.85,
        GBP: 1.17,
        CHF: 1.08,
        GBX: 0.0117,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('/api/exchange-rates');
                if (response.ok) {
                    const data = await response.json();
                    setRates(data);
                }
            } catch (err) {
                console.error('Error fetching exchange rates:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchRates();
    }, []);

    const convertToEur = useCallback((amount: number, currency: string): number => {
        const rate = rates[currency] || 1;
        return amount * rate;
    }, [rates]);

    return { rates, loading, convertToEur };
}

/**
 * Normalize benchmark data to percentage returns from a base value
 */
export function normalizeBenchmarkData(
    benchmarkData: BenchmarkData[],
    portfolioStartValue: number
): { date: string; value: number }[] {
    if (benchmarkData.length === 0) return [];

    const baseValue = benchmarkData[0].value;

    return benchmarkData.map(d => ({
        date: d.date,
        value: (d.value / baseValue) * portfolioStartValue,
    }));
}

/**
 * Merge portfolio data with benchmark data
 */
export function mergeBenchmarkWithPortfolio(
    portfolioData: { date: string; value: number }[],
    sp500Data: BenchmarkData[],
    msciWorldData: BenchmarkData[],
    portfolioStartValue: number
): { date: string; portfolio: number; sp500: number; msciWorld: number }[] {
    // Create a map of benchmark values by date
    const sp500Map = new Map<string, number>();
    const msciMap = new Map<string, number>();

    const sp500Base = sp500Data[0]?.value || 1;
    const msciBase = msciWorldData[0]?.value || 1;

    sp500Data.forEach(d => {
        const dateKey = new Date(d.date).toISOString().slice(0, 7); // YYYY-MM
        sp500Map.set(dateKey, (d.value / sp500Base) * portfolioStartValue);
    });

    msciWorldData.forEach(d => {
        const dateKey = new Date(d.date).toISOString().slice(0, 7); // YYYY-MM
        msciMap.set(dateKey, (d.value / msciBase) * portfolioStartValue);
    });

    // Merge with portfolio data
    return portfolioData.map(p => {
        const dateKey = new Date(p.date).toISOString().slice(0, 7);
        return {
            date: p.date,
            portfolio: p.value,
            sp500: sp500Map.get(dateKey) || 0,
            msciWorld: msciMap.get(dateKey) || 0,
        };
    });
}
