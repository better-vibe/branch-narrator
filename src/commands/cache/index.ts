/**
 * Cache command implementations.
 *
 * Provides stats, clear, and prune operations for cache management.
 */

import {
  getCacheStats,
  clearCache,
  pruneCache,
  type CacheStats,
} from "../../cache/index.js";

// ============================================================================
// Types
// ============================================================================

export interface CacheStatsOptions {
  pretty?: boolean;
  cwd?: string;
}

export interface CacheClearOptions {
  cwd?: string;
}

export interface CachePruneOptions {
  maxAgeDays?: number;
  cwd?: string;
}

export interface CachePruneResult {
  prunedCount: number;
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Execute cache stats command.
 * Returns cache statistics as JSON.
 */
export async function executeCacheStats(
  options: CacheStatsOptions = {}
): Promise<CacheStats> {
  return getCacheStats({ cwd: options.cwd });
}

/**
 * Execute cache clear command.
 * Removes all cache data.
 */
export async function executeCacheClear(
  options: CacheClearOptions = {}
): Promise<void> {
  await clearCache({ cwd: options.cwd });
}

/**
 * Execute cache prune command.
 * Removes entries older than maxAgeDays.
 */
export async function executeCachePrune(
  options: CachePruneOptions = {}
): Promise<CachePruneResult> {
  const prunedCount = await pruneCache({
    maxAgeDays: options.maxAgeDays,
    cwd: options.cwd,
  });
  return { prunedCount };
}

/**
 * Render cache stats as formatted output.
 */
export function renderCacheStats(stats: CacheStats, pretty: boolean): string {
  if (pretty) {
    return JSON.stringify(stats, null, 2);
  }
  return JSON.stringify(stats);
}

/**
 * Render prune result as formatted output.
 */
export function renderPruneResult(result: CachePruneResult, pretty: boolean): string {
  if (pretty) {
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result);
}
