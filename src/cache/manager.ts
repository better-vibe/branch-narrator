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
  CachedChangeSet,
  CachedFileList,
  CachedPerAnalyzerFindings,
  DiffCacheKey,
  AnalysisCacheKey,
  ChangeSetCacheKey,
  FileListCacheKey,
  PerAnalyzerCacheKey,
  WorktreeSignature,
  AnalyzerVersionSignature,
  RefsCache,
} from "./types.js";
import { DEFAULT_CACHE_OPTIONS, CACHE_SCHEMA_VERSION } from "./types.js";
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
  getChangeSetCachePath,
  getFileListCachePath,
  getPerAnalyzerCachePath,
  writeCacheEntry,
  readCacheEntry,
  updateStats,
  addEntry,
  removeEntry,
  deleteCacheEntry,
  readRefsCache,
  writeRefsCache,
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
  private refsCache: RefsCache | null = null;
  private cwd: string;
  private options: CacheOptions;
  private initialized = false;
  private cliVersion: string = "";
  /** Cached worktree signature for the current session */
  private cachedWorktreeSignature: WorktreeSignature | null = null;

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
  async init(cliVersion?: string): Promise<void> {
    if (!this.options.enabled) {
      this.initialized = true;
      return;
    }

    this.cliVersion = cliVersion || "";
    await ensureCacheDirs(this.cwd);

    // Load index and refs cache in parallel
    const [index, refsCache] = await Promise.all([
      readIndex(this.cwd),
      readRefsCache(this.cwd),
    ]);

    this.index = index;
    this.refsCache = refsCache;
    this.initialized = true;

    // Check if schema version or CLI version changed - invalidate if so
    if (
      this.index.schemaVersion !== CACHE_SCHEMA_VERSION ||
      (cliVersion && this.index.cliVersion && this.index.cliVersion !== cliVersion)
    ) {
      await this.clear();
      this.index = createEmptyIndex(cliVersion);
      await this.saveIndex();
    } else if (cliVersion && !this.index.cliVersion) {
      this.index.cliVersion = cliVersion;
      await this.saveIndex();
    }

    // Check if git state has changed
    await this.validateGitState();
  }

  /**
   * Check if cache is enabled and initialized.
   */
  get enabled(): boolean {
    return this.options.enabled && this.initialized;
  }

  /**
   * Get the analyzer version signature for cache keys.
   */
  getVersionSignature(): AnalyzerVersionSignature {
    return {
      cliVersion: this.cliVersion,
      schemaVersion: CACHE_SCHEMA_VERSION,
    };
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
   * Get git status output for worktree signature.
   */
  private async getGitStatusHash(): Promise<string> {
    try {
      const { stdout } = await execa("git", ["status", "--porcelain", "-z"], {
        cwd: this.cwd,
      });
      return computeHash(stdout);
    } catch {
      return "";
    }
  }

  /**
   * Get index tree hash for worktree signature.
   */
  private async getIndexTreeHash(): Promise<string> {
    try {
      const { stdout } = await execa("git", ["write-tree"], { cwd: this.cwd });
      return stdout.trim();
    } catch {
      return "";
    }
  }

  /**
   * Compute a worktree signature for non-branch modes.
   * This captures the working directory state to ensure cache freshness.
   */
  async computeWorktreeSignature(): Promise<WorktreeSignature> {
    // Return cached signature if available (same session)
    if (this.cachedWorktreeSignature) {
      return this.cachedWorktreeSignature;
    }

    const [statusHash, indexTreeHash, headSha] = await Promise.all([
      this.getGitStatusHash(),
      this.getIndexTreeHash(),
      this.getCurrentHeadSha(),
    ]);

    this.cachedWorktreeSignature = {
      statusHash,
      indexTreeHash,
      headSha,
    };

    return this.cachedWorktreeSignature;
  }

  /**
   * Invalidate the cached worktree signature.
   * Call this when the working directory might have changed.
   */
  invalidateWorktreeSignature(): void {
    this.cachedWorktreeSignature = null;
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

      // Clear cached worktree signature
      this.invalidateWorktreeSignature();

      await this.saveIndex();
    }
  }

  /**
   * Invalidate caches that depend on git state.
   * Deletes cache files in addition to removing index entries.
   */
  private async invalidateGitDependentCaches(): Promise<void> {
    if (!this.index) return;

    // Types that depend on git state and should be invalidated
    const gitDependentTypes = new Set(["diff", "changeset", "filelist", "analysis", "per-analyzer"]);

    const toRemove = this.index.entries.filter((e) => gitDependentTypes.has(e.type));

    // Delete files and remove from index
    await Promise.all(
      toRemove.map(async (entry) => {
        await deleteCacheEntry(entry.type, entry.hash, this.cwd);
        removeEntry(this.index!, entry.hash);
      })
    );

    // Clear refs cache as well
    if (this.refsCache) {
      this.refsCache.refs = {};
      await writeRefsCache(this.refsCache, this.cwd);
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
    worktreeSignature?: WorktreeSignature;
  }): string {
    const key: DiffCacheKey = {
      base: options.base,
      head: options.head,
      baseSha: options.baseSha,
      headSha: options.headSha,
      mode: options.mode,
      worktreeSignature: options.worktreeSignature,
    };
    return computeHash(key);
  }

  /**
   * Build a diff cache key object (for storing).
   */
  buildDiffCacheKeyObject(options: {
    base: string;
    head: string;
    baseSha: string;
    headSha: string;
    mode: DiffMode;
    worktreeSignature?: WorktreeSignature;
  }): DiffCacheKey {
    return {
      base: options.base,
      head: options.head,
      baseSha: options.baseSha,
      headSha: options.headSha,
      mode: options.mode,
      worktreeSignature: options.worktreeSignature,
    };
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
  buildAnalysisCacheKey(options: {
    changeSetHash: string;
    profile: ProfileName;
    mode: DiffMode;
  }): string {
    const key: AnalysisCacheKey = {
      changeSetHash: options.changeSetHash,
      profile: options.profile,
      versionSignature: this.getVersionSignature(),
      mode: options.mode,
    };
    return computeHash(key);
  }

  /**
   * Build an analysis cache key object (for storing).
   */
  buildAnalysisCacheKeyObject(options: {
    changeSetHash: string;
    profile: ProfileName;
    mode: DiffMode;
  }): AnalysisCacheKey {
    return {
      changeSetHash: options.changeSetHash,
      profile: options.profile,
      versionSignature: this.getVersionSignature(),
      mode: options.mode,
    };
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
  // Ref Cache Operations
  // ==========================================================================

  /**
   * Get cached ref SHA.
   */
  getRefSha(ref: string): { sha: string; exists: boolean } | null {
    if (!this.enabled || !this.refsCache) {
      return null;
    }

    const cached = this.refsCache.refs[ref];
    if (cached) {
      return { sha: cached.sha, exists: cached.exists };
    }
    return null;
  }

  /**
   * Store ref SHA in cache.
   */
  async setRefSha(ref: string, sha: string, exists: boolean): Promise<void> {
    if (!this.enabled || !this.refsCache) return;

    this.refsCache.refs[ref] = {
      sha,
      exists,
      timestamp: new Date().toISOString(),
    };

    await writeRefsCache(this.refsCache, this.cwd);
  }

  // ==========================================================================
  // ChangeSet Cache Operations
  // ==========================================================================

  /**
   * Build a cache key for a ChangeSet.
   */
  buildChangeSetCacheKey(diffHash: string, packageJsonHash: string): string {
    const key: ChangeSetCacheKey = {
      diffHash,
      packageJsonHash,
    };
    return computeHash(key);
  }

  /**
   * Get cached ChangeSet.
   */
  async getChangeSet(hash: string): Promise<ChangeSet | null> {
    if (!this.enabled || !this.index) {
      return null;
    }

    const path = getChangeSetCachePath(hash, this.cwd);
    const cached = await readCacheEntry<CachedChangeSet>(path);

    if (cached) {
      updateStats(this.index, true);
      await this.saveIndex();
      return cached.changeSet;
    }

    updateStats(this.index, false);
    await this.saveIndex();
    return null;
  }

  /**
   * Store ChangeSet in cache.
   */
  async setChangeSet(
    key: ChangeSetCacheKey,
    changeSet: ChangeSet
  ): Promise<void> {
    if (!this.enabled || !this.index) return;

    const hash = computeHash(key);
    const cached: CachedChangeSet = {
      key,
      created: new Date().toISOString(),
      changeSet,
    };

    const path = getChangeSetCachePath(hash, this.cwd);
    const size = await writeCacheEntry(path, cached);

    const entry: CacheEntryMeta = {
      hash,
      type: "changeset",
      created: cached.created,
      lastAccess: cached.created,
      size,
    };
    addEntry(this.index, entry);
    await this.saveIndex();
  }

  // ==========================================================================
  // File List Cache Operations
  // ==========================================================================

  /**
   * Build a cache key for file listings.
   */
  buildFileListCacheKey(
    directories: string[],
    includeUntracked: boolean,
    worktreeSignature: WorktreeSignature
  ): string {
    const key: FileListCacheKey = {
      directories: [...directories].sort(),
      includeUntracked,
      worktreeSignature,
    };
    return computeHash(key);
  }

  /**
   * Get cached file list.
   */
  async getFileList(hash: string): Promise<string[] | null> {
    if (!this.enabled || !this.index) {
      return null;
    }

    const path = getFileListCachePath(hash, this.cwd);
    const cached = await readCacheEntry<CachedFileList>(path);

    if (cached) {
      updateStats(this.index, true);
      await this.saveIndex();
      return cached.files;
    }

    updateStats(this.index, false);
    await this.saveIndex();
    return null;
  }

  /**
   * Store file list in cache.
   */
  async setFileList(
    key: FileListCacheKey,
    files: string[]
  ): Promise<void> {
    if (!this.enabled || !this.index) return;

    const hash = computeHash(key);
    const cached: CachedFileList = {
      key,
      created: new Date().toISOString(),
      files,
    };

    const path = getFileListCachePath(hash, this.cwd);
    const size = await writeCacheEntry(path, cached);

    const entry: CacheEntryMeta = {
      hash,
      type: "filelist",
      created: cached.created,
      lastAccess: cached.created,
      size,
    };
    addEntry(this.index, entry);
    await this.saveIndex();
  }

  // ==========================================================================
  // Per-Analyzer Cache Operations (Incremental Analysis)
  // ==========================================================================

  /**
   * Build a cache key for per-analyzer results.
   */
  buildPerAnalyzerCacheKey(
    analyzerName: string,
    changeSetHash: string
  ): string {
    const key: PerAnalyzerCacheKey = {
      analyzerName,
      changeSetHash,
      versionSignature: this.getVersionSignature(),
    };
    return computeHash(key);
  }

  /**
   * Get cached per-analyzer findings.
   */
  async getPerAnalyzerFindings(hash: string): Promise<CachedPerAnalyzerFindings | null> {
    if (!this.enabled || !this.index) {
      return null;
    }

    const path = getPerAnalyzerCachePath(hash, this.cwd);
    const cached = await readCacheEntry<CachedPerAnalyzerFindings>(path);

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
   * Store per-analyzer findings in cache.
   */
  async setPerAnalyzerFindings(
    key: PerAnalyzerCacheKey,
    findings: Finding[],
    processedFiles: string[]
  ): Promise<void> {
    if (!this.enabled || !this.index) return;

    const hash = computeHash(key);
    const cached: CachedPerAnalyzerFindings = {
      key,
      created: new Date().toISOString(),
      findings,
      processedFiles,
    };

    const path = getPerAnalyzerCachePath(hash, this.cwd);
    const size = await writeCacheEntry(path, cached);

    const entry: CacheEntryMeta = {
      hash,
      type: "per-analyzer",
      created: cached.created,
      lastAccess: cached.created,
      size,
      analyzerName: key.analyzerName,
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
