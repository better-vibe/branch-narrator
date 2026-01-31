/**
 * Svelte 5 Runes change detector.
 *
 * Detects changes to Svelte 5 runes ($state, $derived, $effect, $props, $inspect, $bindable)
 * which represent a fundamental paradigm shift from Svelte 4's reactive syntax.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  Svelte5RunesFinding,
  Confidence,
} from "../core/types.js";

// Svelte runes to detect
const SVELTE_RUNES = [
  "$state",
  "$derived",
  "$effect",
  "$props",
  "$inspect",
  "$bindable",
] as const;

type RuneType = (typeof SVELTE_RUNES)[number];

// Svelte 5 file patterns
const SVELTE_FILE_PATTERNS = [
  /\.svelte$/,
  /\.svelte\.ts$/,
  /\.svelte\.js$/,
];

/**
 * Check if a file is a Svelte file (including .svelte.ts and .svelte.js).
 */
export function isSvelteFile(path: string): boolean {
  return SVELTE_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if the project uses Svelte 5 based on package.json dependencies.
 */
function hasSvelte5Dependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;

  // Check for svelte 5.x
  const svelteDep = deps?.["svelte"] || devDeps?.["svelte"];
  if (svelteDep) {
    // Check if version is 5.x
    const versionMatch = svelteDep.match(/^(?:\^|~)?(\d+)/);
    if (versionMatch && parseInt(versionMatch[1], 10) >= 5) {
      return true;
    }
  }

  // If we can't determine version from package.json, check for svelte presence
  return Boolean(deps?.["svelte"] || devDeps?.["svelte"]);
}

/**
 * Extract rune usage from content.
 */
function extractRunes(content: string[]): Array<{
  rune: RuneType;
  variableName?: string;
}> {
  const runes: Array<{
    rune: RuneType;
    variableName?: string;
  }> = [];

  const fullContent = content.join("\n");

  for (const rune of SVELTE_RUNES) {
    // Match rune calls: $state(), $derived(), etc.
    const regex = new RegExp(`\\${rune}\\s*\\(`, "g");
    let match;

    while ((match = regex.exec(fullContent)) !== null) {
      // Try to extract variable name from preceding context
      const beforeMatch = fullContent.slice(0, match.index);
      const varMatch = beforeMatch.match(/(?:let|const)\s+(\w+)\s*[=:][^;]*$/);

      runes.push({
        rune,
        variableName: varMatch ? varMatch[1] : undefined,
      });
    }
  }

  return runes;
}

/**
 * Detect Svelte 4 to 5 migration patterns.
 */
function detectMigrationPattern(
  baseContent: string,
  headContent: string
): { from: "svelte4" | "svelte5"; to: "svelte4" | "svelte5" } | undefined {
  // Don't detect migration if base content is empty (e.g., new file added)
  if (!baseContent.trim()) {
    return undefined;
  }

  const baseHasRunes = SVELTE_RUNES.some((rune) => baseContent.includes(`${rune}(`));
  const headHasRunes = SVELTE_RUNES.some((rune) => headContent.includes(`${rune}(`));

  // Svelte 4 style indicators
  const baseHasSvelte4Style = /\$:\s+/.test(baseContent) || /export\s+let\s+/.test(baseContent);

  if (!baseHasRunes && headHasRunes) {
    return { from: "svelte4", to: "svelte5" };
  }

  if (baseHasRunes && !headHasRunes) {
    return { from: "svelte5", to: "svelte4" };
  }

  // Additional detection based on reactive statements
  if (baseHasSvelte4Style && headHasRunes) {
    return { from: "svelte4", to: "svelte5" };
  }

  return undefined;
}

/**
 * Check if a rune change is breaking.
 */
function isBreakingRuneChange(
  rune: RuneType,
  operation: "added" | "removed" | "modified"
): boolean {
  // Removing $state is breaking (loses reactivity)
  if (rune === "$state" && operation === "removed") {
    return true;
  }

  // Removing $props is breaking (component loses props)
  if (rune === "$props" && operation === "removed") {
    return true;
  }

  // Removing $derived might be breaking if other code depends on it
  if (rune === "$derived" && operation === "removed") {
    return true;
  }

  // Removing $effect might be breaking if it had side effects
  if (rune === "$effect" && operation === "removed") {
    return true;
  }

  return false;
}

