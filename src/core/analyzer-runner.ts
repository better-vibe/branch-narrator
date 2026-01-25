/**
 * Utility for running analyzers efficiently.
 *
 * Analyzers are pure functions that operate on the same ChangeSet independently,
 * making them ideal candidates for parallel execution.
 */

import type { Analyzer, ChangeSet, DiffMode, Finding, ProfileName } from "./types.js";
import { getCache, type AnalysisCacheKey } from "../cache/index.js";

/**
 * Options for running analyzers with caching.
 */
export interface CachedAnalysisOptions {
  /** The change set to analyze */
  changeSet: ChangeSet;
  /** Array of analyzers to run */
  analyzers: Analyzer[];
  /** Profile being used */
  profile: ProfileName;
  /** Diff mode used */
  mode: DiffMode;
  /** Skip cache (bypass and don't store) */
  noCache?: boolean;
  /** Working directory */
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

/**
 * Run analyzers with caching support.
 *
 * This function checks the cache for existing analysis results and returns
 * them if available. Otherwise, it runs all analyzers and caches the results.
 *
 * @param options - Options for cached analysis
 * @returns Promise resolving to findings array
 */
export async function runAnalyzersWithCache(
  options: CachedAnalysisOptions
): Promise<Finding[]> {
  const {
    changeSet,
    analyzers,
    profile,
    mode,
    noCache = false,
    cwd = process.cwd(),
  } = options;

  const cache = noCache ? null : getCache(cwd);

  // Try cache lookup
  if (cache?.enabled) {
    const changeSetHash = cache.computeChangeSetHash(changeSet);
    const cacheKeyHash = cache.buildAnalysisCacheKey({
      changeSetHash,
      profile,
      mode,
    });

    const cachedFindings = await cache.getFindings(cacheKeyHash);
    if (cachedFindings !== null) {
      return cachedFindings;
    }
  }

  // Cache miss - run analyzers
  const findings = await runAnalyzersInParallel(analyzers, changeSet);

  // Store in cache
  if (cache?.enabled) {
    const changeSetHash = cache.computeChangeSetHash(changeSet);
    const cacheKey: AnalysisCacheKey = cache.buildAnalysisCacheKeyObject({
      changeSetHash,
      profile,
      mode,
    });
    await cache.setFindings(cacheKey, findings);
  }

  return findings;
}

/**
 * Run analyzers with incremental caching support.
 *
 * This function attempts to reuse cached per-analyzer results when possible,
 * only re-running analyzers that have been affected by file changes.
 *
 * For analyzers without cached results or where affected files changed,
 * the analyzer is re-run and results are cached.
 *
 * @param options - Options for cached analysis
 * @returns Promise resolving to findings array
 */
export async function runAnalyzersIncremental(
  options: CachedAnalysisOptions
): Promise<Finding[]> {
  const {
    changeSet,
    analyzers,
    noCache = false,
    cwd = process.cwd(),
  } = options;

  const cache = noCache ? null : getCache(cwd);

  // If cache disabled, fall back to parallel execution
  if (!cache?.enabled) {
    return runAnalyzersInParallel(analyzers, changeSet);
  }

  const changeSetHash = cache.computeChangeSetHash(changeSet);
  const changedFiles = new Set(changeSet.files.map(f => f.path));

  // Run each analyzer, using cache when possible
  const findingsArrays = await Promise.all(
    analyzers.map(async (analyzer) => {
      const cacheKeyHash = cache.buildPerAnalyzerCacheKey(
        analyzer.name,
        changeSetHash
      );

      // Check per-analyzer cache
      const cached = await cache.getPerAnalyzerFindings(cacheKeyHash);

      if (cached) {
        // Check if any processed files have changed
        const needsRerun = cached.processedFiles.some(f => changedFiles.has(f));

        if (!needsRerun) {
          // Use cached findings
          return cached.findings;
        }
      }

      // Cache miss or files changed - run analyzer
      const findings = await analyzer.analyze(changeSet);

      // Store per-analyzer results
      const processedFiles = extractProcessedFiles(findings);
      await cache.setPerAnalyzerFindings(
        {
          analyzerName: analyzer.name,
          changeSetHash,
          versionSignature: cache.getVersionSignature(),
        },
        findings,
        processedFiles
      );

      return findings;
    })
  );

  return findingsArrays.flat();
}

/**
 * Extract file paths from findings for caching.
 */
function extractProcessedFiles(findings: Finding[]): string[] {
  const files = new Set<string>();

  for (const finding of findings) {
    // Extract files from evidence
    if (finding.evidence) {
      for (const ev of finding.evidence) {
        if (ev.file) {
          files.add(ev.file);
        }
      }
    }

    // Extract files from finding-specific properties using type guards
    const f = finding as unknown as Record<string, unknown>;

    if ("files" in f && Array.isArray(f.files)) {
      for (const file of f.files) {
        if (typeof file === "string") {
          files.add(file);
        } else if (file && typeof file === "object" && "path" in file) {
          const pathValue = (file as { path: unknown }).path;
          if (typeof pathValue === "string") {
            files.add(pathValue);
          }
        }
      }
    }

    if ("file" in f && typeof f.file === "string") {
      files.add(f.file);
    }

    if ("path" in f && typeof f.path === "string") {
      files.add(f.path);
    }
  }

  return Array.from(files).sort();
}
