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
  CacheEntryType,
  CachedDiff,
  CachedAnalysis,
  CachedChangeSet,
  CachedRef,
  CachedFileList,
  CachedPerAnalyzerFindings,
  DiffCacheKey,
  AnalysisCacheKey,
  ChangeSetCacheKey,
  RefCacheKey,
  FileListCacheKey,
  PerAnalyzerCacheKey,
  WorktreeSignature,
  AnalyzerVersionSignature,
  RefsCache,
} from "./types.js";

export { DEFAULT_CACHE_OPTIONS, CACHE_SCHEMA_VERSION } from "./types.js";

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
  getFilesCacheDir,
  getFileListCachePath,
  clearCache,
  pruneOldEntries,
  calculateCacheSize,
  computeHash,
  deleteCacheEntry,
  getCacheEntryPath,
  readRefsCache,
  writeRefsCache,
  createEmptyRefsCache,
  createEmptyIndex,
} from "./storage.js";