/**
 * Extract script content from a .svelte file.
 * Returns the content between all <script> and </script> tags.
 */
function extractScriptContent(content: string): string[] {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  const scripts: string[] = [];
  let match;

  while ((match = scriptRegex.exec(content)) !== null) {
    if (match[1]) {
      scripts.push(match[1]);
    }
  }

  if (scripts.length > 0) {
    return scripts.join("\n").split("\n");
  }

  return content.split("\n");
}

export const svelte5RunesAnalyzer: Analyzer = {
  name: "svelte5-runes",
  cache: {
    includeGlobs: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Svelte 5
    if (!hasSvelte5Dependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Only analyze Svelte files
      if (!isSvelteFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // Extract script content from .svelte files
      const addedContent = diff.path.endsWith(".svelte")
        ? extractScriptContent(additions.join("\n"))
        : additions;
      const deletedContent = diff.path.endsWith(".svelte")
        ? extractScriptContent(deletions.join("\n"))
        : deletions;

      // Extract runes from additions and deletions
      const addedRunes = extractRunes(addedContent);
      const deletedRunes = extractRunes(deletedContent);

      // If no runes detected and no migration pattern, skip
      if (addedRunes.length === 0 && deletedRunes.length === 0) {
        // Still check for migration pattern
        const migrationPattern = detectMigrationPattern(
          deletedContent.join("\n"),
          addedContent.join("\n")
        );
        if (!migrationPattern) {
          continue;
        }
      }

      // Build rune changes list
      const runeChanges: Svelte5RunesFinding["runeChanges"] = [];

      // Added runes
      for (const rune of addedRunes) {
        const existedBefore = deletedRunes.some(
          (r) => r.rune === rune.rune && r.variableName === rune.variableName
        );
        if (!existedBefore) {
          runeChanges.push({
            rune: rune.rune,
            operation: "added",
            variableName: rune.variableName,
            isBreaking: false,
          });
        }
      }

      // Removed runes
      for (const rune of deletedRunes) {
        const stillExists = addedRunes.some(
          (r) => r.rune === rune.rune && r.variableName === rune.variableName
        );
        if (!stillExists) {
          const isBreaking = isBreakingRuneChange(rune.rune, "removed");
          runeChanges.push({
            rune: rune.rune,
            operation: "removed",
            variableName: rune.variableName,
            isBreaking,
          });
        }
      }

      // Modified runes (same rune type but different variable/usage)
      for (const addedRune of addedRunes) {
        const deletedRune = deletedRunes.find((r) => r.rune === addedRune.rune);
        if (
          deletedRune &&
          deletedRune.variableName !== addedRune.variableName &&
          !runeChanges.some(
            (rc) =>
              rc.rune === addedRune.rune &&
              (rc.operation === "added" || rc.operation === "removed")
          )
        ) {
          runeChanges.push({
            rune: addedRune.rune,
            operation: "modified",
            variableName: addedRune.variableName,
            isBreaking: isBreakingRuneChange(addedRune.rune, "modified"),
          });
        }
      }

      // If no rune changes detected, skip
      if (runeChanges.length === 0) {
        continue;
      }

      // Detect migration pattern
      const migrationPattern = detectMigrationPattern(
        deletedContent.join("\n"),
        addedContent.join("\n")
      );

      // Determine if any changes are breaking
      const hasBreakingChanges = runeChanges.some((c) => c.isBreaking);

      let confidence: Confidence = "medium";
      if (hasBreakingChanges) {
        confidence = "high";
      } else if (migrationPattern) {
        confidence = "high";
      } else if (runeChanges.every((c) => c.operation === "added")) {
        confidence = "low";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add rune change evidence
      for (const change of runeChanges) {
        const action = change.operation === "added" ? "Added" : change.operation === "removed" ? "Removed" : "Modified";
        const varName = change.variableName ? ` (${change.variableName})` : "";
        evidence.push(createEvidence(diff.path, `${action} ${change.rune}${varName}`));
      }

      const finding: Svelte5RunesFinding = {
        type: "svelte5-runes",
        kind: "svelte5-runes",
        category: "api",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        runeChanges,
        migrationPattern,
        tags: hasBreakingChanges ? ["breaking"] : migrationPattern ? ["migration"] : undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
