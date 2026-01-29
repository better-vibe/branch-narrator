/**
 * Turborepo configuration change detector.
 *
 * Detects changes to turbo.json and identifies potentially breaking
 * changes such as pipeline/tasks modifications and cache invalidation changes.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TurborepoConfigFinding,
  Confidence,
} from "../core/types.js";

// Turborepo config file patterns
const TURBOREPO_CONFIG_PATTERNS = [
  /^turbo\.json$/,
  /^turbo\.jsonc$/,
];

/**
 * Check if a file is a Turborepo config file.
 */
export function isTurborepoConfig(path: string): boolean {
  return TURBOREPO_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

// Critical config sections
const CRITICAL_SECTIONS = [
  "tasks",
  "pipeline",
  "globalDependencies",
  "globalEnv",
  "globalPassThroughEnv",
  "remoteCache",
  "experimentalUI",
  "daemon",
  "envMode",
  "cacheDir",
];

// Breaking change patterns
const BREAKING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /["']?tasks["']?\s*[:=\{]/, reason: "Task definitions changed" },
  { pattern: /["']?pipeline["']?\s*[:=\{]/, reason: "Pipeline definitions changed (legacy)" },
  { pattern: /["']?globalDependencies["']?\s*[:=\[]/, reason: "Global dependencies changed (affects cache invalidation)" },
  { pattern: /["']?globalEnv["']?\s*[:=\[]/, reason: "Global env changed (affects all tasks)" },
  { pattern: /["']?outputs["']?\s*[:=\[]/, reason: "Task outputs changed (affects caching)" },
  { pattern: /["']?cache["']?\s*[:=].*false/, reason: "Caching disabled for task(s)" },
  { pattern: /["']?remoteCache["']?\s*[:=\{]/, reason: "Remote cache configuration changed" },
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
  const deletedContent = deletions.join("\n");

  for (const { pattern, reason } of BREAKING_PATTERNS) {
    if (pattern.test(deletedContent)) {
      reasons.push(reason);
    }
  }

  // Also check if cache is being disabled in additions
  const addedContent = additions.join("\n");
  if (/["']?cache["']?\s*[:=]\s*false/.test(addedContent)) {
    if (!reasons.includes("Caching disabled for task(s)")) {
      reasons.push("Caching disabled for task(s)");
    }
  }

  return reasons;
}

export const turborepoAnalyzer: Analyzer = {
  name: "turborepo",
  cache: {
    includeGlobs: ["turbo.json", "turbo.jsonc"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isTurborepoConfig(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);
      const allLines = [...additions, ...deletions];

      const affectedSections = extractAffectedSections(allLines);
      const breakingReasons = detectBreakingChanges(additions, deletions);
      const isBreaking = breakingReasons.length > 0;

      // Skip if no meaningful changes detected
      if (affectedSections.length === 0 && breakingReasons.length === 0) {
        continue;
      }

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const confidence: Confidence = isBreaking ? "high" : "medium";

      const finding: TurborepoConfigFinding = {
        type: "turborepo-config",
        kind: "turborepo-config",
        category: "config_env",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        affectedSections,
        breakingReasons,
      };

      findings.push(finding);
    }

    return findings;
  },
};
