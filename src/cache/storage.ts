/**
 * Cache storage utilities.
 *
 * Handles reading/writing cache files, directory management,
 * and atomic file operations.
 */

import { mkdir, readFile, stat, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { CacheIndex, CacheEntryMeta, RefsCache } from "./types.js";
import { CACHE_SCHEMA_VERSION, MAX_ENTRIES_PER_ANALYZER, MAX_CHANGESET_ENTRIES } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = "cache";
const INDEX_FILE = "index.json";
const GIT_DIR = "git";
const REFS_FILE = "refs.json";
const CHANGESET_DIR = "changeset";
const PER_ANALYZER_DIR = "per-analyzer";

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the cache base directory.
 */
export function getCacheDir(cwd: string = process.cwd()): string {
  return join(cwd, ".branch-narrator", CACHE_DIR);
}

/**
 * Get the cache index file path.
 */
export function getIndexPath(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), INDEX_FILE);
}

/**
 * Get the git cache directory.
 */
export function getGitCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), GIT_DIR);
}

/**
 * Get the refs cache file path.
 */
export function getRefsCachePath(cwd: string = process.cwd()): string {
  return join(getGitCacheDir(cwd), REFS_FILE);
}

/**
 * Get the changeset cache directory.
 */
export function getChangeSetCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), CHANGESET_DIR);
}

/**
 * Get path for a specific changeset cache entry.
 */
export function getChangeSetCachePath(hash: string, cwd: string = process.cwd()): string {
  return join(getChangeSetCacheDir(cwd), `${hash}.json`);
}

/**
 * Get the per-analyzer cache directory.
 */
export function getPerAnalyzerCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), PER_ANALYZER_DIR);
}

/**
 * Get path for a specific per-analyzer cache entry.
 */
