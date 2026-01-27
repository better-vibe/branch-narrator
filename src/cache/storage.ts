/**
 * Cache storage operations.
 *
 * Handles reading/writing cache files, index management,
 * atomic writes, and entry limit enforcement.
 */

import {
  mkdir,
  readFile,
  writeFile,
  rm,
  rename,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  CacheIndex,
  CacheEntryMetadata,
  CacheStats,
  CacheOptions,
  PruneOptions,
} from "./types.js";
import {
  MAX_ENTRIES_PER_CATEGORY,
  MAX_CHANGESET_ENTRIES,
  DEFAULT_MAX_AGE_DAYS,
} from "./types.js";
import {
  getCacheDir,
  getIndexPath,
  getChangesetCacheDir,
  getAnalyzerCacheDir,
} from "./paths.js";
import { getVersion } from "../core/version.js";

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Create an empty cache index.
 */
function createEmptyIndex(): CacheIndex {
  return {
    schemaVersion: "1.0",
    hits: 0,
    misses: 0,
    entries: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read the cache index.
 * Returns empty index if file doesn't exist or is invalid.
 */
export async function readIndex(cwd: string = process.cwd()): Promise<CacheIndex> {
  try {
    const indexPath = getIndexPath(cwd);
    const content = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content) as CacheIndex;

    // Validate schema version
    if (parsed.schemaVersion !== "1.0") {
      return createEmptyIndex();
    }

    return parsed;
  } catch {
    return createEmptyIndex();
  }
}

/**
 * Write the cache index atomically.
 */
export async function writeIndex(
  index: CacheIndex,
  cwd: string = process.cwd()
): Promise<void> {
  index.updatedAt = new Date().toISOString();
  const indexPath = getIndexPath(cwd);
  await ensureDir(dirname(indexPath));
  await atomicWriteFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Record a cache hit and update the index.
 */
export async function recordHit(cwd: string = process.cwd()): Promise<void> {
  const index = await readIndex(cwd);
  index.hits++;
  await writeIndex(index, cwd);
}

/**
 * Record a cache miss and update the index.
 */
export async function recordMiss(cwd: string = process.cwd()): Promise<void> {
  const index = await readIndex(cwd);
  index.misses++;
  await writeIndex(index, cwd);
}

/**
 * Add an entry to the cache index.
 */
export async function addIndexEntry(
  category: string,
  metadata: CacheEntryMetadata,
  cwd: string = process.cwd()
): Promise<void> {
  const index = await readIndex(cwd);

  if (!index.entries[category]) {
    index.entries[category] = [];
  }

  // Remove existing entry with same key if present
  index.entries[category] = index.entries[category].filter(
    (e) => e.key !== metadata.key
  );

  // Add new entry
  index.entries[category].push(metadata);

  // Sort by createdAt descending (newest first)
  index.entries[category].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  await writeIndex(index, cwd);
}

/**
 * Remove an entry from the cache index.
 */
export async function removeIndexEntry(
  category: string,
  key: string,
  cwd: string = process.cwd()
): Promise<void> {
  const index = await readIndex(cwd);

  if (index.entries[category]) {
    index.entries[category] = index.entries[category].filter(
      (e) => e.key !== key
    );

    // Remove empty category
    if (index.entries[category].length === 0) {
      delete index.entries[category];
    }

    await writeIndex(index, cwd);
  }
}

// ============================================================================
// Atomic File Operations
// ============================================================================

/**
 * Ensure a directory exists.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Write a file atomically using temp file + rename.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string
): Promise<void> {
  const tempPath = join(tmpdir(), `branch-narrator-${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, content, "utf-8");
    await ensureDir(dirname(filePath));
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read a JSON file safely.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON file atomically.
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown
): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(data, null, 2));
}

// ============================================================================
// Entry Limit Enforcement
// ============================================================================

/**
 * Enforce entry limit for a category by removing oldest entries.
 */
export async function enforceEntryLimit(
  category: string,
  maxEntries: number,
  getFilePath: (key: string) => string,
  cwd: string = process.cwd()
): Promise<void> {
  const index = await readIndex(cwd);
  const entries = index.entries[category] || [];

  if (entries.length <= maxEntries) {
    return;
  }

  // Sort by createdAt descending (newest first)
  const sorted = [...entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  // Remove oldest entries beyond the limit
  const toRemove = sorted.slice(maxEntries);

  for (const entry of toRemove) {
    try {
      const filePath = getFilePath(entry.key);
      await rm(filePath, { force: true });
      await removeIndexEntry(category, entry.key, cwd);
    } catch {
      // Ignore removal errors
    }
  }
}

/**
 * Enforce changeset cache entry limit (2 total).
 */
export async function enforceChangesetLimit(
  cwd: string = process.cwd()
): Promise<void> {
  const changesetDir = getChangesetCacheDir(cwd);
  await enforceEntryLimit(
    "changeset",
    MAX_CHANGESET_ENTRIES,
    (key) => join(changesetDir, `${key}.json`),
    cwd
  );
}

/**
 * Enforce per-analyzer cache entry limit (2 per analyzer).
 */
export async function enforceAnalyzerLimit(
  analyzerName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const analyzerDir = getAnalyzerCacheDir(cwd);
  const category = `analyzer:${analyzerName}`;
  const safeName = analyzerName.replace(/[^a-zA-Z0-9_-]/g, "_");

  await enforceEntryLimit(
    category,
    MAX_ENTRIES_PER_CATEGORY,
    (key) => join(analyzerDir, `${safeName}_${key}.json`),
    cwd
  );
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(
  options: CacheOptions = {}
): Promise<CacheStats> {
  const cwd = options.cwd ?? process.cwd();
  const index = await readIndex(cwd);

  // Collect all entries
  const allEntries: CacheEntryMetadata[] = [];
  for (const entries of Object.values(index.entries)) {
    allEntries.push(...entries);
  }

  // Calculate total size
  const totalSize = allEntries.reduce((sum, e) => sum + e.sizeBytes, 0);

  // Find oldest and newest
  const sorted = [...allEntries].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const oldest = sorted[0]?.createdAt ?? null;
  const newest = sorted[sorted.length - 1]?.createdAt ?? null;

  // Calculate hit rate
  const total = index.hits + index.misses;
  const hitRate = total > 0 ? Math.round((index.hits / total) * 100) : 0;

  return {
    hits: index.hits,
    misses: index.misses,
    hitRate,
    entries: allEntries.length,
    sizeBytes: totalSize,
    sizeHuman: formatBytes(totalSize),
    oldestEntry: oldest,
    newestEntry: newest,
  };
}

// ============================================================================
// Cache Clear and Prune
// ============================================================================

/**
 * Clear all cache data.
 */
export async function clearCache(options: CacheOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDir = getCacheDir(cwd);

  try {
    await rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}

/**
 * Prune cache entries older than maxAgeDays.
 */
export async function pruneCache(options: PruneOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffIso = cutoff.toISOString();

  const index = await readIndex(cwd);
  let prunedCount = 0;

  for (const [category, entries] of Object.entries(index.entries)) {
    const toRemove = entries.filter((e) => e.createdAt < cutoffIso);

    for (const entry of toRemove) {
      try {
        // Determine file path based on category
        let filePath: string;
        if (category === "changeset") {
          filePath = join(getChangesetCacheDir(cwd), `${entry.key}.json`);
        } else if (category.startsWith("analyzer:")) {
          const analyzerName = category.slice("analyzer:".length);
          const safeName = analyzerName.replace(/[^a-zA-Z0-9_-]/g, "_");
          filePath = join(getAnalyzerCacheDir(cwd), `${safeName}_${entry.key}.json`);
        } else {
          continue;
        }

        await rm(filePath, { force: true });
        await removeIndexEntry(category, entry.key, cwd);
        prunedCount++;
      } catch {
        // Ignore removal errors
      }
    }
  }

  return prunedCount;
}

// ============================================================================
// Generic Cache Read/Write
// ============================================================================

/**
 * Write data to a cache file with metadata tracking.
 */
export async function writeCacheEntry<T>(
  category: string,
  key: string,
  data: T,
  filePath: string,
  cwd: string = process.cwd()
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const sizeBytes = Buffer.byteLength(content, "utf-8");
  const cliVersion = await getVersion();
  const now = new Date().toISOString();

  // Write the file
  await ensureDir(dirname(filePath));
  await atomicWriteFile(filePath, content);

  // Update index
  const metadata: CacheEntryMetadata = {
    key,
    category,
    createdAt: now,
    lastAccessedAt: now,
    sizeBytes,
    cliVersion,
  };

  await addIndexEntry(category, metadata, cwd);
}

/**
 * Read data from a cache file and update last accessed time.
 */
export async function readCacheEntry<T>(
  category: string,
  key: string,
  filePath: string,
  cwd: string = process.cwd()
): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as T;

    // Update last accessed time in index
    const index = await readIndex(cwd);
    const entries = index.entries[category];
    if (entries) {
      const entry = entries.find((e) => e.key === key);
      if (entry) {
        entry.lastAccessedAt = new Date().toISOString();
        await writeIndex(index, cwd);
      }
    }

    return data;
  } catch {
    return null;
  }
}
