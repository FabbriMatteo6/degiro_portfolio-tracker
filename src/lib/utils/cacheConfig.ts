/**
 * Cache Configuration Helper
 * 
 * Loads cache settings from config/cache-config.json
 */

import { promises as fs } from 'fs';
import path from 'path';

interface CacheConfig {
    cacheFreshnessHours: number;
}

const DEFAULT_CONFIG: CacheConfig = {
    cacheFreshnessHours: 20,
};

let cachedConfig: CacheConfig | null = null;

/**
 * Load cache configuration from config file
 * Caches the config in memory after first load
 */
export async function getCacheConfig(): Promise<CacheConfig> {
    if (cachedConfig) return cachedConfig;

    try {
        const configPath = path.join(process.cwd(), 'config', 'cache-config.json');
        const fileContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(fileContent);

        cachedConfig = {
            cacheFreshnessHours: config.cacheFreshnessHours || DEFAULT_CONFIG.cacheFreshnessHours,
        };

        console.log(`[CACHE CONFIG] Loaded: freshness=${cachedConfig.cacheFreshnessHours}h`);
        return cachedConfig;
    } catch (error) {
        console.warn('[CACHE CONFIG] Could not load config/cache-config.json, using defaults');
        cachedConfig = DEFAULT_CONFIG;
        return cachedConfig;
    }
}

/**
 * Get cache freshness hours from config
 */
export async function getCacheFreshnessHours(): Promise<number> {
    const config = await getCacheConfig();
    return config.cacheFreshnessHours;
}

/**
 * Clear cached config (useful if config file is changed)
 */
export function clearConfigCache(): void {
    cachedConfig = null;
}
