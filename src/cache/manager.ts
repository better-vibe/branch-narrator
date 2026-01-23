/**
 * Global Cache Manager.
 *
 * Provides a unified interface for caching git operations,
 * changesets, and analysis results across executions.
 */

import { execa } from "execa";
import type {
  CacheIndex,
  CacheOptions,
  CacheStats,
  CacheEntryMeta,
  CachedDiff,
  CachedAnalysis,
  DiffCacheKey,
  AnalysisCacheKey,
} from "./types.js";
import { DEFAULT_CACHE_OPTIONS } from "./types.js";
import {
  readIndex,
  writeIndex,
  createEmptyIndex,
  ensureCacheDirs,
  clearCache as clearCacheStorage,
  pruneOldEntries,
  calculateCacheSize,
  computeHash,
  getDiffCachePath,
  getAnalysisCachePath,
  writeCacheEntry,
  readCacheEntry,
  updateStats,
  addEntry,
} from "./storage.js";
import type { ChangeSet, DiffMode, Finding, ProfileName } from "../core/types.js";

// ============================================================================
// Cache Manager Class
// ============================================================================

/**
 * Global cache manager for branch-narrator.
 *
 * Manages caching of git operations, changesets, and analysis results
 * to improve performance across repeated executions.
 */
export class CacheManager {
  private index: CacheIndex | null = null;
  private cwd: string;
  private options: CacheOptions;
  private initialized = false;

