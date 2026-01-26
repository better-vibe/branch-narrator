/**
 * Global Caching System.
 *
 * Provides persistent caching of changesets and per-analyzer
 * results to improve performance across executions.
 *
 * @module cache
 */

export type {
  CacheOptions,
  CacheStats,
  CacheIndex,
  CacheEntryMeta,
  CacheEntryType,
  CachedChangeSet,
  CachedRef,
  CachedPerAnalyzerFindings,
  ChangeSetCacheKey,
  RefCacheKey,
  PerAnalyzerCacheKey,
  WorktreeSignature,
  AnalyzerVersionSignature,
  RefsCache,
} from "./types.js";

export {
  DEFAULT_CACHE_OPTIONS,
  CACHE_SCHEMA_VERSION,
  MAX_ENTRIES_PER_ANALYZER,
  MAX_CHANGESET_ENTRIES,
} from "./types.js";

export {
  CacheManager,
  getCache,
  initCache,
  _resetCacheForTesting,
} from "./manager.js";

export {
  getCacheDir,
  getChangeSetCacheDir,
  getChangeSetCachePath,
  getPerAnalyzerCacheDir,
  getPerAnalyzerCachePath,
  getRefsCachePath,
  getGitCacheDir,
  clearCache,
  pruneOldEntries,
  pruneBySizeLRU,
  pruneExcessPerAnalyzerEntries,
  pruneExcessChangeSetEntries,
  calculateCacheSize,
  computeHash,
  deleteCacheEntry,
  getCacheEntryPath,
  readRefsCache,
  writeRefsCache,
  createEmptyRefsCache,
  createEmptyIndex,
  updateEntryAccess,
} from "./storage.js";
