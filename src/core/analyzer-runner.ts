/**
 * Utility for running analyzers efficiently.
 *
 * Analyzers are pure functions that operate on the same ChangeSet independently,
 * making them ideal candidates for parallel execution.
 * Supports optional per-analyzer caching for improved performance.
 */

import type { Analyzer, ChangeSet, Finding, ProfileName } from "./types.js";
import type { CacheConfig } from "../cache/types.js";
import { runAnalyzersWithCache as runWithCache } from "../cache/analyzer.js";

/**
 * Options for running analyzers with caching.
 */
export interface RunAnalyzersOptions {
  /** Cache configuration (optional, defaults to disabled) */
  cache?: CacheConfig;
  /** Cache key of the ChangeSet (required for analyzer caching) */
  changeSetKey?: string;
  /** Profile name for cache organization (optional) */
  profileName?: ProfileName;
  /** Working directory (optional) */
  cwd?: string;
}

/**
 * Run all analyzers in parallel and collect findings.
 *
 * Since analyzers are independent pure functions operating on the same ChangeSet,
 * they can safely run concurrently for better performance.
 *
 * @param analyzers - Array of analyzers to run
 * @param changeSet - The change set to analyze
 * @param options - Optional configuration including caching
 * @returns Promise resolving to flattened array of all findings
 */
export async function runAnalyzersInParallel(
  analyzers: Analyzer[],
  changeSet: ChangeSet,
  options?: RunAnalyzersOptions
): Promise<Finding[]> {
  // If caching is enabled and we have a changeSetKey, use the cached runner
  if (options?.cache?.enabled && options.changeSetKey) {
    return runWithCache(analyzers, changeSet, {
      config: options.cache,
      changeSetKey: options.changeSetKey,
      profileName: options.profileName,
      cwd: options.cwd,
    });
  }

  // Otherwise, run analyzers directly (original behavior)
  const findingsArrays = await Promise.all(
    analyzers.map(analyzer => analyzer.analyze(changeSet))
  );

  // Flatten results into single array
  return findingsArrays.flat();
}
