/**
 * Per-analyzer caching.
 *
 * Caches analyzer findings based on the ChangeSet they were computed from.
 * Since analyzers are pure functions, the same ChangeSet always produces
 * the same findings.
 *
 * Supports content-based cache keys: when an analyzer declares
 * `cache.includeGlobs`, only matching files are considered for the cache key.
 * This allows cache hits when unrelated files change.
 */

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import picomatch from "picomatch";
import type { Analyzer, ChangeSet, FileDiff, Finding, ProfileName } from "../core/types.js";
import type { CachedAnalyzerFindings, CacheConfig, CacheEntryMetadata } from "./types.js";
import { MAX_ENTRIES_PER_CATEGORY } from "./types.js";
import { getAnalyzerCacheDir } from "./paths.js";
import {
  readIndex,
  writeIndex,
  ensureDir,
  atomicWriteFile,
} from "./storage.js";
import { computeCacheKey, hashString } from "./hash.js";
import { getVersion } from "../core/version.js";

// ============================================================================
// Types
// ============================================================================

export interface AnalyzerCacheContext {
  /** Cache key of the ChangeSet being analyzed */
  changeSetKey: string;
  /** Profile name for cache organization */
  profileName?: ProfileName;
  /** Working directory */
  cwd?: string;
}

export interface RunAnalyzersWithCacheOptions {
  config: CacheConfig;
  /** Cache key of the ChangeSet being analyzed */
  changeSetKey?: string;
  profileName?: ProfileName;
  cwd?: string;
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Filter FileDiffs by glob patterns using picomatch.
 */
export function filterDiffsByPatterns(
  diffs: FileDiff[],
  includeGlobs?: string[],
  excludeGlobs?: string[],
): FileDiff[] {
  let result = diffs;

  if (includeGlobs && includeGlobs.length > 0) {
    const matchers = includeGlobs.map((p) => picomatch(p, { dot: true }));
    result = result.filter((d) => matchers.some((m) => m(d.path)));
  }

  if (excludeGlobs && excludeGlobs.length > 0) {
    const matchers = excludeGlobs.map((p) => picomatch(p, { dot: true }));
    result = result.filter((d) => !matchers.some((m) => m(d.path)));
  }

  return result;
}

/**
 * Compute a content-based hash of the ChangeSet files relevant to an analyzer.
 *
 * For analyzers with cache.includeGlobs, only matching files are hashed.
 * For analyzers with cache defined but no patterns (cache: {}), all files are hashed.
 *
 * This produces a stable key that only changes when relevant file content
 * changes, not when unrelated worktree state changes.
 */
export function computeAnalyzerContentHash(
  analyzer: Analyzer,
  changeSet: ChangeSet,
): string {
  const { includeGlobs, excludeGlobs } = analyzer.cache ?? {};

  const relevantDiffs = filterDiffsByPatterns(
    changeSet.diffs,
    includeGlobs,
    excludeGlobs,
  );

  // Sort by path for determinism
  const sorted = [...relevantDiffs].sort((a, b) => a.path.localeCompare(b.path));

  // Build content fingerprint from path + status + full hunk data
  const parts: string[] = [];
  for (const diff of sorted) {
    const hunkData = diff.hunks.map((h) =>
      `${h.content}\n${h.additions.join("\n")}\n${h.deletions.join("\n")}`
    ).join("\x02");
    parts.push(`${diff.path}\0${diff.status}\0${hunkData}`);
  }

  return hashString(parts.join("\x01"));
}

/**
 * Compute cache key for an analyzer's findings.
 *
 * For analyzers with cache metadata: uses a content-based key derived from
 * matching file diffs. This allows cache hits when unrelated files change.
 *
 * For analyzers without cache metadata: falls back to the ChangeSet-based
 * key (worktree-signature-based) for safety, since such analyzers may depend
 * on external state (e.g., git grep).
 */
async function computeAnalyzerKey(
  analyzer: Analyzer,
  changeSet: ChangeSet,
  changeSetKey: string,
): Promise<string> {
  const cliVersion = await getVersion();

  if (analyzer.cache) {
    // Content-based key: only changes when relevant file content changes
    const contentHash = computeAnalyzerContentHash(analyzer, changeSet);
    return computeCacheKey(analyzer.name, contentHash, cliVersion);
  }

  // Fallback: use ChangeSet cache key (worktree-based, invalidates on any change)
  return computeCacheKey(changeSetKey, analyzer.name, cliVersion);
}

/**
 * Get the file path for an analyzer cache entry.
 */
function getAnalyzerFilePath(
  analyzerName: string,
  key: string,
  cwd: string
): string {
  const safeName = analyzerName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getAnalyzerCacheDir(cwd), `${safeName}_${key}.json`);
}

