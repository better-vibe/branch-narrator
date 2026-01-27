/**
 * Hashing utilities for cache keys.
 *
 * Uses SHA-256 truncated to 16 hex characters for cache keys.
 * This provides a good balance between collision resistance and key length.
 */

import { createHash } from "node:crypto";

/**
 * Length of truncated hash for cache keys (16 hex chars = 64 bits).
 */
export const HASH_LENGTH = 16;

/**
 * Compute SHA-256 hash of a string, truncated to 16 hex characters.
 */
export function hashString(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, HASH_LENGTH);
}

/**
 * Compute SHA-256 hash of a buffer, truncated to 16 hex characters.
 */
export function hashBuffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex").slice(0, HASH_LENGTH);
}

/**
 * Compute a cache key from multiple components.
 * Components are joined with colons and hashed together.
 */
export function computeCacheKey(...components: string[]): string {
  const combined = components.join(":");
  return hashString(combined);
}

/**
 * Compute hash of file patterns (include/exclude globs).
 * Patterns are sorted for determinism.
 */
export function hashFilePatterns(
  includes: string[],
  excludes: string[]
): string {
  const sortedIncludes = [...includes].sort();
  const sortedExcludes = [...excludes].sort();
  const combined = JSON.stringify({ includes: sortedIncludes, excludes: sortedExcludes });
  return hashString(combined);
}

/**
 * Compute hash of serialized data for content-addressed storage.
 */
export function hashContent(data: unknown): string {
  const json = JSON.stringify(data);
  return hashString(json);
}
