/**
 * Vitest test change detector.
 */

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

export const vitestAnalyzer: Analyzer = {
  name: "vitest",

  analyze(changeSet: ChangeSet): Finding[] {
    const testFiles: string[] = [];

    // Collect test files
    for (const file of changeSet.files) {
      if (isTestFile(file.path) || isVitestConfig(file.path)) {
        testFiles.push(file.path);
      }
    }

    // Only emit if there are test changes
    if (testFiles.length === 0) {
      return [];
    }

    const finding: TestChangeFinding = {
      type: "test-change",
      framework: "vitest",
      files: testFiles,
    };

    return [finding];
  },
};

