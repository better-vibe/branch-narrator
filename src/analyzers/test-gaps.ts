/**
 * Test gap analyzer - detects when prod code changes without test changes.
 */

import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TestGapFinding,
} from "../core/types.js";

/**
 * Check if a file is a test file.
 */
function isTestFile(path: string): boolean {
  return (
    path.includes("/tests/") ||
    path.includes("/__tests__/") ||
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.startsWith("tests/")
  );
}

/**
 * Check if a file is a documentation file.
 */
function isDocFile(path: string): boolean {
  return path.endsWith(".md") || path.startsWith("docs/");
}

/**
 * Check if a file is a config/meta file.
 */
function isConfigFile(path: string): boolean {
  const filename = path.split("/").pop() || "";
  return (
    // Package manager files
    filename === "package.json" ||
    filename === "package-lock.json" ||
    filename === "yarn.lock" ||
    filename === "pnpm-lock.yaml" ||
    filename === "bun.lockb" ||
    // Config files in root
    filename.endsWith(".config.js") ||
    filename.endsWith(".config.ts") ||
    filename.endsWith(".config.mjs") ||
    filename.endsWith(".config.cjs") ||
    // TOML configs
    filename.endsWith(".toml") ||
    // Dotfiles in root (but not directories like .github)
    (path.split("/").length === 1 && filename.startsWith("."))
  );
}

/**
 * Analyze test coverage gaps.
 */
export const analyzeTestGaps: Analyzer = {
  name: "test-gaps",
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: TestGapFinding[] = [];

    let prodFilesChanged = 0;
    let testFilesChanged = 0;
    const prodFiles: string[] = [];

    for (const file of changeSet.files) {
      // Skip docs and config
      if (isDocFile(file.path) || isConfigFile(file.path)) {
        continue;
      }

      if (isTestFile(file.path)) {
        testFilesChanged++;
      } else {
        prodFilesChanged++;
        prodFiles.push(file.path);
      }
    }

    // Flag if production code changed significantly without tests
    if (prodFilesChanged >= 3 && testFilesChanged === 0) {
      // Create evidence showing the prod files that changed without tests
      // Use first file as the "main" evidence with the summary, rest as supporting
      const evidence = prodFiles.slice(0, 5).map((file, index) =>
        createEvidence(
          file,
          index === 0
            ? `${prodFilesChanged} production file(s) changed with no test updates`
            : "No corresponding test changes"
        )
      );

      findings.push({
        type: "test-gap",
        kind: "test-gap",
        category: "quality",
        confidence: "medium",
        evidence,
        prodFilesChanged,
        testFilesChanged,
      });
    }

    return findings;
  },
};
