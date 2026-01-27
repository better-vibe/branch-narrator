/**
 * Cache path utilities.
 *
 * Centralizes all cache directory and file path logic.
 */

import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

/** Base directory for branch-narrator data */
export const BRANCH_NARRATOR_DIR = ".branch-narrator";

/** Cache subdirectory */
export const CACHE_DIR = "cache";

/** Cache index file name */
export const INDEX_FILE = "index.json";

/** Git refs cache subdirectory */
export const GIT_DIR = "git";

/** Git refs cache file name */
export const REFS_FILE = "refs.json";

/** ChangeSet cache subdirectory */
export const CHANGESET_DIR = "changeset";

/** Per-analyzer cache subdirectory */
export const ANALYZER_DIR = "per-analyzer";

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the base cache directory path.
 */
export function getCacheDir(cwd: string = process.cwd()): string {
  return join(cwd, BRANCH_NARRATOR_DIR, CACHE_DIR);
}

/**
 * Get the cache index file path.
 */
export function getIndexPath(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), INDEX_FILE);
}

/**
 * Get the git cache directory path.
 */
export function getGitCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), GIT_DIR);
}

/**
 * Get the git refs cache file path.
 */
export function getRefsCachePath(cwd: string = process.cwd()): string {
  return join(getGitCacheDir(cwd), REFS_FILE);
}

/**
 * Get the changeset cache directory path.
 */
export function getChangesetCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), CHANGESET_DIR);
}

/**
 * Get a specific changeset cache file path.
 */
export function getChangesetCachePath(
  key: string,
  cwd: string = process.cwd()
): string {
  return join(getChangesetCacheDir(cwd), `${key}.json`);
}

/**
 * Get the per-analyzer cache directory path.
 */
export function getAnalyzerCacheDir(cwd: string = process.cwd()): string {
  return join(getCacheDir(cwd), ANALYZER_DIR);
}

/**
 * Get a specific analyzer cache file path.
 */
export function getAnalyzerCachePath(
  analyzerName: string,
  key: string,
  cwd: string = process.cwd()
): string {
  // Sanitize analyzer name for filesystem
  const safeName = analyzerName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getAnalyzerCacheDir(cwd), `${safeName}_${key}.json`);
}

/**
 * Extract analyzer name from a cache file path.
 */
export function extractAnalyzerName(filename: string): string {
  // Format: analyzerName_key.json
  const match = filename.match(/^(.+?)_[a-f0-9]+\.json$/);
  return match ? match[1] : filename;
}
