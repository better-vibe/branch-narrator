/**
 * Cache system types.
 *
 * Defines the schema for cache storage, index, and statistics.
 */

// ============================================================================
// Cache Index Types
// ============================================================================

/**
 * Metadata for a single cache entry.
 */
export interface CacheEntryMetadata {
  /** Cache key (content-addressed hash) */
  key: string;
  /** Category of cached data (e.g., "changeset", "analyzer:file-summary") */
  category: string;
  /** ISO 8601 timestamp of when the entry was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the entry was last accessed */
  lastAccessedAt: string;
  /** Size of the cached data in bytes */
  sizeBytes: number;
  /** CLI version that created this entry */
  cliVersion: string;
}

/**
 * Cache index stored in index.json.
 */
export interface CacheIndex {
  /** Schema version for future compatibility */
  schemaVersion: "1.0";
  /** Total cache hits since last clear */
  hits: number;
  /** Total cache misses since last clear */
  misses: number;
  /** Map of category -> entry keys for quick lookup */
  entries: Record<string, CacheEntryMetadata[]>;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Cache statistics returned by getCacheStats().
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate as percentage (0-100) */
  hitRate: number;
  /** Total number of cache entries */
  entries: number;
  /** Total size in bytes */
  sizeBytes: number;
  /** Human-readable size (e.g., "1 MB") */
  sizeHuman: string;
  /** Oldest entry timestamp (ISO 8601) or null if no entries */
  oldestEntry: string | null;
  /** Newest entry timestamp (ISO 8601) or null if no entries */
  newestEntry: string | null;
}

// ============================================================================
// Cache Configuration Types
// ============================================================================

/**
 * Cache configuration options.
 */
export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Options for cache operations.
 */
export interface CacheOptions {
  /** Working directory */
  cwd?: string;
}

/**
 * Options for pruning old cache entries.
 */
export interface PruneOptions extends CacheOptions {
  /** Maximum age in days (default: 30) */
  maxAgeDays?: number;
}

// ============================================================================
// Cached Data Types
// ============================================================================

/**
 * Cached ChangeSet data.
 */
export interface CachedChangeSet {
  /** Schema version */
  schemaVersion: "1.0";
  /** The serialized ChangeSet */
  data: unknown;
  /** Metadata about how this was computed */
  metadata: {
    mode: string;
    base?: string;
    head?: string;
    worktreeSignature?: string;
    filePatternsHash: string;
    cliVersion: string;
  };
}

/**
 * Cached analyzer findings.
 */
export interface CachedAnalyzerFindings {
  /** Schema version */
  schemaVersion: "1.0";
  /** Analyzer name */
  analyzerName: string;
  /** The serialized findings */
  findings: unknown[];
  /** Metadata about how this was computed */
  metadata: {
    /** Hash of the files that were analyzed */
    inputSignature: string;
    /** CLI version */
    cliVersion: string;
    /** Profile used */
    profileName?: string;
  };
}

/**
 * Cached git ref resolution.
 */
export interface CachedRefResolution {
  /** The ref name (e.g., "main", "HEAD") */
  ref: string;
  /** Resolved SHA */
  sha: string;
  /** When this was resolved */
  resolvedAt: string;
}

/**
 * Refs cache file structure.
 */
export interface RefsCache {
  /** Schema version */
  schemaVersion: "1.0";
  /** HEAD SHA at the time of caching */
  headSha: string;
  /** Cached ref resolutions */
  refs: Record<string, CachedRefResolution>;
  /** When this was last updated */
  updatedAt: string;
}

// ============================================================================
// Cache Limits
// ============================================================================

/**
 * Maximum number of cache files per category.
 * Keeps current + previous state for undo scenarios.
 */
export const MAX_ENTRIES_PER_CATEGORY = 2;

/**
 * Maximum number of changeset cache files.
 */
export const MAX_CHANGESET_ENTRIES = 2;

/**
 * Default max age for cache pruning (in days).
 */
export const DEFAULT_MAX_AGE_DAYS = 30;