/**
 * Clean up orphaned cache files (files without index entries).
 */
async function cleanupOrphanedFiles(cwd: string): Promise<void> {
  const analyzerDir = getAnalyzerCacheDir(cwd);

  try {
    const files = await readdir(analyzerDir);
    const index = await readIndex(cwd);

    // Build set of all known keys from index
    const knownKeys = new Set<string>();
    for (const [category, entries] of Object.entries(index.entries)) {
      if (category.startsWith("analyzer:")) {
        for (const entry of entries) {
          // Key format in file: analyzerName_key.json
          const analyzerName = category.slice("analyzer:".length);
          const safeName = analyzerName.replace(/[^a-zA-Z0-9_-]/g, "_");
          knownKeys.add(`${safeName}_${entry.key}.json`);
        }
      }
    }

    // Delete files not in index
    for (const file of files) {
      if (file.endsWith(".json") && !knownKeys.has(file)) {
        try {
          await rm(join(analyzerDir, file), { force: true });
        } catch {
          // Ignore deletion errors
        }
      }
    }
  } catch {
    // Directory might not exist yet
  }
}

// ============================================================================
// Analyzer Cache Run
// ============================================================================

/**
 * Result of running a single analyzer with caching.
 */
interface AnalyzerCacheRunResult {
  findings: Finding[];
  /** Metadata to add to index (if cache miss) */
  pendingMetadata?: CacheEntryMetadata;
  /** Category for the pending metadata */
  pendingCategory?: string;
  /** Whether this was a cache hit */
  cacheHit: boolean;
}

/**
 * Run a single analyzer with caching.
 * Returns findings and pending metadata for batch index update.
 */
async function runAnalyzerWithCache(
  analyzer: Analyzer,
  changeSet: ChangeSet,
  context: AnalyzerCacheContext,
  config: CacheConfig
): Promise<AnalyzerCacheRunResult> {
  const cwd = context.cwd ?? config.cwd ?? process.cwd();

  // Try to load from cache (without updating index - we'll batch that)
  if (config.enabled && context.changeSetKey) {
    try {
      const cacheKey = await computeAnalyzerKey(analyzer, changeSet, context.changeSetKey);
      const filePath = getAnalyzerFilePath(analyzer.name, cacheKey, cwd);

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");
      const cached = JSON.parse(content) as CachedAnalyzerFindings;

      if (cached.schemaVersion === "1.0") {
        const currentVersion = await getVersion();
        if (cached.metadata.cliVersion === currentVersion) {
          return {
            findings: cached.findings as Finding[],
            cacheHit: true,
          };
        }
      }
    } catch {
      // Cache miss
    }
  }

  // Run the analyzer
  const findings = await analyzer.analyze(changeSet);

  // Prepare cache entry (don't write index yet - will batch)
  let pendingMetadata: CacheEntryMetadata | undefined;
  let pendingCategory: string | undefined;

  if (config.enabled && context.changeSetKey) {
    try {
      const cacheKey = await computeAnalyzerKey(analyzer, changeSet, context.changeSetKey);
      const cliVersion = await getVersion();

      const cached: CachedAnalyzerFindings = {
        schemaVersion: "1.0",
        analyzerName: analyzer.name,
        findings,
        metadata: {
          inputSignature: context.changeSetKey,
          cliVersion,
          profileName: context.profileName,
        },
      };

      const filePath = getAnalyzerFilePath(analyzer.name, cacheKey, cwd);
      const content = JSON.stringify(cached, null, 2);
      const sizeBytes = Buffer.byteLength(content, "utf-8");

      // Write file (files can be written in parallel)
      await ensureDir(getAnalyzerCacheDir(cwd));
      await atomicWriteFile(filePath, content);

      // Prepare metadata for batch index update
      const now = new Date().toISOString();
      pendingCategory = `analyzer:${analyzer.name}`;
      pendingMetadata = {
        key: cacheKey,
        category: pendingCategory,
        createdAt: now,
        lastAccessedAt: now,
        sizeBytes,
        cliVersion,
      };
    } catch {
      // Ignore cache write errors
    }
  }

  return {
    findings,
    pendingMetadata,
    pendingCategory,
    cacheHit: false,
  };
}

