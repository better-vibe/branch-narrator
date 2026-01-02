/**
 * Test Parity Analyzer.
 * Checks if modified source files have corresponding test files.
 */

import fs from "node:fs";
import path from "node:path";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  ConventionViolationFinding,
  Finding,
} from "../core/types.js";
import { isTestFile } from "./vitest.js";

// Files to exclude from parity check
const EXCLUDED_PATTERNS = [
  /\.d\.ts$/, // Type definitions
  /\.config\.ts$/, // Config files
  /index\.ts$/, // Barrel files (often don't need direct tests if they just export)
  /^docs\//, // Documentation
  /^tests\//, // Tests themselves
  /^scripts\//, // Build scripts
  /^dist\//, // Build artifacts
];

/**
 * Check if a file should be checked for test parity.
 */
function shouldCheckParity(filePath: string): boolean {
  if (isTestFile(filePath)) return false;
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) return false;
  // Only check typescript/javascript source files
  return /\.(ts|js|tsx|jsx|mts|mjs)$/.test(filePath);
}

/**
 * Find potential test files for a source file.
 * Strategy:
 * 1. src/foo.ts -> tests/foo.test.ts
 * 2. src/foo.ts -> tests/src/foo.test.ts (if tests mirrors src)
 * 3. src/foo.ts -> src/foo.test.ts (colocation)
 * 4. src/lib/foo.ts -> tests/lib/foo.test.ts
 */
function findTestFile(sourcePath: string): string | null {
  const ext = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, ext);
  const dirName = path.dirname(sourcePath);

  // Common test extensions
  const testExts = [".test.ts", ".spec.ts", ".test.js", ".spec.js"];

  // 1. Colocation: src/foo.test.ts
  for (const testExt of testExts) {
    const colocated = path.join(dirName, `${baseName}${testExt}`);
    if (fs.existsSync(colocated)) return colocated;
  }

  // 2. tests/ directory mapping
  // If file is in src/, map to tests/
  let relativePath = sourcePath;
  if (sourcePath.startsWith("src/")) {
    relativePath = sourcePath.slice(4); // remove src/
  } else {
    // If not in src, treat the whole path as relative to root for tests/ mapping
    // e.g. lib/foo.ts -> tests/lib/foo.test.ts
  }

  // Try mapping to tests/ folder
  // Option A: tests/{relativePath}.test.ts (flat or mirrored)
  // Option B: tests/{filename}.test.ts (flat)

  for (const testExt of testExts) {
    // Mirror: src/utils/math.ts -> tests/utils/math.test.ts
    const mirrored = path.join("tests", path.dirname(relativePath), `${baseName}${testExt}`);
    if (fs.existsSync(mirrored)) return mirrored;

    // Flat: src/utils/math.ts -> tests/math.test.ts (less common but possible for small projects)
    const flat = path.join("tests", `${baseName}${testExt}`);
    if (fs.existsSync(flat)) return flat;

    // Mirror with src: src/utils/math.ts -> tests/src/utils/math.test.ts
    const mirrorSrc = path.join("tests", dirName, `${baseName}${testExt}`);
    if (fs.existsSync(mirrorSrc)) return mirrorSrc;
  }

  return null;
}

export const testParityAnalyzer: Analyzer = {
  name: "test-parity",

  analyze(changeSet: ChangeSet): Finding[] {
    const violations: string[] = [];
    const evidenceList = [];

    // Analyze modified or added files
    for (const file of changeSet.files) {
      if (file.status === "deleted") continue;

      if (!shouldCheckParity(file.path)) continue;

      const testFile = findTestFile(file.path);

      // If no existing test file found, check if a NEW test file is in the changeset
      // This handles the case where I add a new feature AND its test in the same PR
      if (!testFile) {
        // Heuristic: Is there any file in the changeset that looks like a test for this?
        const baseName = path.basename(file.path, path.extname(file.path));
        const hasNewTest = changeSet.files.some(f =>
          isTestFile(f.path) && f.path.includes(baseName)
        );

        if (!hasNewTest) {
          violations.push(file.path);
          evidenceList.push(
            createEvidence(file.path, `Source file modified without corresponding test: ${file.path}`)
          );
        }
      }
    }

    if (violations.length === 0) {
      return [];
    }

    const finding: ConventionViolationFinding = {
      type: "convention-violation",
      kind: "convention-violation",
      category: "tests",
      confidence: "high",
      evidence: evidenceList,
      message: `Found ${violations.length} source file(s) without corresponding tests.`,
      files: violations,
    };

    return [finding];
  },
};
