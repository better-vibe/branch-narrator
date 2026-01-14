/**
 * Test Parity Analyzer.
 * Checks if modified source files have corresponding test files.
 *
 * This analyzer is opt-in only - it must be explicitly enabled via CLI flag
 * as it requires git file system operations which can be resource-intensive.
 */

import path from "node:path";
import { execa as execaDefault } from "execa";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Confidence,
  Finding,
  TestParityConfig,
  TestParityViolationFinding,
} from "../core/types.js";
import { isTestFile } from "./vitest.js";

// ============================================================================
// Default Configuration
// ============================================================================

/** Default patterns for files to exclude from parity check */
const DEFAULT_EXCLUDED_PATTERNS: RegExp[] = [
  /\.d\.ts$/, // Type definitions
  /\.config\.(ts|js|mts|mjs|cjs)$/, // Config files
  /index\.(ts|js|tsx|jsx)$/, // Barrel files (often don't need direct tests)
  /^docs\//, // Documentation
  /^tests\//, // Tests themselves
  /^test\//, // Alternative test directory
  /^__tests__\//, // Jest-style test directory
  /^scripts\//, // Build scripts
  /^dist\//, // Build artifacts
  /^build\//, // Build artifacts
  /^\./, // Dotfiles and directories
  /types?\.(ts|js)$/, // Type-only files
  /constants?\.(ts|js)$/, // Constants files (often just exports)
];

/** Default test file extensions to search for */
const DEFAULT_TEST_PATTERNS = [".test.ts", ".spec.ts", ".test.js", ".spec.js", ".test.tsx", ".spec.tsx"];

/** Default test directories */
const DEFAULT_TEST_DIRECTORIES = ["tests", "test", "__tests__", "spec"];

/** Default source directories */
const DEFAULT_SOURCE_DIRECTORIES = ["src", "lib", "app"];

// ============================================================================
// Cache Management
// ============================================================================

/** Cache for files per directory (more granular than entire repo) */
const directoryFileCache = new Map<string, Set<string>>();

/** Full file list cache (fallback) */
let cachedFullFileList: Set<string> | null = null;

/**
 * Reset all caches - for testing purposes.
 */
export function _resetCacheForTesting(): void {
  directoryFileCache.clear();
  cachedFullFileList = null;
}

// ============================================================================
// File Discovery (Optimized)
// ============================================================================

/**
 * Get files in specific directories using git ls-files.
 * More efficient than loading entire repo for targeted lookups.
 */
async function getFilesInDirectories(
  directories: string[],
  exec: typeof execaDefault
): Promise<Set<string>> {
  // Check cache first
  const cachedResults = new Set<string>();
  const uncachedDirs: string[] = [];

  for (const dir of directories) {
    const cached = directoryFileCache.get(dir);
    if (cached) {
      for (const file of cached) {
        cachedResults.add(file);
      }
    } else {
      uncachedDirs.push(dir);
    }
  }

  // If all directories are cached, return combined results
  if (uncachedDirs.length === 0) {
    return cachedResults;
  }

  try {
    // Query git for uncached directories
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...uncachedDirs],
      { reject: false }
    );

    const files = stdout.split("\n").filter(Boolean);

    // Cache per directory
    for (const dir of uncachedDirs) {
      const dirFiles = new Set<string>();
      for (const file of files) {
        if (file.startsWith(dir + "/") || file.startsWith(dir + path.sep)) {
          dirFiles.add(file);
          cachedResults.add(file);
        }
      }
      directoryFileCache.set(dir, dirFiles);
    }

    // Also add root-level files if querying root
    for (const file of files) {
      if (!file.includes("/") && !file.includes(path.sep)) {
        cachedResults.add(file);
      }
    }

    return cachedResults;
  } catch {
    // Fallback to full file list if targeted query fails
    return getAllFiles(exec);
  }
}

/**
 * Get all files in the project using git ls-files.
 * Returns a Set for O(1) lookups.
 * This is the fallback when targeted queries aren't possible.
 */
async function getAllFiles(exec: typeof execaDefault): Promise<Set<string>> {
  if (cachedFullFileList) return cachedFullFileList;

  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { reject: false }
    );
    cachedFullFileList = new Set(stdout.split("\n").filter(Boolean));
    return cachedFullFileList;
  } catch {
    return new Set();
  }
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/**
 * Merge user config with defaults.
 */
