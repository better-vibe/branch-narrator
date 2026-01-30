/**
 * TypeScript configuration change detector.
 *
 * Detects changes to tsconfig.json files and identifies potentially
 * build-breaking or behavior-changing modifications.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TypeScriptConfigFinding,
  Confidence,
} from "../core/types.js";

// TypeScript config file patterns
const TSCONFIG_PATTERNS = [
  /^tsconfig\.json$/,
  /^tsconfig\.\w+\.json$/,
  /\/tsconfig\.json$/,
  /\/tsconfig\.\w+\.json$/,
];

// Critical compiler options that can break builds or change behavior
const CRITICAL_OPTIONS = new Set([
  "strict",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitAny",
  "noImplicitThis",
  "noImplicitReturns",
  "noUncheckedIndexedAccess",
  "target",
  "module",
  "moduleResolution",
  "lib",
  "jsx",
  "esModuleInterop",
  "allowSyntheticDefaultImports",
  "skipLibCheck",
  "isolatedModules",
  "verbatimModuleSyntax",
  "baseUrl",
  "paths",
  "outDir",
  "rootDir",
  "declaration",
  "declarationMap",
  "sourceMap",
  "composite",
  "incremental",
  "emitDecoratorMetadata",
  "experimentalDecorators",
]);

// Options that affect type checking strictness
const STRICTNESS_OPTIONS = new Set([
  "strict",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitAny",
  "noImplicitThis",
  "noImplicitReturns",
  "noUncheckedIndexedAccess",
  "noUnusedLocals",
  "noUnusedParameters",
  "exactOptionalPropertyTypes",
]);

/**
 * Check if a file is a TypeScript config file.
 */
export function isTsConfig(path: string): boolean {
  return TSCONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Extract changed options from diff content.
 */
function extractChangedOptions(
  additions: string[],
  deletions: string[]
): { added: string[]; removed: string[]; modified: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Regex to match JSON property assignments
  const optionPattern = /"(\w+)":\s*/;

  const addedOptions = new Set<string>();
  const removedOptions = new Set<string>();

  for (const line of additions) {
    const match = line.match(optionPattern);
    if (match) {
      addedOptions.add(match[1]);
    }
  }

  for (const line of deletions) {
    const match = line.match(optionPattern);
    if (match) {
      removedOptions.add(match[1]);
    }
  }

  // Categorize: added, removed, or modified
  for (const opt of addedOptions) {
    if (removedOptions.has(opt)) {
      modified.push(opt);
    } else {
      added.push(opt);
    }
  }

  for (const opt of removedOptions) {
    if (!addedOptions.has(opt)) {
      removed.push(opt);
    }
  }

  return { added, removed, modified };
}

/**
 * Determine if changes are breaking.
 */
function isBreakingChange(
  added: string[],
  removed: string[],
  modified: string[]
): boolean {
  // Removing strictness options can silently break type safety
  // Adding strictness options can cause build failures
  for (const opt of [...added, ...removed, ...modified]) {
    if (CRITICAL_OPTIONS.has(opt)) {
      return true;
    }
  }
  return false;
}

/**
 * Identify strictness-related changes.
 */
function getStrictnessChanges(
  added: string[],
  removed: string[],
  modified: string[]
): string[] {
  const changes: string[] = [];
  const allChanges = [...added, ...removed, ...modified];

  for (const opt of allChanges) {
    if (STRICTNESS_OPTIONS.has(opt)) {
      if (added.includes(opt)) {
        changes.push(`Added ${opt}`);
      } else if (removed.includes(opt)) {
        changes.push(`Removed ${opt}`);
      } else {
        changes.push(`Modified ${opt}`);
      }
    }
  }

  return changes;
}

/**
 * Check if the project uses TypeScript based on package.json dependencies.
 */
function hasTypeScriptDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.["typescript"] || devDeps?.["typescript"]);
}

/**
 * Check if any TypeScript config files are in the changeset.
 */
function hasTsConfigFiles(changeSet: ChangeSet): boolean {
  return (
    changeSet.files.some((f) => isTsConfig(f.path)) ||
    changeSet.diffs.some((d) => isTsConfig(d.path))
  );
}

export const typescriptConfigAnalyzer: Analyzer = {
  name: "typescript-config",
  cache: { includeGlobs: ["**/tsconfig*.json"] },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use TypeScript and no tsconfig files changed
    if (!hasTypeScriptDependency(changeSet) && !hasTsConfigFiles(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isTsConfig(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const { added, removed, modified } = extractChangedOptions(
        additions,
        deletions
      );

      // Skip if no meaningful changes detected
      if (added.length === 0 && removed.length === 0 && modified.length === 0) {
        // Still report the file changed if there were additions/deletions
        if (additions.length > 0 || deletions.length > 0) {
          const finding: TypeScriptConfigFinding = {
            type: "typescript-config",
            kind: "typescript-config",
            category: "config_env",
            confidence: "low",
            evidence: [
              createEvidence(
                diff.path,
                extractRepresentativeExcerpt(additions.length > 0 ? additions : deletions)
              ),
            ],
            file: diff.path,
            status: diff.status,
            isBreaking: false,
            changedOptions: {
              added: [],
              removed: [],
              modified: [],
            },
            strictnessChanges: [],
          };
          findings.push(finding);
        }
        continue;
      }

      const isBreaking = isBreakingChange(added, removed, modified);
      const strictnessChanges = getStrictnessChanges(added, removed, modified);

      const confidence: Confidence = isBreaking ? "high" : "medium";

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const finding: TypeScriptConfigFinding = {
        type: "typescript-config",
        kind: "typescript-config",
        category: "config_env",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        changedOptions: {
          added,
          removed,
          modified,
        },
        strictnessChanges,
      };

      findings.push(finding);
    }

    return findings;
  },
};
