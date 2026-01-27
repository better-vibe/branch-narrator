/**
 * Cache module exports.
 *
 * Provides caching functionality for ChangeSets, analyzer findings,
 * and git ref resolutions.
 */

// Types
export type {
  CacheIndex,
  CacheEntryMetadata,
  CacheStats,
  CacheConfig,
  CacheOptions,
  PruneOptions,
  CachedChangeSet,
  CachedAnalyzerFindings,
  CachedRefResolution,
  RefsCache,
} from "./types.js";

export {
  MAX_ENTRIES_PER_CATEGORY,
  MAX_CHANGESET_ENTRIES,
  DEFAULT_MAX_AGE_DAYS,
} from "./types.js";

// Paths
export {
  BRANCH_NARRATOR_DIR,
  CACHE_DIR,
  getCacheDir,
  getIndexPath,
  getGitCacheDir,
  getRefsCachePath,
  getChangesetCacheDir,
  getChangesetCachePath,
  getAnalyzerCacheDir,
  getAnalyzerCachePath,
} from "./paths.js";

// Hashing
export {
  hashString,
  hashBuffer,
  computeCacheKey,
  hashFilePatterns,
  hashContent,
  HASH_LENGTH,
} from "./hash.js";

// Storage
export {
  readIndex,
  writeIndex,
  recordHit,
  recordMiss,
  getCacheStats,
  clearCache,
  pruneCache,
  ensureDir,
  atomicWriteFile,
  readJsonFile,
  writeJsonFile,
  writeCacheEntry,
  readCacheEntry,
  enforceChangesetLimit,
  enforceAnalyzerLimit,
} from "./storage.js";

// Git refs
export {
  readRefsCache,
  writeRefsCache,
  resolveRefSha,
  refExists,
  clearRefsCache,
} from "./git-refs.js";

// Signatures
export {
  computeFilePatternsSignature,
  computeWorktreeSignature,
  computeChangeSetCacheKey,
  computeAnalyzerCacheKey,
  computeAnalyzerInputSignature,
  type ChangeSetCacheKeyParams,
  type AnalyzerCacheKeyParams,
} from "./signatures.js";

// ChangeSet caching
export {
  loadCachedChangeSet,
  saveChangeSetToCache,
  getChangeSetCacheKey,
  type ChangeSetCacheOptions,
  type ChangeSetCacheResult,
} from "./changeset.js";

// Analyzer caching
export {
  runAnalyzersWithCache,
  computeAnalyzerContentHash,
  filterDiffsByPatterns,
  type AnalyzerCacheContext,
  type RunAnalyzersWithCacheOptions,
} from "./analyzer.js";
