/**
 * Global Caching System.
 *
 * Provides persistent caching of git operations, changesets,
 * and analysis results to improve performance across executions.
 *
 * @module cache
 */

export type {
  CacheOptions,
  CacheStats,
  CacheIndex,
  CacheEntryMeta,
  CachedDiff,
  CachedAnalysis,
  DiffCacheKey,
  AnalysisCacheKey,
  ChangeSetCacheKey,
} from "./types.js";

export { DEFAULT_CACHE_OPTIONS } from "./types.js";

export {
  CacheManager,
  getCache,
  initCache,
  _resetCacheForTesting,
} from "./manager.js";

export {
  getCacheDir,
  clearCache,
  pruneOldEntries,
  calculateCacheSize,
  computeHash,
} from "./storage.js";
