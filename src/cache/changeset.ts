/**
 * ChangeSet caching.
 *
 * Caches parsed ChangeSets to avoid re-running git diff and parsing.
 */

import type { ChangeSet, DiffMode } from "../core/types.js";
import type { CachedChangeSet, CacheConfig } from "./types.js";
import { getChangesetCachePath } from "./paths.js";
import {
  readCacheEntry,
  writeCacheEntry,
  recordHit,
  recordMiss,
  enforceChangesetLimit,
} from "./storage.js";
import {
  computeChangeSetCacheKey,
  computeFilePatternsSignature,
  computeWorktreeSignature,
} from "./signatures.js";
import { getVersion } from "../core/version.js";

// ============================================================================
// Types
// ============================================================================

export interface ChangeSetCacheOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  includes?: string[];
  excludes?: string[];
  cwd?: string;
}

export interface ChangeSetCacheResult {
  changeSet: ChangeSet;
  cacheKey: string;
  /** Worktree signature computed during cache key generation (for reuse) */
  worktreeSignature?: string;
}

// ============================================================================
// Cache Key Computation
// ============================================================================

/**
 * Compute the cache key for a ChangeSet based on options.
 * This key can be used for both ChangeSet and analyzer caching.
 */
export async function getChangeSetCacheKey(
  options: ChangeSetCacheOptions,
  config: CacheConfig
): Promise<string | null> {
  if (!config.enabled) {
    return null;
  }

  const cwd = options.cwd ?? config.cwd ?? process.cwd();

  const filePatternsHash = computeFilePatternsSignature(
    options.includes ?? [],
    options.excludes ?? []
  );

  let worktreeSignature: string | undefined;
  if (options.mode !== "branch") {
    worktreeSignature = await computeWorktreeSignature(cwd);
  }

  return computeChangeSetCacheKey(
    {
      mode: options.mode,
      base: options.base,
      head: options.head,
      worktreeSignature,
      filePatternsHash,
    },
    cwd
  );
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Try to load a cached ChangeSet.
 * Returns null if no valid cache exists.
 * Also returns the cache key for use with analyzer caching.
 */
export async function loadCachedChangeSet(
  options: ChangeSetCacheOptions,
  config: CacheConfig,
  /** Pre-computed worktree signature to avoid redundant git operations */
  precomputedWorktreeSignature?: string
): Promise<ChangeSetCacheResult | null> {
  if (!config.enabled) {
    return null;
  }

  const cwd = options.cwd ?? config.cwd ?? process.cwd();

  try {
    // Compute cache key
    const filePatternsHash = computeFilePatternsSignature(
      options.includes ?? [],
      options.excludes ?? []
    );

    let worktreeSignature: string | undefined;
    if (options.mode !== "branch") {
      worktreeSignature = precomputedWorktreeSignature ?? await computeWorktreeSignature(cwd);
    }

    const cacheKey = await computeChangeSetCacheKey(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        worktreeSignature,
        filePatternsHash,
      },
      cwd
    );

    const cachePath = getChangesetCachePath(cacheKey, cwd);
    const cached = await readCacheEntry<CachedChangeSet>(
      "changeset",
      cacheKey,
      cachePath,
      cwd
    );

    if (!cached || cached.schemaVersion !== "1.0") {
      await recordMiss(cwd);
      return null;
    }

    // Validate CLI version matches
    const currentVersion = await getVersion();
    if (cached.metadata.cliVersion !== currentVersion) {
      await recordMiss(cwd);
      return null;
    }

    // Validate mode/refs match
    if (cached.metadata.mode !== options.mode) {
      await recordMiss(cwd);
      return null;
    }

    if (options.mode === "branch") {
      if (
        cached.metadata.base !== options.base ||
        cached.metadata.head !== options.head
      ) {
        await recordMiss(cwd);
        return null;
      }
    } else {
      // For non-branch modes, worktree signature must match
      if (cached.metadata.worktreeSignature !== worktreeSignature) {
        await recordMiss(cwd);
        return null;
      }
    }

    // Validate file patterns match
    if (cached.metadata.filePatternsHash !== filePatternsHash) {
      await recordMiss(cwd);
      return null;
    }

    await recordHit(cwd);
    return {
      changeSet: cached.data as ChangeSet,
      cacheKey,
      worktreeSignature,
    };
  } catch {
    return null;
  }
}

/**
 * Save a ChangeSet to cache.
 * Returns the cache key for use with analyzer caching.
 */
export async function saveChangeSetToCache(
  changeSet: ChangeSet,
  options: ChangeSetCacheOptions,
  config: CacheConfig,
  /** Pre-computed worktree signature to avoid redundant git operations */
  precomputedWorktreeSignature?: string
): Promise<string | null> {
  if (!config.enabled) {
    return null;
  }

  const cwd = options.cwd ?? config.cwd ?? process.cwd();

  try {
    // Compute signatures (reuse pre-computed worktree signature if available)
    const filePatternsHash = computeFilePatternsSignature(
      options.includes ?? [],
      options.excludes ?? []
    );

    let worktreeSignature: string | undefined;
    if (options.mode !== "branch") {
      worktreeSignature = precomputedWorktreeSignature ?? await computeWorktreeSignature(cwd);
    }

    const cacheKey = await computeChangeSetCacheKey(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        worktreeSignature,
        filePatternsHash,
      },
      cwd
    );

    const cliVersion = await getVersion();

    const cached: CachedChangeSet = {
      schemaVersion: "1.0",
      data: changeSet,
      metadata: {
        mode: options.mode,
        base: options.base,
        head: options.head,
        worktreeSignature,
        filePatternsHash,
        cliVersion,
      },
    };

    const cachePath = getChangesetCachePath(cacheKey, cwd);
    await writeCacheEntry("changeset", cacheKey, cached, cachePath, cwd);

    // Enforce entry limit
    await enforceChangesetLimit(cwd);

    return cacheKey;
  } catch {
    // Ignore cache write errors
    return null;
  }
}
