/**
 * Test coverage detectors.
 */

import type { RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Check if a file is a test file.
 */
function isTestFile(path: string): boolean {
  return (
    path.includes("/test/") ||
    path.includes("/tests/") ||
    path.includes("/__tests__/") ||
    path.includes(".spec.") ||
    path.includes(".test.")
  );
}

/**
 * Check if a file is likely production code.
 */
function isProductionCode(path: string): boolean {
  // Common production code directories
  const prodPatterns = ["src/", "lib/", "app/", "components/", "routes/"];
  const hasPattern = prodPatterns.some(pattern => path.includes(pattern));
  
  // Exclude config, docs, etc.
  const excludePatterns = [
    "README",
    "LICENSE",
    ".md",
    ".txt",
    "docs/",
    "config/",
    "package.json",
    "tsconfig.json",
    ".gitignore",
  ];
  const isExcluded = excludePatterns.some(pattern => path.includes(pattern));
  
  return hasPattern && !isExcluded && !isTestFile(path);
}

/**
 * Detect test files changed.
 */
export const detectTestsChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const testFiles = changeSet.files.filter(f => isTestFile(f.path));

  if (testFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = testFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "tests.changed",
      category: "tests",
      score: 5,
      confidence: 0.9,
      title: "Test files changed",
      summary: `${testFiles.length} test ${testFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Run test suite to verify changes",
      ],
      effectiveScore: Math.round(5 * 0.9),
    });
  }

  return flags;
};

/**
 * Detect possible test gap (code changed but no tests).
 */
export const detectPossibleTestGap: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  
  const codeFiles = changeSet.files.filter(f => isProductionCode(f.path));
  const testFiles = changeSet.files.filter(f => isTestFile(f.path));

  if (codeFiles.length > 0 && testFiles.length === 0) {
    const evidence: RiskFlagEvidence[] = codeFiles.slice(0, 5).map(f => ({
      file: f.path,
      lines: [`Code file ${f.status}, but no test files changed`],
    }));

    flags.push({
      id: "tests.possible_gap",
      category: "tests",
      score: 15,
      confidence: 0.6,
      title: "Possible test coverage gap",
      summary: `${codeFiles.length} code ${codeFiles.length === 1 ? "file" : "files"} changed but no test files updated`,
      evidence,
      suggestedChecks: [
        "Consider adding tests for new/changed code",
        "Verify existing tests cover the changes",
        "Check code coverage metrics",
      ],
      effectiveScore: Math.round(15 * 0.6),
    });
  }

  return flags;
};
