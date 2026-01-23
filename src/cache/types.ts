/**
 * Types for the global caching system.
 */

import type { ChangeSet, DiffMode, Finding, ProfileName } from "../core/types.js";

// ============================================================================
// Cache Keys
// ============================================================================

/**
 * Key for caching git diff operations.
 */
export interface DiffCacheKey {
  base: string;
  head: string;
  baseSha: string;
  headSha: string;
  mode: DiffMode;
}

/**
 * Key for caching ChangeSet.
 */
export interface ChangeSetCacheKey {
  diffHash: string;
  packageJsonHash: string;
}

/**
 * Key for caching analysis results.
 */
export interface AnalysisCacheKey {
  changeSetHash: string;
  profile: ProfileName;
  analyzerVersions: Record<string, string>;
}

// ============================================================================
// Cache Entries
// ============================================================================

/**
 * Cached git diff data.
 */
export interface CachedDiff {
  key: DiffCacheKey;
  created: string;
  data: {
    nameStatus: string;
    unifiedDiff: string;
  };
}

/**
 * Cached ChangeSet.
 */
export interface CachedChangeSet {
  key: ChangeSetCacheKey;
  created: string;
  changeSet: ChangeSet;
}

/**
 * Cached analysis findings.
 */
export interface CachedAnalysis {
  key: AnalysisCacheKey;
  created: string;
  findings: Finding[];
}

// ============================================================================
// Cache Index
// ============================================================================

/**
 * Git state for cache invalidation.
 */
export interface CachedGitState {
  headSha: string;
  isDirty: boolean;
  lastChecked: string;
}

/**
 * Profile detection cache.
 */
export interface CachedProfileState {
  packageJsonMtime: number;
  detected: ProfileName;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  entries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

/**
 * Individual cache entry metadata.
 */
export interface CacheEntryMeta {
  hash: string;
  type: "diff" | "changeset" | "analysis";
  created: string;
  lastAccess: string;
  size: number;
}

/**
 * Main cache index structure.
 */
export interface CacheIndex {
  schemaVersion: "1.0";
  created: string;
  lastAccess: string;
  git: CachedGitState;
  profile: CachedProfileState | null;
  stats: CacheStats;
  entries: CacheEntryMeta[];
}

// ============================================================================
// Cache Options
// ============================================================================

/**
 * Cache configuration options.
 */
export interface CacheOptions {
  /** Enable/disable caching (default: true) */
  enabled: boolean;
  /** Maximum cache size in bytes (default: 100MB) */
  maxSize: number;
  /** Maximum age for cache entries in days (default: 30) */
  maxAge: number;
  /** Cache directory path (default: .branch-narrator/cache) */
  cacheDir: string;
}

/**
 * Default cache options.
 */
export const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  enabled: true,
  maxSize: 100 * 1024 * 1024, // 100MB
  maxAge: 30,
  cacheDir: ".branch-narrator/cache",
};
