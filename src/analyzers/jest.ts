/**
 * Jest configuration change detector.
 *
 * Detects changes to Jest configuration files and identifies
 * potentially breaking configuration changes.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  JestConfigFinding,
  Confidence,
} from "../core/types.js";

// Jest config file patterns
const JEST_CONFIG_PATTERNS = [
  /^jest\.config(\.[a-z0-9]+)?\.(ts|js|mjs|cjs|json)$/,
  /^jest\.setup(\.[a-z0-9]+)?\.(ts|js|mjs|cjs)$/,
];

/**
 * Check if a file is a Jest config file.
 */
export function isJestConfig(path: string): boolean {
  return JEST_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

// Critical config sections
const CRITICAL_SECTIONS = [
  "transform",
  "moduleNameMapper",
  "testEnvironment",
  "setupFiles",
  "setupFilesAfterFramework",
  "globals",
  "preset",
  "testMatch",
  "testPathIgnorePatterns",
  "moduleFileExtensions",
  "collectCoverageFrom",
  "coverageThreshold",
];

// Breaking change patterns
const BREAKING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /testEnvironment/, reason: "Test environment changed" },
  { pattern: /transform\b/, reason: "Transform configuration changed" },
  { pattern: /moduleNameMapper/, reason: "Module name mappings changed" },
  { pattern: /preset/, reason: "Jest preset changed" },
  { pattern: /globals\b/, reason: "Global configuration changed" },
  { pattern: /testMatch/, reason: "Test match patterns changed" },
];

/**
 * Extract affected sections from diff content.
 */
function extractAffectedSections(content: string[]): string[] {
  const fullContent = content.join("\n");
  const affected: string[] = [];

  for (const section of CRITICAL_SECTIONS) {
    const pattern = new RegExp(`["']?${section}["']?\\s*[:{[]`, "i");
    if (pattern.test(fullContent)) {
      affected.push(section);
    }
  }

  return affected;
}

/**
 * Detect breaking changes.
 */
function detectBreakingChanges(
  additions: string[],
  deletions: string[]
): string[] {
  const reasons: string[] = [];
  const allContent = [...additions, ...deletions].join("\n");

  for (const { pattern, reason } of BREAKING_PATTERNS) {
    if (pattern.test(allContent)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

export const jestAnalyzer: Analyzer = {
  name: "jest",
  cache: {
    includeGlobs: ["jest.config.*", "jest.setup.*"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isJestConfig(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);
      const allLines = [...additions, ...deletions];

      const affectedSections = extractAffectedSections(allLines);
      const breakingReasons = detectBreakingChanges(additions, deletions);
      const isBreaking = breakingReasons.length > 0;

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const confidence: Confidence = isBreaking ? "high" : "medium";

      const finding: JestConfigFinding = {
        type: "jest-config",
        kind: "jest-config",
        category: "tests",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        affectedSections,
        isBreaking,
        breakingReasons,
      };

      findings.push(finding);
    }

    return findings;
  },
};
