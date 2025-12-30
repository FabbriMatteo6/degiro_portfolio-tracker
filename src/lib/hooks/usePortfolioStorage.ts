'use client';

import { useCallback } from 'react';

/**
 * Types for stored portfolio data
 */
export interface StoredPortfolioData {
    accountCsv: string;
    portfolioCsv: string;
    transactionsCsv: string;
    timestamp: string;
}

export interface StoredTickerMappings {
    [isin: string]: {
        ticker: string;
        name: string;
        verified: boolean;
    };
}

const PORTFOLIO_KEY = 'portfolio_tracker_data';
const MAPPINGS_KEY = 'portfolio_tracker_mappings';
const TIMESTAMP_KEY = 'portfolio_tracker_timestamp';

/**
 * Hook for persisting portfolio data in localStorage
 * Prevents "upload fatigue" by auto-loading previously uploaded CSVs
 */
export function usePortfolioStorage() {
    /**
     * Save CSV data to localStorage
     */
    const savePortfolioData = useCallback((data: {
        accountCsv?: string;
        portfolioCsv?: string;
        transactionsCsv?: string;
    }) => {
        if (typeof window === 'undefined') return;

        try {
            // Get existing data and merge
            const existing = localStorage.getItem(PORTFOLIO_KEY);
            const current = existing ? JSON.parse(existing) : {};

            const merged = {
                ...current,
                ...data,
            };

            localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(merged));
            localStorage.setItem(TIMESTAMP_KEY, new Date().toISOString());
        } catch (error) {
            console.error('Failed to save portfolio data:', error);
        }
    }, []);

    /**
     * Load CSV data from localStorage
     */
    const loadPortfolioData = useCallback((): StoredPortfolioData | null => {
        if (typeof window === 'undefined') return null;

        try {
            const data = localStorage.getItem(PORTFOLIO_KEY);
            const timestamp = localStorage.getItem(TIMESTAMP_KEY);

            if (data) {
                const parsed = JSON.parse(data);
                return {
                    ...parsed,
                    timestamp: timestamp || new Date().toISOString(),
                };
            }
        } catch (error) {
            console.error('Failed to load portfolio data:', error);
        }
        return null;
    }, []);

    /**
     * Clear all portfolio data from localStorage
     */
    const clearPortfolioData = useCallback(() => {
        if (typeof window === 'undefined') return;

        try {
            localStorage.removeItem(PORTFOLIO_KEY);
            localStorage.removeItem(TIMESTAMP_KEY);
        } catch (error) {
            console.error('Failed to clear portfolio data:', error);
        }
    }, []);

    /**
     * Get timestamp of last update
     */
    const getLastUpdated = useCallback((): Date | null => {
        if (typeof window === 'undefined') return null;

        try {
            const timestamp = localStorage.getItem(TIMESTAMP_KEY);
            return timestamp ? new Date(timestamp) : null;
        } catch {
            return null;
        }
    }, []);

    /**
     * Check if portfolio data exists
     */
    const hasStoredData = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;

        try {
            const data = localStorage.getItem(PORTFOLIO_KEY);
            return !!data;
        } catch {
            return false;
        }
    }, []);

    // --- Ticker Mappings ---

    /**
     * Save ticker mappings
     */
    const saveTickerMappings = useCallback((mappings: StoredTickerMappings) => {
        if (typeof window === 'undefined') return;

        try {
            localStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappings));
        } catch (error) {
            console.error('Failed to save ticker mappings:', error);
        }
    }, []);

    /**
     * Load ticker mappings
     */
    const loadTickerMappings = useCallback((): StoredTickerMappings => {
        if (typeof window === 'undefined') return {};

        try {
            const data = localStorage.getItem(MAPPINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to load ticker mappings:', error);
            return {};
        }
    }, []);

    /**
     * Update a single ticker mapping
     */
    const updateTickerMapping = useCallback((
        isin: string,
        ticker: string,
        name: string,
        verified: boolean = true
    ) => {
        const current = loadTickerMappings();
        current[isin] = { ticker, name, verified };
        saveTickerMappings(current);
    }, [loadTickerMappings, saveTickerMappings]);

    /**
     * Delete a ticker mapping
     */
    const deleteTickerMapping = useCallback((isin: string) => {
        const current = loadTickerMappings();
        delete current[isin];
        saveTickerMappings(current);
    }, [loadTickerMappings, saveTickerMappings]);

    return {
        // Portfolio data
        savePortfolioData,
        loadPortfolioData,
        clearPortfolioData,
        getLastUpdated,
        hasStoredData,
        // Ticker mappings
        saveTickerMappings,
        loadTickerMappings,
        updateTickerMapping,
        deleteTickerMapping,
    };
}
