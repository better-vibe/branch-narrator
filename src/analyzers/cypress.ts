/**
 * Cypress E2E test configuration and test file change detector.
 *
 * Detects changes to Cypress configuration, test files, fixtures, and custom commands
 * that could affect E2E test reliability or coverage.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  CypressConfigFinding,
  Confidence,
} from "../core/types.js";

// Cypress configuration file patterns
const CYPRESS_CONFIG_PATTERNS = [
  /^cypress\.config\.(ts|js|mjs|cjs)$/,
  /\/cypress\.config\.(ts|js|mjs|cjs)$/,
];

// Cypress test file patterns
const CYPRESS_TEST_PATTERNS = [
  /cypress\/e2e\/.*\.(ts|js)$/,
  /cypress\/integration\/.*\.(ts|js)$/,
  /\.cy\.[tj]sx?$/,
  /\.spec\.(ts|js)$/,
];

// Cypress fixture patterns
const CYPRESS_FIXTURE_PATTERNS = [
  /cypress\/fixtures\/.*\.(json|js|ts)$/,
];

// Cypress support/commands files
const CYPRESS_SUPPORT_PATTERNS = [
  /cypress\/support\/.*\.(ts|js)$/,
  /cypress\/commands\.(ts|js)$/,
];

// Critical config sections that affect test execution
const CRITICAL_CONFIG_SECTIONS = [
  "baseUrl",
  "env",
  "viewportWidth",
  "viewportHeight",
  "defaultCommandTimeout",
  "pageLoadTimeout",
  "requestTimeout",
  "responseTimeout",
  "retries",
  "video",
  "screenshot",
  "chromeWebSecurity",
  "watchForFileChanges",
];

/**
 * Check if file is a Cypress configuration file.
 */
