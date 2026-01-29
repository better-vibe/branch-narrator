/**
 * Playwright configuration change detector.
 *
 * Detects changes to Playwright configuration files and identifies
 * potentially breaking configuration changes.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  PlaywrightConfigFinding,
  Confidence,
} from "../core/types.js";

// Playwright config file patterns
const PLAYWRIGHT_CONFIG_PATTERNS = [
  /^playwright\.config\.(ts|js|mjs|cjs)$/,
  /^playwright\.ct\.config\.(ts|js)$/, // Component testing
];

/**
 * Check if a file is a Playwright config file.
 */
export function isPlaywrightConfig(path: string): boolean {
  return PLAYWRIGHT_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

// Critical config sections
const CRITICAL_SECTIONS = [
  "projects",
  "use",
  "webServer",
  "testDir",
  "testMatch",
  "timeout",
  "retries",
  "workers",
  "reporter",
  "expect",
  "fullyParallel",
  "baseURL",
  "globalSetup",
  "globalTeardown",
];

// Breaking change patterns
const BREAKING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /projects\s*[:=\[]/, reason: "Test projects configuration changed" },
  { pattern: /webServer\s*[:=\{]/, reason: "Web server configuration changed" },
  { pattern: /testDir\s*[:=]/, reason: "Test directory changed" },
  { pattern: /baseURL\s*[:=]/, reason: "Base URL changed" },
  { pattern: /globalSetup\s*[:=]/, reason: "Global setup changed" },
  { pattern: /globalTeardown\s*[:=]/, reason: "Global teardown changed" },
];

/**
 * Extract affected sections from diff content.
 */
function extractAffectedSections(content: string[]): string[] {
  const fullContent = content.join("\n");
  const affected: string[] = [];

  for (const section of CRITICAL_SECTIONS) {
    const pattern = new RegExp(`["']?${section}["']?\\s*[:{[=]`, "i");
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
  _additions: string[],
  deletions: string[]
): string[] {
  const reasons: string[] = [];
  const deletedContent = deletions.join("\n");

  for (const { pattern, reason } of BREAKING_PATTERNS) {
    if (pattern.test(deletedContent)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

/**
 * Check if the project uses Playwright based on package.json dependencies.
 */
function hasPlaywrightDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(
    deps?.["@playwright/test"] || devDeps?.["@playwright/test"] ||
    deps?.["playwright"] || devDeps?.["playwright"] ||
    deps?.["@playwright/experimental-ct-react"] || devDeps?.["@playwright/experimental-ct-react"] ||
    deps?.["@playwright/experimental-ct-vue"] || devDeps?.["@playwright/experimental-ct-vue"] ||
    deps?.["@playwright/experimental-ct-svelte"] || devDeps?.["@playwright/experimental-ct-svelte"]
  );
}

/**
 * Check if any Playwright config files are in the changeset.
 */
function hasPlaywrightFiles(changeSet: ChangeSet): boolean {
  return changeSet.diffs.some((d) => isPlaywrightConfig(d.path));
}

export const playwrightAnalyzer: Analyzer = {
  name: "playwright",
  cache: {
    includeGlobs: ["playwright.config.*", "playwright.ct.config.*"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Playwright and no Playwright files changed
    if (!hasPlaywrightDependency(changeSet) && !hasPlaywrightFiles(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isPlaywrightConfig(diff.path)) {
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

      const finding: PlaywrightConfigFinding = {
        type: "playwright-config",
        kind: "playwright-config",
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
