/**
 * Monorepo configuration change detector.
 *
 * Detects changes to monorepo configuration files (Turborepo, pnpm workspaces,
 * Lerna, Nx, Yarn workspaces) and identifies potentially impactful modifications.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  MonorepoConfigFinding,
  MonorepoTool,
  Confidence,
} from "../core/types.js";

// Monorepo config patterns by tool
const CONFIG_PATTERNS: Record<MonorepoTool, RegExp[]> = {
  turborepo: [/^turbo\.json$/],
  pnpm: [/^pnpm-workspace\.yaml$/, /^pnpm-workspace\.yml$/],
  lerna: [/^lerna\.json$/],
  nx: [/^nx\.json$/, /^project\.json$/],
  yarn: [/^\.yarnrc\.yml$/, /^\.yarnrc$/],
  npm: [/^package\.json$/], // For workspaces field only
  changesets: [/^\.changeset\/config\.json$/],
};

// Critical configuration fields by tool
const CRITICAL_FIELDS: Record<MonorepoTool, string[]> = {
  turborepo: ["pipeline", "globalDependencies", "globalEnv", "tasks"],
  pnpm: ["packages"],
  lerna: ["packages", "version", "npmClient", "useWorkspaces"],
  nx: ["targetDefaults", "namedInputs", "plugins", "defaultProject"],
  yarn: ["nodeLinker", "enableGlobalCache", "nmMode"],
  npm: ["workspaces"],
  changesets: ["baseBranch", "access", "changelog"],
};

/**
 * Detect which monorepo tool a file belongs to.
 */
export function detectMonorepoTool(path: string): MonorepoTool | null {
  for (const [tool, patterns] of Object.entries(CONFIG_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(path))) {
      // Special case: package.json only counts if it has workspaces
      if (tool === "npm" && !path.endsWith("package.json")) {
        continue;
      }
      return tool as MonorepoTool;
    }
  }
  return null;
}

/**
 * Check if package.json has workspace changes.
 */
function hasWorkspaceChanges(additions: string[], deletions: string[]): boolean {
  const allContent = [...additions, ...deletions].join("\n");
  return /["']workspaces["']/.test(allContent);
}

/**
 * Extract affected fields from diff content.
 */
function extractAffectedFields(content: string[], tool: MonorepoTool): string[] {
  const criticalFields = CRITICAL_FIELDS[tool] || [];
  const affected: string[] = [];
  const fullContent = content.join("\n");

  for (const field of criticalFields) {
    const pattern = new RegExp(`["']?${field}["']?\\s*[:{[]`, "i");
    if (pattern.test(fullContent)) {
      affected.push(field);
    }
  }

  return affected;
}

/**
 * Detect potentially impactful changes.
 */
function detectImpactfulChanges(
  tool: MonorepoTool,
  additions: string[],
  deletions: string[]
): string[] {
  const impacts: string[] = [];
  const addedContent = additions.join("\n");
  const deletedContent = deletions.join("\n");

  switch (tool) {
    case "turborepo":
      if (/pipeline|tasks/.test(deletedContent)) {
        impacts.push("Build pipeline configuration changed");
      }
      if (/cache\s*[:=]\s*false/.test(addedContent)) {
        impacts.push("Caching disabled for tasks");
      }
      if (/globalDependencies/.test(addedContent) || /globalDependencies/.test(deletedContent)) {
        impacts.push("Global dependencies changed (affects cache invalidation)");
      }
      break;

    case "pnpm":
      if (/packages/.test(deletedContent)) {
        impacts.push("Workspace packages configuration changed");
      }
      break;

    case "lerna":
      if (/version/.test(addedContent) && /independent/.test(addedContent)) {
        impacts.push("Switching to independent versioning");
      }
      if (/npmClient/.test(addedContent) || /npmClient/.test(deletedContent)) {
        impacts.push("npm client configuration changed");
      }
      break;

    case "nx":
      if (/targetDefaults/.test(deletedContent)) {
        impacts.push("Default target configuration changed");
      }
      if (/plugins/.test(addedContent) || /plugins/.test(deletedContent)) {
        impacts.push("Nx plugins configuration changed");
      }
      break;

    case "yarn":
      if (/nodeLinker/.test(addedContent) || /nodeLinker/.test(deletedContent)) {
        impacts.push("Node linker strategy changed (affects dependency resolution)");
      }
      break;

    case "npm":
      if (/workspaces/.test(deletedContent)) {
        impacts.push("Workspace packages configuration changed");
      }
      break;

    case "changesets":
      if (/baseBranch/.test(addedContent) || /baseBranch/.test(deletedContent)) {
        impacts.push("Base branch for changesets modified");
      }
      if (/access/.test(addedContent)) {
        impacts.push("Package publish access level changed");
      }
      break;
  }

  return impacts;
}

export const monorepoAnalyzer: Analyzer = {
  name: "monorepo",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const tool = detectMonorepoTool(diff.path);

      if (!tool) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // For package.json, only report if workspaces field is affected
      if (tool === "npm" && !hasWorkspaceChanges(additions, deletions)) {
        continue;
      }

      const affectedFields = extractAffectedFields([...additions, ...deletions], tool);
      const impacts = detectImpactfulChanges(tool, additions, deletions);

      // Skip if no meaningful changes detected
      if (affectedFields.length === 0 && impacts.length === 0) {
        continue;
      }

      const isBreaking = impacts.length > 0;
      const confidence: Confidence = isBreaking ? "high" : "medium";

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const finding: MonorepoConfigFinding = {
        type: "monorepo-config",
        kind: "monorepo-config",
        category: "config_env",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        tool,
        affectedFields,
        impacts,
      };

      findings.push(finding);
    }

    return findings;
  },
};
