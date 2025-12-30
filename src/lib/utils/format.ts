// Utility functions for parsing Italian locale numbers and dates

/**
 * Parses an Italian locale number (comma as decimal separator)
 * Examples: "1.234,56" -> 1234.56, "-0,97" -> -0.97
 */
export function parseItalianNumber(value: string): number {
    if (!value || value.trim() === '') return 0;

    // Remove thousand separators (dots) and replace decimal comma with dot
    const cleaned = value
        .replace(/\./g, '')  // Remove dots (thousand separators)
        .replace(',', '.')   // Replace comma with dot (decimal separator)
        .trim();

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * Parses a date string in multiple formats:
 * - DD-MM-YYYY (Italian format with dashes)
 * - DD/MM/YYYY (Italian format with slashes)
 * - YYYY-MM-DD (ISO format)
 * - DD.MM.YYYY (European format with dots)
 * 
 * Returns Invalid Date for empty or unparseable strings
 */
export function parseItalianDate(dateStr: string): Date {
    if (!dateStr || dateStr.trim() === '') {
        return new Date(NaN); // Return Invalid Date for empty strings
    }

    const trimmed = dateStr.trim();

    // Try DD-MM-YYYY format (Italian with dashes)
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
        const parts = trimmed.split('-');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    // Try DD/MM/YYYY format (Italian with slashes)
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        const parts = trimmed.split('/');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    // Try YYYY-MM-DD format (ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const parts = trimmed.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    // Try DD.MM.YYYY format (European with dots)
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
        const parts = trimmed.split('.');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    // Try native Date parsing as last resort
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    // Return Invalid Date if nothing works
    return new Date(NaN);
}

/**
 * Formats a number as Italian locale string
 */
export function formatItalianNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('it-IT', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Formats a number as currency
 */
export function formatCurrency(value: number, currency: string = 'EUR'): string {
    return value.toLocaleString('it-IT', {
        style: 'currency',
        currency: currency,
    });
}

/**
 * Formats a percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(decimals)}%`;
}

/**
 * Extracts currency from a column header like "EUR" or "USD"
 */
export function extractCurrency(text: string): string {
    const currencies = ['EUR', 'USD', 'GBP', 'CHF', 'GBX'];
    for (const curr of currencies) {
        if (text.includes(curr)) return curr;
    }
    return 'EUR';
}

/**
 * Cleans CSV row to handle multi-line values
 */
export function cleanCsvValue(value: string): string {
    if (!value) return '';
    return value.replace(/\n/g, ' ').replace(/\r/g, '').trim();
}

/**
 * Gets today's date (using the current date from the system)
 */
export function getToday(): Date {
    return new Date();
}

/**
 * Gets the start of a year
 */
export function getStartOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1);
}

/**
 * Subtracts years from a date
 */
export function subtractYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() - years);
    return result;
}