function mergeConfig(config?: TestParityConfig): Required<Omit<TestParityConfig, "excludePatterns">> & { excludePatterns: RegExp[] } {
  return {
    testPatterns: config?.testPatterns ?? DEFAULT_TEST_PATTERNS,
    excludePatterns: [...DEFAULT_EXCLUDED_PATTERNS, ...(config?.excludePatterns ?? [])],
    testDirectories: config?.testDirectories ?? DEFAULT_TEST_DIRECTORIES,
    sourceDirectories: config?.sourceDirectories ?? DEFAULT_SOURCE_DIRECTORIES,
  };
}

/**
 * Check if a file should be checked for test parity.
 */
function shouldCheckParity(filePath: string, excludePatterns: RegExp[]): boolean {
  if (isTestFile(filePath)) return false;
  if (excludePatterns.some((p) => p.test(filePath))) return false;
  // Only check typescript/javascript source files
  return /\.(ts|js|tsx|jsx|mts|mjs)$/.test(filePath);
}

/**
 * Compute confidence based on file characteristics.
 */
function computeConfidence(filePath: string, diff?: { additions: number; deletions: number }): Confidence {
  // Lower confidence for utility/helper files
  if (/utils?|helpers?|lib|shared/i.test(filePath)) {
    return "medium";
  }

  // Lower confidence for small files (if we have diff info)
  if (diff && diff.additions + diff.deletions < 10) {
    return "low";
  }

  // Higher confidence for core business logic
  if (/services?|controllers?|handlers?|api|routes|commands?|analyzers?/i.test(filePath)) {
    return "high";
  }

  // Default to medium for most cases
  return "medium";
}

/**
 * Generate all potential test file locations for a source file.
 */
function generateTestLocations(
  sourcePath: string,
  testPatterns: string[],
  testDirectories: string[],
  sourceDirectories: string[]
): string[] {
  const locations: string[] = [];
  const ext = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, ext);
  const dirName = path.dirname(sourcePath);

  // 1. Colocation: src/foo.ts -> src/foo.test.ts
  for (const testExt of testPatterns) {
    locations.push(path.join(dirName, `${baseName}${testExt}`));
  }

  // 2. Test directory mappings
  let relativePath = sourcePath;
  for (const srcDir of sourceDirectories) {
    if (sourcePath.startsWith(`${srcDir}/`)) {
      relativePath = sourcePath.slice(srcDir.length + 1);
      break;
    }
  }

  for (const testDir of testDirectories) {
    for (const testExt of testPatterns) {
      // Mirror: src/utils/math.ts -> tests/utils/math.test.ts
      locations.push(path.join(testDir, path.dirname(relativePath), `${baseName}${testExt}`));

      // Flat: src/utils/math.ts -> tests/math.test.ts
      locations.push(path.join(testDir, `${baseName}${testExt}`));

      // Mirror with source dir: src/utils/math.ts -> tests/src/utils/math.test.ts
      locations.push(path.join(testDir, dirName, `${baseName}${testExt}`));
    }
  }

  // 3. Hyphenated patterns: various naming conventions
  const pathParts = relativePath.split(path.sep);
  if (pathParts.length > 1) {
    const parentDir = pathParts[pathParts.length - 2];
    // Pattern A: parent-basename (e.g., src/commands/facts/builder.ts -> tests/facts-builder.test.ts)
    const hyphenatedA = `${parentDir}-${baseName}`;
    // Pattern B: basename-parent (e.g., src/render/markdown.ts -> tests/markdown-render.test.ts)
    const hyphenatedB = `${baseName}-${parentDir}`;
    
    for (const testDir of testDirectories) {
      for (const testExt of testPatterns) {
        locations.push(path.join(testDir, `${hyphenatedA}${testExt}`));
        locations.push(path.join(testDir, `${hyphenatedB}${testExt}`));
      }
    }
  }

  // Deduplicate and normalize
  return [...new Set(locations.map((loc) => path.normalize(loc)))];
}

/**
 * Find an existing test file for a source file.
 */
