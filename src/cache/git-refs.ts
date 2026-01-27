/**
 * Git ref resolution caching.
 *
 * Caches git ref to SHA resolution to avoid repeated git calls.
 * Cache is invalidated when HEAD changes.
 */

import { execa } from "execa";
import type { RefsCache, CachedRefResolution } from "./types.js";
import { getRefsCachePath } from "./paths.js";
import { readJsonFile, writeJsonFile, ensureDir } from "./storage.js";
import { dirname } from "node:path";

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Get current HEAD SHA.
 */
async function getHeadSha(cwd: string): Promise<string> {
  const result = await execa("git", ["rev-parse", "HEAD"], { cwd });
  return result.stdout.trim();
}

/**
 * Resolve a git ref to its SHA.
 */
async function resolveRefToSha(ref: string, cwd: string): Promise<string | null> {
  try {
    const result = await execa("git", ["rev-parse", "--verify", ref], {
      cwd,
      reject: false,
    });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Refs Cache Operations
// ============================================================================

/**
 * Create an empty refs cache.
 */
function createEmptyRefsCache(headSha: string): RefsCache {
  return {
    schemaVersion: "1.0",
    headSha,
    refs: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read the refs cache.
 * Returns null if cache is invalid or HEAD has changed.
 */
export async function readRefsCache(
  cwd: string = process.cwd()
): Promise<RefsCache | null> {
  const cachePath = getRefsCachePath(cwd);
  const cache = await readJsonFile<RefsCache>(cachePath);

  if (!cache || cache.schemaVersion !== "1.0") {
    return null;
  }

  // Validate that HEAD hasn't changed
  try {
    const currentHead = await getHeadSha(cwd);
    if (cache.headSha !== currentHead) {
      return null; // Cache invalidated
    }
  } catch {
    return null;
  }

  return cache;
}

/**
 * Write the refs cache.
 */
export async function writeRefsCache(
  cache: RefsCache,
  cwd: string = process.cwd()
): Promise<void> {
  const cachePath = getRefsCachePath(cwd);
  await ensureDir(dirname(cachePath));
  cache.updatedAt = new Date().toISOString();
  await writeJsonFile(cachePath, cache);
}

/**
 * Resolve a git ref with caching.
 * Uses cached value if available and HEAD hasn't changed.
 */
export async function resolveRefSha(
  ref: string,
  cwd: string = process.cwd()
): Promise<string | null> {
  // Try to read existing cache
  let cache = await readRefsCache(cwd);

  // Check if ref is cached
  if (cache?.refs[ref]) {
    return cache.refs[ref].sha;
  }

  // Resolve ref
  const sha = await resolveRefToSha(ref, cwd);
  if (!sha) {
    return null;
  }

  // Update cache
  try {
    const currentHead = await getHeadSha(cwd);

    if (!cache || cache.headSha !== currentHead) {
      // Create new cache with current HEAD
      cache = createEmptyRefsCache(currentHead);
    }

    const resolution: CachedRefResolution = {
      ref,
      sha,
      resolvedAt: new Date().toISOString(),
    };

    cache.refs[ref] = resolution;
    await writeRefsCache(cache, cwd);
  } catch {
    // Ignore cache write errors
  }

  return sha;
}

/**
 * Validate that a git ref exists (with caching).
 */
export async function refExists(
  ref: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  const sha = await resolveRefSha(ref, cwd);
  return sha !== null;
}

/**
 * Clear the refs cache.
 */
export async function clearRefsCache(cwd: string = process.cwd()): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const cachePath = getRefsCachePath(cwd);
  try {
    await rm(cachePath, { force: true });
  } catch {
    // Ignore if file doesn't exist
  }
}