export function getPerAnalyzerCachePath(hash: string, cwd: string = process.cwd()): string {
  return join(getPerAnalyzerCacheDir(cwd), `${hash}.json`);
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Compute SHA256 hash of a string or object.
 */
export function computeHash(data: string | object): string {
  const content = typeof data === "string" ? data : JSON.stringify(sortKeys(data));
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Sort object keys recursively for consistent hashing.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensure the cache directory structure exists.
 */
export async function ensureCacheDirs(cwd: string = process.cwd()): Promise<void> {
  // First ensure the base cache directory exists
  await mkdir(getCacheDir(cwd), { recursive: true });
  
  // Then create subdirectories in parallel (only those actually used)
  await Promise.all([
    mkdir(getGitCacheDir(cwd), { recursive: true }),
    mkdir(getChangeSetCacheDir(cwd), { recursive: true }),
    mkdir(getPerAnalyzerCacheDir(cwd), { recursive: true }),
  ]);
}

/**
 * Check if cache directory exists.
 */
export async function cacheExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await stat(getCacheDir(cwd));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all cache files.
 */
export async function clearCache(cwd: string = process.cwd()): Promise<void> {
  const cacheDir = getCacheDir(cwd);
  try {
    await rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Create an empty cache index.
 */
export function createEmptyIndex(cliVersion?: string): CacheIndex {
  const now = new Date().toISOString();
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    created: now,
    lastAccess: now,
    git: {
      headSha: "",
      isDirty: false,
      lastChecked: now,
    },
    profile: null,
    stats: {
      hits: 0,
      misses: 0,
      size: 0,
      entries: 0,
      oldestEntry: null,
      newestEntry: null,
    },
    entries: [],
    cliVersion,
  };
}

/**
 * Create an empty refs cache.
 */
export function createEmptyRefsCache(): RefsCache {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    refs: {},
  };
}

/**
 * Read the refs cache.
 */
export async function readRefsCache(cwd: string = process.cwd()): Promise<RefsCache> {
  try {
    const content = await readFile(getRefsCachePath(cwd), "utf-8");
    const cache = JSON.parse(content) as RefsCache;
    // Invalidate if schema version changed
    if (cache.schemaVersion !== CACHE_SCHEMA_VERSION) {
      return createEmptyRefsCache();
    }
    return cache;
  } catch {
    return createEmptyRefsCache();
  }
}

/**
 * Write the refs cache atomically.
 */
export async function writeRefsCache(cache: RefsCache, cwd: string = process.cwd()): Promise<void> {
  await ensureCacheDirs(cwd);
  cache.lastUpdated = new Date().toISOString();
  const cachePath = getRefsCachePath(cwd);
  const tempPath = `${cachePath}.tmp`;
  
  // Use synchronous write for reliability (bun has issues with async write + rename)
  const { writeFileSync, renameSync } = await import("node:fs");
  writeFileSync(tempPath, JSON.stringify(cache, null, 2), "utf-8");
  renameSync(tempPath, cachePath);
}

/**
 * Read the cache index.
 */
export async function readIndex(cwd: string = process.cwd()): Promise<CacheIndex> {
  try {
    const content = await readFile(getIndexPath(cwd), "utf-8");
    return JSON.parse(content) as CacheIndex;
  } catch {
    return createEmptyIndex();
  }
}

/**
 * Write the cache index atomically.
 */
export async function writeIndex(index: CacheIndex, cwd: string = process.cwd()): Promise<void> {
  await ensureCacheDirs(cwd);
  index.lastAccess = new Date().toISOString();
  const indexPath = getIndexPath(cwd);
  const tempPath = `${indexPath}.tmp`;
  const content = JSON.stringify(index, null, 2);
  
  // Use synchronous write for reliability
  const { writeFileSync, renameSync } = await import("node:fs");
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, indexPath);
}

/**
 * Update cache statistics.
 */
export function updateStats(index: CacheIndex, hit: boolean): void {
  if (hit) {
    index.stats.hits++;
  } else {
    index.stats.misses++;
  }
}

/**
 * Add an entry to the cache index.
 */
export function addEntry(index: CacheIndex, entry: CacheEntryMeta): void {
  // Remove existing entry with same hash
  index.entries = index.entries.filter((e) => e.hash !== entry.hash);
  index.entries.push(entry);
  index.stats.entries = index.entries.length;

  // Update oldest/newest
  const sorted = [...index.entries].sort((a, b) => a.created.localeCompare(b.created));
  index.stats.oldestEntry = sorted[0]?.created ?? null;
  index.stats.newestEntry = sorted[sorted.length - 1]?.created ?? null;
}

/**
 * Remove an entry from the cache index.
 */
export function removeEntry(index: CacheIndex, hash: string): void {
  index.entries = index.entries.filter((e) => e.hash !== hash);
  index.stats.entries = index.entries.length;
}

/**
 * Update the lastAccess timestamp for a cache entry.
 */
export function updateEntryAccess(index: CacheIndex, hash: string): void {
  const entry = index.entries.find((e) => e.hash === hash);
  if (entry) {
    entry.lastAccess = new Date().toISOString();
  }
}

// ============================================================================
// Cache Entry Operations
// ============================================================================

/**
 * Write a cache entry file.
 */
export async function writeCacheEntry<T>(
  path: string,
  data: T
): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  const content = JSON.stringify(data, null, 2);
  const tempPath = `${path}.tmp`;
  
  // Use synchronous write for reliability (bun has issues with async write + rename)
  const { writeFileSync, renameSync } = await import("node:fs");
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
  return Buffer.byteLength(content, "utf-8");
}

/**
 * Read a cache entry file.
 */
export async function readCacheEntry<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Check if a cache entry exists.
 */
export async function cacheEntryExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Pruning & Maintenance
// ============================================================================

/**
 * Get the cache file path for a given entry type and hash.
 */
export function getCacheEntryPath(
  type: CacheEntryMeta["type"],
  hash: string,
  cwd: string = process.cwd()
): string {
  switch (type) {
    case "changeset":
      return getChangeSetCachePath(hash, cwd);
    case "per-analyzer":
      return getPerAnalyzerCachePath(hash, cwd);
    case "ref":
      // Refs are stored in a single file, not individually
      return getRefsCachePath(cwd);
    default:
      return getChangeSetCachePath(hash, cwd);
  }
}

/**
 * Delete a cache entry file.
 */
export async function deleteCacheEntry(
  type: CacheEntryMeta["type"],
  hash: string,
  cwd: string = process.cwd()
): Promise<void> {
  const path = getCacheEntryPath(type, hash, cwd);

  try {
    await rm(path, { force: true });
  } catch {
    // Ignore errors during deletion
  }
}

/**
 * Prune cache entries older than maxAge days.
 */
export async function pruneOldEntries(
  maxAge: number,
  cwd: string = process.cwd()
): Promise<number> {
  const index = await readIndex(cwd);
  const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000).toISOString();

  let removed = 0;
  const toRemove = index.entries.filter((e) => e.created < cutoff);

  for (const entry of toRemove) {
    // Skip ref entries - they're handled separately
    if (entry.type === "ref") continue;

    await deleteCacheEntry(entry.type, entry.hash, cwd);
    removeEntry(index, entry.hash);
    removed++;
  }

  if (removed > 0) {
    await writeIndex(index, cwd);
  }

  return removed;
}

