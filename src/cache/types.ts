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
export const CACHE_SCHEMA_VERSION = "1.1";

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
 * Key for caching git diff operations.
 */
export interface DiffCacheKey {
  base: string;
  head: string;
  baseSha: string;
  headSha: string;
  mode: DiffMode;
  /** Worktree signature for staged/unstaged/all modes */
  worktreeSignature?: WorktreeSignature;
}

/**
 * Key for caching ref SHA resolution.
 */
export interface RefCacheKey {
  ref: string;
}

/**
 * Key for caching git ls-files output.
 */
export interface FileListCacheKey {
  /** Directories queried (empty = all files) */
  directories: string[];
  /** Include untracked files */
  includeUntracked: boolean;
  /** Worktree signature for freshness */
  worktreeSignature: WorktreeSignature;
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
  /** CLI and schema version for invalidation */
  versionSignature: AnalyzerVersionSignature;
  /** Diff mode used */
  mode: DiffMode;
}

/**
 * Key for caching per-analyzer results (incremental analysis).
 */
export interface PerAnalyzerCacheKey {
  analyzerName: string;
  changeSetHash: string;
  versionSignature: AnalyzerVersionSignature;
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
 * Cached ref SHA resolution.
 */
export interface CachedRef {
  key: RefCacheKey;
  created: string;
  sha: string;
  exists: boolean;
}

/**
 * Cached file listing.
 */
export interface CachedFileList {
  key: FileListCacheKey;
  created: string;
  files: string[];
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
  | "diff"
  | "changeset"
  | "analysis"
  | "ref"
  | "filelist"
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