async function findTestFile(
  sourcePath: string,
  testPatterns: string[],
  testDirectories: string[],
  sourceDirectories: string[],
  allFiles: Set<string>
): Promise<string | null> {
  const locations = generateTestLocations(sourcePath, testPatterns, testDirectories, sourceDirectories);

  for (const location of locations) {
    if (allFiles.has(location)) {
      return location;
    }
  }

  return null;
}

/**
 * Check if a test file for the source is being added in the current changeset.
 */
function hasNewTestInChangeset(sourcePath: string, changeSet: ChangeSet): boolean {
  const baseName = path.basename(sourcePath, path.extname(sourcePath));

  return changeSet.files.some(
    (f) => isTestFile(f.path) && f.path.includes(baseName) && f.status !== "deleted"
  );
}

// ============================================================================
// Analyzer Factory
// ============================================================================

/**
 * Create a test parity analyzer with optional configuration.
 */
export function createTestParityAnalyzer(
  config?: TestParityConfig,
  options?: { exec?: typeof execaDefault }
): Analyzer {
  const mergedConfig = mergeConfig(config);
  const exec = options?.exec ?? execaDefault;

  return {
    name: "test-parity",

    async analyze(changeSet: ChangeSet): Promise<Finding[]> {
      const findings: TestParityViolationFinding[] = [];

      // Collect directories we need to check
      const dirsToCheck = new Set<string>();
      for (const file of changeSet.files) {
        if (file.status === "deleted") continue;
        if (!shouldCheckParity(file.path, mergedConfig.excludePatterns)) continue;

        // Add source directory
        const dirName = path.dirname(file.path);
        if (dirName && dirName !== ".") {
          dirsToCheck.add(dirName.split(path.sep)[0]); // Top-level dir
        }
      }

      // Add test directories to check
      for (const testDir of mergedConfig.testDirectories) {
        dirsToCheck.add(testDir);
      }

      // Get files from relevant directories only (optimized)
      const allFiles = await getFilesInDirectories([...dirsToCheck], exec);

      // Also ensure we have changeset files in our set (they may not be committed yet)
      for (const file of changeSet.files) {
        if (file.status !== "deleted") {
          allFiles.add(file.path);
        }
      }

      // Analyze each file
      for (const file of changeSet.files) {
        if (file.status === "deleted") continue;
        if (!shouldCheckParity(file.path, mergedConfig.excludePatterns)) continue;

        // Check for existing test file
        const testFile = await findTestFile(
          file.path,
          mergedConfig.testPatterns,
          mergedConfig.testDirectories,
          mergedConfig.sourceDirectories,
          allFiles
        );

        if (testFile) {
          // Test exists, no violation
          continue;
        }

        // Check if a new test is being added in the changeset
        if (hasNewTestInChangeset(file.path, changeSet)) {
          continue;
        }

        // Get diff info for confidence scoring
        const fileDiff = changeSet.diffs.find((d) => d.path === file.path);
        const diffInfo = fileDiff
          ? {
              additions: fileDiff.hunks.reduce((sum, h) => sum + h.additions.length, 0),
              deletions: fileDiff.hunks.reduce((sum, h) => sum + h.deletions.length, 0),
            }
          : undefined;

        const confidence = computeConfidence(file.path, diffInfo);
        const expectedLocations = generateTestLocations(
          file.path,
          mergedConfig.testPatterns,
          mergedConfig.testDirectories,
          mergedConfig.sourceDirectories
        ).slice(0, 5); // Limit to top 5 for readability

        const finding: TestParityViolationFinding = {
          type: "test-parity-violation",
          kind: "test-parity-violation",
          category: "tests",
          confidence,
          evidence: [
            createEvidence(file.path, `Source file modified without corresponding test: ${file.path}`),
          ],
          sourceFile: file.path,
          expectedTestLocations: expectedLocations,
        };

        findings.push(finding);
      }

      return findings;
    },
  };
}

/**
 * Default test parity analyzer instance (with default config).
 * Note: This analyzer is NOT included in any profile by default.
 * It must be explicitly enabled via CLI flags.
 */
export const testParityAnalyzer: Analyzer = createTestParityAnalyzer();