/**
 * Prune cache entries using LRU eviction to stay under maxSize bytes.
 * Removes least recently accessed entries first until total size is under limit.
 * 
 * @param maxSize - Maximum allowed cache size in bytes
 * @param cwd - Working directory
 * @returns Number of entries removed
 */
export async function pruneBySizeLRU(
  maxSize: number,
  cwd: string = process.cwd()
): Promise<number> {
  const index = await readIndex(cwd);
  
  // Calculate current total size from entries
  let currentSize = index.entries.reduce((sum, e) => sum + e.size, 0);
  
  if (currentSize <= maxSize) {
    return 0;
  }

  // Sort entries by lastAccess (oldest first = least recently used)
  const sortedEntries = [...index.entries]
    .filter((e) => e.type !== "ref") // Don't evict ref entries
    .sort((a, b) => a.lastAccess.localeCompare(b.lastAccess));

  let removed = 0;
  
  for (const entry of sortedEntries) {
    if (currentSize <= maxSize) {
      break;
    }

    await deleteCacheEntry(entry.type, entry.hash, cwd);
    removeEntry(index, entry.hash);
    currentSize -= entry.size;
    removed++;
  }

  if (removed > 0) {
    await writeIndex(index, cwd);
  }

  return removed;
}

/**
 * Prune excess per-analyzer cache entries for a specific analyzer.
 * Keeps only the N most recent entries (default: MAX_ENTRIES_PER_ANALYZER).
 *
 * @param analyzerName - The analyzer name to prune entries for
 * @param cwd - Working directory
 * @param maxEntries - Maximum entries to keep (default: MAX_ENTRIES_PER_ANALYZER)
 * @returns Number of entries removed
 */
export async function pruneExcessPerAnalyzerEntries(
  analyzerName: string,
  cwd: string = process.cwd(),
  maxEntries: number = MAX_ENTRIES_PER_ANALYZER
): Promise<number> {
  const index = await readIndex(cwd);

  // Get all per-analyzer entries for this specific analyzer
  const analyzerEntries = index.entries
    .filter((e) => e.type === "per-analyzer" && e.analyzerName === analyzerName)
    .sort((a, b) => b.created.localeCompare(a.created)); // Newest first

  if (analyzerEntries.length <= maxEntries) {
    return 0;
  }

  // Remove entries beyond the limit (oldest ones)
  const toRemove = analyzerEntries.slice(maxEntries);
  let removed = 0;

  for (const entry of toRemove) {
    await deleteCacheEntry(entry.type, entry.hash, cwd);
    removeEntry(index, entry.hash);
    removed++;
  }

  if (removed > 0) {
    await writeIndex(index, cwd);
  }

  return removed;
}

/**
 * Prune excess changeset cache entries.
 * Keeps only the N most recent entries (default: MAX_CHANGESET_ENTRIES).
 *
 * @param cwd - Working directory
 * @param maxEntries - Maximum entries to keep (default: MAX_CHANGESET_ENTRIES)
 * @returns Number of entries removed
 */
export async function pruneExcessChangeSetEntries(
  cwd: string = process.cwd(),
  maxEntries: number = MAX_CHANGESET_ENTRIES
): Promise<number> {
  const index = await readIndex(cwd);

  // Get all changeset entries
  const changesetEntries = index.entries
    .filter((e) => e.type === "changeset")
    .sort((a, b) => b.created.localeCompare(a.created)); // Newest first

  if (changesetEntries.length <= maxEntries) {
    return 0;
  }

  // Remove entries beyond the limit (oldest ones)
  const toRemove = changesetEntries.slice(maxEntries);
  let removed = 0;

  for (const entry of toRemove) {
    await deleteCacheEntry(entry.type, entry.hash, cwd);
    removeEntry(index, entry.hash);
    removed++;
  }

  if (removed > 0) {
    await writeIndex(index, cwd);
  }

  return removed;
}

/**
 * Calculate total cache size.
 */
export async function calculateCacheSize(cwd: string = process.cwd()): Promise<number> {
  let totalSize = 0;

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else {
          const s = await stat(fullPath);
          totalSize += s.size;
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  await walkDir(getCacheDir(cwd));
  return totalSize;
}