  constructor(cwd: string = process.cwd(), options: Partial<CacheOptions> = {}) {
    this.cwd = cwd;
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the cache manager.
   * Must be called before using cache operations.
   */
  async init(): Promise<void> {
    if (!this.options.enabled) {
      this.initialized = true;
      return;
    }

    await ensureCacheDirs(this.cwd);
    this.index = await readIndex(this.cwd);
    this.initialized = true;

    // Check if git state has changed
    await this.validateGitState();
  }

  /**
   * Check if cache is enabled and initialized.
   */
  get enabled(): boolean {
    return this.options.enabled && this.initialized;
  }

  // ==========================================================================
  // Git State Validation
  // ==========================================================================

  /**
   * Get current HEAD SHA.
   */
  private async getCurrentHeadSha(): Promise<string> {
    try {
      const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return "";
    }
  }

  /**
   * Check if working directory is dirty.
   */
  private async isWorkingDirDirty(): Promise<boolean> {
    try {
      const result = await execa("git", ["diff-index", "--quiet", "HEAD", "--"], {
        cwd: this.cwd,
        reject: false,
      });
      return result.exitCode !== 0;
    } catch {
      return false;
    }
  }

  /**
   * Validate git state and invalidate cache if necessary.
   */
  private async validateGitState(): Promise<void> {
    if (!this.index || !this.options.enabled) return;

    const [currentSha, isDirty] = await Promise.all([
      this.getCurrentHeadSha(),
      this.isWorkingDirDirty(),
    ]);

    const gitStateChanged =
      this.index.git.headSha !== currentSha || this.index.git.isDirty !== isDirty;

    if (gitStateChanged) {
      // Invalidate caches that depend on git state
      await this.invalidateGitDependentCaches();

      // Update git state
      this.index.git.headSha = currentSha;
      this.index.git.isDirty = isDirty;
      this.index.git.lastChecked = new Date().toISOString();
      await this.saveIndex();
    }
  }

  /**
   * Invalidate caches that depend on git state.
   */
  private async invalidateGitDependentCaches(): Promise<void> {
    if (!this.index) return;

    // For now, invalidate all diff caches when HEAD changes
    // More sophisticated invalidation can be added later
    const diffEntries = this.index.entries.filter((e) => e.type === "diff");
    for (const entry of diffEntries) {
      this.index.entries = this.index.entries.filter((e) => e.hash !== entry.hash);
    }
  }

  // ==========================================================================
  // Diff Cache Operations
  // ==========================================================================

  /**
   * Build a cache key for a git diff operation.
   */
  buildDiffCacheKey(options: {
    base: string;
    head: string;
    baseSha: string;
    headSha: string;
    mode: DiffMode;
  }): string {
    const key: DiffCacheKey = {
      base: options.base,
      head: options.head,
      baseSha: options.baseSha,
      headSha: options.headSha,
      mode: options.mode,
    };
    return computeHash(key);
  }

  /**
   * Get cached diff data.
   */
  async getDiff(hash: string): Promise<CachedDiff | null> {
    if (!this.enabled || !this.index) {
      return null;
    }

    const path = getDiffCachePath(hash, this.cwd);
    const cached = await readCacheEntry<CachedDiff>(path);

    if (cached) {
      updateStats(this.index, true);
      await this.saveIndex();
      return cached;
    }

    updateStats(this.index, false);
    await this.saveIndex();
    return null;
  }

  /**
   * Store diff data in cache.
   */
  async setDiff(
    key: DiffCacheKey,
    data: { nameStatus: string; unifiedDiff: string }
  ): Promise<void> {
    if (!this.enabled || !this.index) return;

    const hash = computeHash(key);
    const cached: CachedDiff = {
      key,
      created: new Date().toISOString(),
      data,
    };

    const path = getDiffCachePath(hash, this.cwd);
    const size = await writeCacheEntry(path, cached);

    const entry: CacheEntryMeta = {
      hash,
      type: "diff",
      created: cached.created,
      lastAccess: cached.created,
      size,
    };
    addEntry(this.index, entry);
    await this.saveIndex();
  }

  // ==========================================================================
  // Analysis Cache Operations
  // ==========================================================================

  /**
   * Build a cache key for analysis results.
   */
  buildAnalysisCacheKey(
    changeSetHash: string,
    profile: ProfileName,
    analyzerVersions: Record<string, string> = {}
  ): string {
    const key: AnalysisCacheKey = {
      changeSetHash,
      profile,
      analyzerVersions,
    };
    return computeHash(key);
  }

  /**
   * Get cached analysis findings.
   */
  async getFindings(hash: string): Promise<Finding[] | null> {
    if (!this.enabled || !this.index) {
      return null;
    }

    const path = getAnalysisCachePath(hash, this.cwd);
    const cached = await readCacheEntry<CachedAnalysis>(path);

    if (cached) {
      updateStats(this.index, true);
      await this.saveIndex();
      return cached.findings;
    }

    updateStats(this.index, false);
    await this.saveIndex();
    return null;
  }

  /**
   * Store analysis findings in cache.
   */
  async setFindings(
    key: AnalysisCacheKey,
    findings: Finding[]
  ): Promise<void> {
    if (!this.enabled || !this.index) return;

    const hash = computeHash(key);
    const cached: CachedAnalysis = {
      key,
      created: new Date().toISOString(),
      findings,
    };

    const path = getAnalysisCachePath(hash, this.cwd);
    const size = await writeCacheEntry(path, cached);

    const entry: CacheEntryMeta = {
      hash,
      type: "analysis",
      created: cached.created,
      lastAccess: cached.created,
      size,
    };
    addEntry(this.index, entry);
    await this.saveIndex();
  }

  // ==========================================================================
  // ChangeSet Hashing
  // ==========================================================================

  /**
   * Compute a hash for a ChangeSet.
   * Used as part of analysis cache keys.
   */
  computeChangeSetHash(changeSet: ChangeSet): string {
    // Hash based on stable properties
    const hashInput = {
      base: changeSet.base,
      head: changeSet.head,
      files: changeSet.files.map((f) => ({
        path: f.path,
        status: f.status,
        oldPath: f.oldPath,
      })),
      // Include diff summary but not full content for speed
      diffCount: changeSet.diffs.length,
      diffPaths: changeSet.diffs.map((d) => d.path),
    };
    return computeHash(hashInput);
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Clear all cache data.
   */
  async clear(): Promise<void> {
    await clearCacheStorage(this.cwd);
    this.index = createEmptyIndex();
    if (this.options.enabled) {
      await this.saveIndex();
    }
  }

  /**
   * Prune old cache entries.
   */
  async prune(maxAge?: number): Promise<number> {
    const age = maxAge ?? this.options.maxAge;
    return pruneOldEntries(age, this.cwd);
  }

  /**
   * Get cache statistics.
   */
  async stats(): Promise<CacheStats> {
    if (!this.index) {
      return {
        hits: 0,
        misses: 0,
        size: 0,
        entries: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }

    // Recalculate size
    const size = await calculateCacheSize(this.cwd);
    this.index.stats.size = size;

    return { ...this.index.stats };
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  /**
   * Save the cache index.
   */
  private async saveIndex(): Promise<void> {
    if (this.index) {
      await writeIndex(this.index, this.cwd);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalCache: CacheManager | null = null;

/**
 * Get the global cache manager instance.
 */
export function getCache(cwd?: string, options?: Partial<CacheOptions>): CacheManager {
  if (!globalCache || (cwd && cwd !== process.cwd())) {
    globalCache = new CacheManager(cwd, options);
  }
  return globalCache;
}

/**
 * Initialize the global cache.
 */
export async function initCache(
  cwd: string = process.cwd(),
  options: Partial<CacheOptions> = {}
): Promise<CacheManager> {
  const cache = getCache(cwd, options);
  await cache.init();
  return cache;
}

/**
 * Reset the global cache instance (for testing).
 */
export function _resetCacheForTesting(): void {
  globalCache = null;
}