export function isCypressConfig(path: string): boolean {
  return CYPRESS_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is a Cypress test file.
 */
export function isCypressTestFile(path: string): boolean {
  return CYPRESS_TEST_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is a Cypress fixture file.
 */
export function isCypressFixture(path: string): boolean {
  return CYPRESS_FIXTURE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is a Cypress support/commands file.
 */
export function isCypressSupportFile(path: string): boolean {
  return CYPRESS_SUPPORT_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if project uses Cypress.
 */
function hasCypressDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(
    deps?.["cypress"] ||
    devDeps?.["cypress"]
  );
}



/**
 * Extract config changes from additions/deletions.
 */
function extractConfigChanges(additions: string[], deletions: string[]): string[] {
  const changes = new Set<string>();
  const addedContent = additions.join("\n");
  const deletedContent = deletions.join("\n");

  for (const section of CRITICAL_CONFIG_SECTIONS) {
    const added = new RegExp(`\\b${section}\\s*:`).test(addedContent);
    const deleted = new RegExp(`\\b${section}\\s*:`).test(deletedContent);

    if (added && !deleted) {
      changes.add(`Added ${section}`);
    } else if (!added && deleted) {
      changes.add(`Removed ${section}`);
    } else if (added && deleted) {
      changes.add(`Modified ${section}`);
    }
  }

  return Array.from(changes);
}

/**
 * Detect breaking changes in config modifications.
 */
function detectBreakingChanges(
  additions: string[],
  deletions: string[]
): { isBreaking: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const addedContent = additions.join("\n");
  const deletedContent = deletions.join("\n");

  // baseUrl changes are breaking - tests will target wrong environment
  if (/\bbaseUrl\s*:/.test(deletedContent) && /\bbaseUrl\s*:/.test(addedContent)) {
    reasons.push("baseUrl changed (tests may target wrong environment)");
  }

  // Environment variable removals can break tests
  if (/env\s*:\s*\{/.test(deletedContent) && /\b\w+\s*:/.test(deletedContent)) {
    const envMatch = deletedContent.match(/env\s*:\s*\{([^}]+)\}/);
    if (envMatch) {
      reasons.push("Environment variables removed from config");
    }
  }

  // Viewport changes can cause visual regression failures
  if (/viewportWidth\s*:|viewportHeight\s*:/.test(deletedContent)) {
    if (/viewportWidth\s*:|viewportHeight\s*:/.test(addedContent)) {
      reasons.push("Viewport dimensions changed (may affect visual tests)");
    }
  }

  // Timeout reductions can cause flaky tests
  if (/Timeout\s*:\s*\d+/.test(deletedContent)) {
    const oldTimeouts = deletedContent.match(/\w+Timeout\s*:\s*(\d+)/g) || [];
    const newTimeouts = addedContent.match(/\w+Timeout\s*:\s*(\d+)/g) || [];
    for (let i = 0; i < oldTimeouts.length && i < newTimeouts.length; i++) {
      const oldVal = parseInt(oldTimeouts[i].match(/\d+/)?.[0] || "0");
      const newVal = parseInt(newTimeouts[i].match(/\d+/)?.[0] || "0");
      if (newVal < oldVal) {
        reasons.push("Timeout values reduced (may cause flaky tests)");
        break;
      }
    }
  }

  return {
    isBreaking: reasons.length > 0,
    reasons,
  };
}

/**
 * Count test cases in test file content.
 */
function countTests(content: string[]): number {
  const fullContent = content.join("\n");
  // Match it(), test(), describe() blocks
  const itMatches = fullContent.match(/\bit\s*\(/g) || [];
  const testMatches = fullContent.match(/\btest\s*\(/g) || [];
  const describeMatches = fullContent.match(/\bdescribe\s*\(/g) || [];
  return itMatches.length + testMatches.length + describeMatches.length;
}

/**
 * Detect changes in custom commands.
 */
function detectCommandChanges(deletions: string[]): string[] {
  const changes: string[] = [];
  const content = deletions.join("\n");

  // Match Cypress.Commands.add()
  const commandMatches = content.match(/Cypress\.Commands\.add\s*\(\s*['"]([^'"]+)['"]/g);
  if (commandMatches) {
    for (const match of commandMatches) {
      const nameMatch = match.match(/['"]([^'"]+)['"]/);
      if (nameMatch) {
        changes.push(`Custom command removed: ${nameMatch[1]}`);
      }
    }
  }

  // Match Cypress.Commands.overwrite()
  const overwriteMatches = content.match(/Cypress\.Commands\.overwrite\s*\(\s*['"]([^'"]+)['"]/g);
  if (overwriteMatches) {
    for (const match of overwriteMatches) {
      const nameMatch = match.match(/['"]([^'"]+)['"]/);
      if (nameMatch) {
        changes.push(`Custom command overwritten: ${nameMatch[1]}`);
      }
    }
  }

  return changes;
}

export const cypressAnalyzer: Analyzer = {
  name: "cypress",
  cache: {
    includeGlobs: [
      "**/cypress.config.*",
      "**/cypress/**/*.{ts,js}",
      "**/*.cy.{ts,js}",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if no Cypress dependency
    if (!hasCypressDependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const isConfig = isCypressConfig(diff.path);
      const isTest = isCypressTestFile(diff.path);
      const isFixture = isCypressFixture(diff.path);
      const isSupport = isCypressSupportFile(diff.path);

      if (!isConfig && !isTest && !isFixture && !isSupport) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      let finding: CypressConfigFinding | null = null;

      if (isConfig) {
        // Analyze config file changes
        const configChanges = extractConfigChanges(additions, deletions);
        const { isBreaking, reasons } = detectBreakingChanges(additions, deletions);
        const affectedSections = configChanges.map((c) => c.replace(/^(Added|Removed|Modified)\s+/, ""));

        // Detect custom command changes in supportFile
        const commandChanges = detectCommandChanges(deletions);

        let confidence: Confidence = "low";
        if (isBreaking) {
          confidence = "high";
        } else if (configChanges.length > 0) {
          confidence = "medium";
        }

        const excerpt = extractRepresentativeExcerpt(
          additions.length > 0 ? additions : deletions
        );
        const evidence = [createEvidence(diff.path, excerpt)];

        // Add config change evidence
        for (const change of [...reasons, ...commandChanges]) {
          evidence.push(createEvidence(diff.path, change));
        }

        finding = {
          type: "cypress-config",
          kind: "cypress-config",
          category: "tests",
          confidence,
          evidence,
          file: diff.path,
          status: diff.status,
          configChanges,
          testChanges: [],
          fixtureChanges: [],
          isBreaking,
          affectedSections,
          tags: isBreaking ? ["breaking"] : undefined,
        };
      } else if (isTest) {
        // Analyze test file changes
        const testCount = countTests(additions);
        const oldTestCount = countTests(deletions);

        const testChanges = [{
          file: diff.path,
          operation: diff.status as "added" | "removed" | "modified",
          testCount: diff.status === "added" ? testCount : diff.status === "deleted" ? oldTestCount : undefined,
        }];

        let confidence: Confidence = "low";
        if (diff.status === "deleted") {
          confidence = "medium"; // Removing tests reduces coverage
        } else if (testCount > oldTestCount) {
          confidence = "low"; // Adding tests is good
        } else if (testCount < oldTestCount) {
          confidence = "medium"; // Removing test cases
        }

        const excerpt = extractRepresentativeExcerpt(additions.length > 0 ? additions : deletions);

        finding = {
          type: "cypress-config",
          kind: "cypress-config",
          category: "tests",
          confidence,
          evidence: [createEvidence(diff.path, excerpt)],
          file: diff.path,
          status: diff.status,
          configChanges: [],
          testChanges,
          fixtureChanges: [],
          isBreaking: false,
          affectedSections: ["test-files"],
        };
      } else if (isFixture) {
        // Analyze fixture changes
        const fixtureChanges = [`Fixture ${diff.status}: ${diff.path.split("/").pop()}`];

        let confidence: Confidence = "low";
        if (diff.status === "deleted") {
          confidence = "high"; // Removing fixtures breaks tests that use them
        } else if (diff.status === "modified") {
          confidence = "medium"; // Modifying fixtures may break tests
        }

        const excerpt = extractRepresentativeExcerpt(additions.length > 0 ? additions : deletions);

        finding = {
          type: "cypress-config",
          kind: "cypress-config",
          category: "tests",
          confidence,
          evidence: [createEvidence(diff.path, excerpt)],
          file: diff.path,
          status: diff.status,
          configChanges: [],
          testChanges: [],
          fixtureChanges,
          isBreaking: diff.status === "deleted",
          affectedSections: ["fixtures"],
          tags: diff.status === "deleted" ? ["breaking"] : undefined,
        };
      } else if (isSupport) {
        // Analyze support/commands file changes
        const commandChanges = detectCommandChanges(deletions);
        const isBreaking = commandChanges.length > 0;

        let confidence: Confidence = "medium";
        if (isBreaking) {
          confidence = "high";
        }

        const excerpt = extractRepresentativeExcerpt(additions.length > 0 ? additions : deletions);
        const evidence = [createEvidence(diff.path, excerpt)];

        for (const change of commandChanges) {
          evidence.push(createEvidence(diff.path, change));
        }

        finding = {
          type: "cypress-config",
          kind: "cypress-config",
          category: "tests",
          confidence,
          evidence,
          file: diff.path,
          status: diff.status,
          configChanges: [],
          testChanges: [],
          fixtureChanges: [],
          isBreaking,
          affectedSections: ["custom-commands"],
          tags: isBreaking ? ["breaking"] : undefined,
        };
      }

      if (finding) {
        findings.push(finding);
      }
    }

    return findings;
  },
};
