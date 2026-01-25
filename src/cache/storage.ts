/**
 * Cache storage utilities.
 *
 * Handles reading/writing cache files, directory management,
 * and atomic file operations.
 */

import { mkdir, readFile, writeFile, stat, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { CacheIndex, CacheEntryMeta, RefsCache } from "./types.js";
import { CACHE_SCHEMA_VERSION } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = "cache";
const INDEX_FILE = "index.json";
const GIT_DIR = "git";
const DIFFS_DIR = "diffs";
const REFS_FILE = "refs.json";
const FILES_DIR = "files";
const CHANGESET_DIR = "changeset";
const ANALYSIS_DIR = "analysis";
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
 * Get the diffs cache directory.
 */
export function getDiffsCacheDir(cwd: string = process.cwd()): string {
  return join(getGitCacheDir(cwd), DIFFS_DIR);
}

/**
 * Get path for a specific diff cache entry.
 */
export function getDiffCachePath(hash: string, cwd: string = process.cwd()): string {
  return join(getDiffsCacheDir(cwd), `${hash}.json`);
}

/**
 * Get the analysis cache directory.
 */
export function getAnalysisCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), ANALYSIS_DIR);
}

/**
 * Get path for a specific analysis cache entry.
 */
export function getAnalysisCachePath(hash: string, cwd: string = process.cwd()): string {
  return join(getAnalysisCacheDir(cwd), hash, "findings.json");
}

/**
 * Get the refs cache file path.
 */
export function getRefsCachePath(cwd: string = process.cwd()): string {
  return join(getGitCacheDir(cwd), REFS_FILE);
}

/**
 * Get the files cache directory.
 */
export function getFilesCacheDir(cwd: string = process.cwd()): string {
  return join(getGitCacheDir(cwd), FILES_DIR);
}

/**
 * Get path for a specific file list cache entry.
 */
export function getFileListCachePath(hash: string, cwd: string = process.cwd()): string {
  return join(getFilesCacheDir(cwd), `${hash}.json`);
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
  await Promise.all([
    mkdir(getDiffsCacheDir(cwd), { recursive: true }),
    mkdir(getFilesCacheDir(cwd), { recursive: true }),
    mkdir(getChangeSetCacheDir(cwd), { recursive: true }),
    mkdir(getAnalysisCacheDir(cwd), { recursive: true }),
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
  await writeFile(tempPath, JSON.stringify(cache, null, 2), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, cachePath);
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
  await writeFile(tempPath, JSON.stringify(index, null, 2), "utf-8");
  // Atomic rename
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, indexPath);
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
  await writeFile(tempPath, content, "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, path);
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
    case "diff":
      return getDiffCachePath(hash, cwd);
    case "changeset":
      return getChangeSetCachePath(hash, cwd);
    case "analysis":
      return getAnalysisCachePath(hash, cwd);
    case "filelist":
      return getFileListCachePath(hash, cwd);
    case "per-analyzer":
      return getPerAnalyzerCachePath(hash, cwd);
    case "ref":
      // Refs are stored in a single file, not individually
      return getRefsCachePath(cwd);
    default:
      return getDiffCachePath(hash, cwd);
  }
}

/**
 * Delete a cache entry file and its containing directory if applicable.
 */
export async function deleteCacheEntry(
  type: CacheEntryMeta["type"],
  hash: string,
  cwd: string = process.cwd()
): Promise<void> {
  const path = getCacheEntryPath(type, hash, cwd);

  try {
    await rm(path, { force: true });
    // For analysis entries, also remove the containing directory
    if (type === "analysis") {
      await rm(dirname(path), { recursive: true, force: true });
    }
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
