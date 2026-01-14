/**
 * Utility for running analyzers efficiently.
 *
 * Analyzers are pure functions that operate on the same ChangeSet independently,
 * making them ideal candidates for parallel execution.
 */

import type { Analyzer, ChangeSet, Finding } from "./types.js";

/**
 * Run all analyzers in parallel and collect findings.
 *
 * Since analyzers are independent pure functions operating on the same ChangeSet,
 * they can safely run concurrently for better performance.
 *
 * @param analyzers - Array of analyzers to run
 * @param changeSet - The change set to analyze
 * @returns Promise resolving to flattened array of all findings
 */
export async function runAnalyzersInParallel(
  analyzers: Analyzer[],
  changeSet: ChangeSet
): Promise<Finding[]> {
  // Run all analyzers concurrently
  const findingsArrays = await Promise.all(
    analyzers.map(analyzer => analyzer.analyze(changeSet))
  );

  // Flatten results into single array
  return findingsArrays.flat();
}