/**
 * Run all analyzers with caching support.
 *
 * For each analyzer:
 * 1. Check if cached findings exist for the ChangeSet
 * 2. If cache hit, use cached findings
 * 3. If cache miss, run analyzer and cache results
 * 4. Batch update the index at the end to avoid race conditions
 */
export async function runAnalyzersWithCache(
  analyzers: Analyzer[],
  changeSet: ChangeSet,
  options: RunAnalyzersWithCacheOptions
): Promise<Finding[]> {
  const { config, changeSetKey, profileName, cwd: optCwd } = options;
  const cwd = optCwd ?? process.cwd();

  // If no changeSetKey provided, run without caching
  if (!changeSetKey) {
    const findingsArrays = await Promise.all(
      analyzers.map((analyzer) => analyzer.analyze(changeSet))
    );
    return findingsArrays.flat();
  }

  const context: AnalyzerCacheContext = {
    changeSetKey,
    profileName,
    cwd,
  };

  // Clean up orphaned files periodically (on first run)
  await cleanupOrphanedFiles(cwd);

  // Run all analyzers in parallel
  const results = await Promise.all(
    analyzers.map((analyzer) => runAnalyzerWithCache(analyzer, changeSet, context, config))
  );

  // Batch update the index with all pending metadata
  const pendingEntries: Array<{ category: string; metadata: CacheEntryMetadata }> = [];
  let hits = 0;
  let misses = 0;

  for (const result of results) {
    if (result.cacheHit) {
      hits++;
    } else {
      misses++;
      if (result.pendingMetadata && result.pendingCategory) {
        pendingEntries.push({
          category: result.pendingCategory,
          metadata: result.pendingMetadata,
        });
      }
    }
  }

  // Batch update index
  if (pendingEntries.length > 0 || hits > 0 || misses > 0) {
    try {
      const index = await readIndex(cwd);

      // Record hits/misses
      index.hits += hits;
      index.misses += misses;

      // Add all pending entries
      for (const { category, metadata } of pendingEntries) {
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

        // Enforce limit (keep only 2 most recent)
        if (index.entries[category].length > MAX_ENTRIES_PER_CATEGORY) {
          const removed = index.entries[category].splice(MAX_ENTRIES_PER_CATEGORY);
          // Delete old files
          for (const entry of removed) {
            const analyzerName = category.slice("analyzer:".length);
            const filePath = getAnalyzerFilePath(analyzerName, entry.key, cwd);
            try {
              await rm(filePath, { force: true });
            } catch {
              // Ignore
            }
          }
        }
      }

      await writeIndex(index, cwd);
    } catch {
      // Ignore index update errors
    }
  }

  // Flatten results into single array
  return results.map(r => r.findings).flat();
}
