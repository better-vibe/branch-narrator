/**
 * Test Parity Analyzer.
 * Checks if modified source files have corresponding test files.
 */

import path from "node:path";
import { execa } from "execa";
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

// Cache for file list
let cachedFileList: Set<string> | null = null;

export function _resetCacheForTesting() {
  cachedFileList = null;
}

/**
 * Get all files in the project using git ls-files.
 * Returns a Set for O(1) lookups.
 */
async function getAllFiles(): Promise<Set<string>> {
  if (cachedFileList) return cachedFileList;
  try {
    const { stdout } = await execa("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { reject: false });
    cachedFileList = new Set(stdout.split("\n").filter(Boolean));
    return cachedFileList;
  } catch (error) {
    console.warn("Failed to retrieve files via git, defaulting to empty set:", error);
    return new Set();
  }
}

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
 * Find potential test files for a source file using cached file list.
 */
async function findTestFile(sourcePath: string): Promise<string | null> {
  const allFiles = await getAllFiles();

  const ext = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, ext);
  const dirName = path.dirname(sourcePath);

  // Common test extensions
  const testExts = [".test.ts", ".spec.ts", ".test.js", ".spec.js"];

  // 1. Colocation: src/foo.test.ts
  for (const testExt of testExts) {
    const colocated = path.join(dirName, `${baseName}${testExt}`);
    if (allFiles.has(colocated)) return colocated;
  }

  // 2. tests/ directory mapping
  let relativePath = sourcePath;
  if (sourcePath.startsWith("src/")) {
    relativePath = sourcePath.slice(4); // remove src/
  }

  for (const testExt of testExts) {
    // Mirror: src/utils/math.ts -> tests/utils/math.test.ts
    const mirrored = path.join("tests", path.dirname(relativePath), `${baseName}${testExt}`);
    if (allFiles.has(mirrored)) return mirrored;

    // Flat: src/utils/math.ts -> tests/math.test.ts
    const flat = path.join("tests", `${baseName}${testExt}`);
    if (allFiles.has(flat)) return flat;

    // Mirror with src: src/utils/math.ts -> tests/src/utils/math.test.ts
    const mirrorSrc = path.join("tests", dirName, `${baseName}${testExt}`);
    if (allFiles.has(mirrorSrc)) return mirrorSrc;
  }

  // 3. Hyphenated: src/commands/facts/builder.ts -> tests/facts-builder.test.ts
  // This handles the common convention of combining parent directory with filename
  const pathParts = relativePath.split(path.sep);
  if (pathParts.length > 1) {
    // Try parent-basename pattern: commands/facts/builder -> facts-builder
    const parentDir = pathParts[pathParts.length - 2];
    const hyphenated = `${parentDir}-${baseName}`;
    for (const testExt of testExts) {
      const hyphenatedPath = path.join("tests", `${hyphenated}${testExt}`);
      if (allFiles.has(hyphenatedPath)) return hyphenatedPath;
    }
  }

  return null;
}

export const testParityAnalyzer: Analyzer = {
  name: "test-parity",

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const violations: string[] = [];
    const evidenceList = [];

    // Analyze modified or added files
    for (const file of changeSet.files) {
      if (file.status === "deleted") continue;

      if (!shouldCheckParity(file.path)) continue;

      const testFile = await findTestFile(file.path);

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
