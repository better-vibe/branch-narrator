/**
 * Vitest test change detector.
 */

import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TestChangeFinding,
} from "../core/types.js";

// Test file patterns
const TEST_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.test\.js$/,
  /\.spec\.js$/,
  /^tests?\//,
];

// Vitest config patterns (matches vitest.config.ts, vitest.config.e2e.ts, etc.)
const VITEST_CONFIG_PATTERNS = [
  /^vitest\.config(\.[a-z0-9]+)?\.(ts|js|mts|mjs)$/,
  /^vite\.config(\.[a-z0-9]+)?\.(ts|js|mts|mjs)$/, // Vite config might include vitest
];

/**
 * Check if a file is a test file.
 */
export function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a vitest config.
 */
export function isVitestConfig(path: string): boolean {
  return VITEST_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if the project uses Vitest based on package.json dependencies.
 */
function hasVitestDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.["vitest"] || devDeps?.["vitest"]);
}

/**
 * Check if any vitest/test files are in the changeset.
 */
function hasVitestFiles(changeSet: ChangeSet): boolean {
  return (
    changeSet.files.some((f) => isTestFile(f.path) || isVitestConfig(f.path)) ||
    changeSet.diffs.some((d) => isTestFile(d.path) || isVitestConfig(d.path))
  );
}

export const vitestAnalyzer: Analyzer = {
  name: "vitest",
  cache: {
    includeGlobs: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "vitest.config.*"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Vitest and no test files changed
    if (!hasVitestDependency(changeSet) && !hasVitestFiles(changeSet)) {
      return [];
    }

    const testFiles: string[] = [];
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    // Collect test files by status
    for (const file of changeSet.files) {
      if (isTestFile(file.path) || isVitestConfig(file.path)) {
        testFiles.push(file.path);

        switch (file.status) {
          case "added":
            addedFiles.push(file.path);
            break;
          case "modified":
            modifiedFiles.push(file.path);
            break;
          case "deleted":
            deletedFiles.push(file.path);
            break;
          case "renamed":
            // Treat renamed as modified
            modifiedFiles.push(file.path);
            break;
        }
      }
    }

    // Only emit if there are test changes
    if (testFiles.length === 0) {
      return [];
    }

    // Create evidence from file list with status info
    const evidence = testFiles
      .slice(0, 3)
      .map((file) => {
        const status = addedFiles.includes(file)
          ? "added"
          : deletedFiles.includes(file)
            ? "deleted"
            : "modified";
        return createEvidence(file, `Test file ${status}: ${file}`);
      });

    const finding: TestChangeFinding = {
      type: "test-change",
      kind: "test-change",
      category: "tests",
      confidence: "high",
      evidence,
      framework: "vitest",
      files: testFiles,
      added: addedFiles,
      modified: modifiedFiles,
      deleted: deletedFiles,
    };

    return [finding];
  },
};

