/**
 * Utility for running analyzers efficiently.
 *
 * Analyzers are pure functions that operate on the same ChangeSet independently,
 * making them ideal candidates for parallel execution.
 */

import type { Analyzer, ChangeSet, DiffMode, Finding, ProfileName } from "./types.js";
import { getCache, computeHash } from "../cache/index.js";

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
 * Run analyzers with incremental caching support.
 *
 * This function attempts to reuse cached per-analyzer results when possible,
 * only re-running analyzers that have been affected by file changes.
 *
 * Cache reuse strategy:
 * - Analyzers with cacheScope='files' are cached based on which files they process
 * - Analyzers with cacheScope='global' (or unset) always rerun when changeset differs
 * - Cache keys use ref names (not SHAs) to enable reuse across git state changes
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
    profile,
    mode,
    noCache = false,
    cwd = process.cwd(),
  } = options;

  const cache = noCache ? null : getCache(cwd);

  // If cache disabled, fall back to parallel execution
  if (!cache?.enabled) {
    return runAnalyzersInParallel(analyzers, changeSet);
  }

  const changedFilePaths = changeSet.files.map(f => f.path);
  const changedFilesSet = new Set(changedFilePaths);

  // Run each analyzer, using cache when possible
  const findingsArrays = await Promise.all(
    analyzers.map(async (analyzer) => {
      // Determine which files this analyzer cares about
      const relevantFiles = getRelevantFiles(analyzer, changedFilePaths);
      const filesHash = computeHash(relevantFiles.sort());

      // Build cache key using stable refs (not SHAs)
      const cacheKeyHash = cache.buildPerAnalyzerCacheKey({
        analyzerName: analyzer.name,
        profile,
        mode,
        baseRef: changeSet.base,
        headRef: changeSet.head,
        filesHash,
      });

      // Check per-analyzer cache
      const cached = await cache.getPerAnalyzerFindings(cacheKeyHash);

      if (cached) {
        // For file-scoped analyzers, check if any processed files changed
        if (analyzer.cacheScope === "files") {
          const needsRerun = cached.processedFiles.some(f => changedFilesSet.has(f));
          if (!needsRerun) {
            // No relevant files changed - reuse cached findings
            return cached.findings;
          }
        } else {
          // Global analyzers: if filesHash matches, the changeset is identical
          // for this analyzer's perspective - reuse cache
          return cached.findings;
        }
      }

      // Cache miss or files changed - run analyzer
      const findings = await analyzer.analyze(changeSet);

      // Store per-analyzer results
      const processedFiles = extractProcessedFiles(findings, analyzer, changedFilePaths);
      const cacheKey = cache.buildPerAnalyzerCacheKeyObject({
        analyzerName: analyzer.name,
        profile,
        mode,
        baseRef: changeSet.base,
        headRef: changeSet.head,
        filesHash,
      });
      await cache.setPerAnalyzerFindings(cacheKey, findings, processedFiles);

      return findings;
    })
  );

  return findingsArrays.flat();
}

/**
 * Get the files relevant to an analyzer based on its configuration.
 */
function getRelevantFiles(analyzer: Analyzer, allFiles: string[]): string[] {
  // If analyzer specifies file patterns, filter to matching files
  if (analyzer.filePatterns && analyzer.filePatterns.length > 0) {
    return allFiles.filter(file => matchesPatterns(file, analyzer.filePatterns!));
  }
  
  // Default: all files are relevant
  return allFiles;
}

/**
 * Simple pattern matching for file paths.
 * Supports: extension patterns, directory patterns, recursive patterns, exact matches
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchPattern(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Match a single pattern against a file path.
 */
function matchPattern(filePath: string, pattern: string): boolean {
  // Exact match
  if (pattern === filePath) {
    return true;
  }

  // Handle **/ prefix (match anywhere)
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    if (filePath.endsWith(suffix) || filePath.includes("/" + suffix)) {
      return true;
    }
    // Also try matching just the filename
    const fileName = filePath.split("/").pop() || "";
    if (matchPattern(fileName, suffix)) {
      return true;
    }
  }

  // Handle *.ext patterns
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1); // Get ".ext"
    return filePath.endsWith(ext);
  }

  // Handle path/* patterns
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return filePath.startsWith(prefix + "/") && !filePath.slice(prefix.length + 1).includes("/");
  }

  // Handle path/** patterns (recursive)
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return filePath.startsWith(prefix + "/");
  }

  return false;
}

/**
 * Extract file paths from findings for caching.
 * If the analyzer specifies file patterns, also includes files matching those patterns.
 */
function extractProcessedFiles(
  findings: Finding[],
  analyzer: Analyzer,
  changedFilePaths: string[]
): string[] {
  const files = new Set<string>();

  // If analyzer has file patterns, include matching files
  if (analyzer.filePatterns && analyzer.filePatterns.length > 0) {
    for (const filePath of changedFilePaths) {
      if (matchesPatterns(filePath, analyzer.filePatterns)) {
        files.add(filePath);
      }
    }
  }

  // Extract files from findings
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
