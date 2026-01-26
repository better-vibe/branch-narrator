/**
 * Types for the global caching system.
 */

import type { ChangeSet, DiffMode, Finding, ProfileName } from "../core/types.js";

// ============================================================================
// Version Tracking
// ============================================================================

/**
 * Cache schema version - bump when cache structure changes.
 */
export const CACHE_SCHEMA_VERSION = "1.2";

/**
 * Maximum number of cache entries to keep per analyzer.
 * Keeps current + previous state to support undo scenarios.
 */
export const MAX_ENTRIES_PER_ANALYZER = 2;

/**
 * Maximum number of changeset cache entries to keep.
 */
export const MAX_CHANGESET_ENTRIES = 2;

/**
 * Analyzer version signature for cache invalidation.
 * Combines CLI version with schema version.
 */
export interface AnalyzerVersionSignature {
  cliVersion: string;
  schemaVersion: string;
}

// ============================================================================
// Worktree Signature (for staged/unstaged/all modes)
// ============================================================================

/**
 * Worktree signature for cache keys in non-branch modes.
 * Captures the working directory state to avoid stale caches.
 */
export interface WorktreeSignature {
  /** Hash of `git status --porcelain -z` output */
  statusHash: string;
  /** Hash of index tree (`git write-tree`) */
  indexTreeHash: string;
  /** HEAD commit SHA */
  headSha: string;
}

// ============================================================================
// Cache Keys
// ============================================================================

/**
 * Key for caching ref SHA resolution.
 */
export interface RefCacheKey {
  ref: string;
}

/**
 * Key for caching ChangeSet.
 */
export interface ChangeSetCacheKey {
  diffHash: string;
  packageJsonHash: string;
}

/**
 * Key for caching per-analyzer results (incremental analysis).
 * 
 * Uses ref names (not SHAs) and profile/mode to enable reuse across
 * git state changes. The filesHash captures which files the analyzer
 * processed, enabling selective invalidation.
 */
export interface PerAnalyzerCacheKey {
  analyzerName: string;
  /** Profile used for this analysis */
  profile: ProfileName;
  /** Diff mode used */
  mode: DiffMode;
  /** Base ref name (e.g., 'main', 'HEAD', 'INDEX') */
  baseRef: string;
  /** Head ref name (e.g., 'HEAD', 'feature-branch', 'WORKING') */
  headRef: string;
  /** Hash of file paths this analyzer processed */
  filesHash: string;
  /** Version signature for invalidation on CLI updates */
  versionSignature: AnalyzerVersionSignature;
}

// ============================================================================
// Cache Entries
// ============================================================================

/**
 * Cached ref SHA resolution.
 */
export interface CachedRef {
  key: RefCacheKey;
  created: string;
  sha: string;
  exists: boolean;
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
 * Cached per-analyzer findings (for incremental analysis).
 */
export interface CachedPerAnalyzerFindings {
  key: PerAnalyzerCacheKey;
  created: string;
  findings: Finding[];
  /** File paths this analyzer processed */
  processedFiles: string[];
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
 * Cache entry type.
 */
export type CacheEntryType =
  | "changeset"
  | "ref"
  | "per-analyzer";

/**
 * Individual cache entry metadata.
 */
export interface CacheEntryMeta {
  hash: string;
  type: CacheEntryType;
  created: string;
  lastAccess: string;
  size: number;
  /** For per-analyzer entries, the analyzer name */
  analyzerName?: string;
}

/**
 * Refs cache structure (all refs in one file).
 */
export interface RefsCache {
  /** Schema version */
  schemaVersion: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Map of ref name to cached data */
  refs: Record<string, { sha: string; exists: boolean; timestamp: string }>;
}

/**
 * Main cache index structure.
 */
export interface CacheIndex {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  created: string;
  lastAccess: string;
  git: CachedGitState;
  profile: CachedProfileState | null;
  stats: CacheStats;
  entries: CacheEntryMeta[];
  /** CLI version when cache was created */
  cliVersion?: string;
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
