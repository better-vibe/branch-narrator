/**
 * Package exports change detector.
 *
 * Detects changes to package.json exports field which is critical for
 * library consumers. Changes to exports can be breaking changes.
 */

import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  PackageExportsFinding,
  Confidence,
} from "../core/types.js";

type ExportsField = string | Record<string, unknown> | null;

/**
 * Flatten exports field into a list of export paths.
 */
function flattenExports(
  exports: ExportsField,
  prefix: string = ""
): string[] {
  if (!exports) {
    return [];
  }

  if (typeof exports === "string") {
    return [prefix || "."];
  }

  if (typeof exports === "object") {
    const paths: string[] = [];

    for (const [key, value] of Object.entries(exports)) {
      // Conditional exports (e.g., "import", "require", "types")
      if (key.startsWith(".")) {
        paths.push(...flattenExports(value as ExportsField, key));
      } else {
        // This is a condition, not a subpath
        if (typeof value === "string" || typeof value === "object") {
          paths.push(...flattenExports(value as ExportsField, prefix));
        }
      }
    }

    // Remove duplicates
    return [...new Set(paths)];
  }

  return [];
}

/**
 * Compare exports between base and head package.json.
 */
function compareExports(
  baseExports: ExportsField,
  headExports: ExportsField
): {
  added: string[];
  removed: string[];
  hasExportsField: { base: boolean; head: boolean };
} {
  const basePaths = flattenExports(baseExports);
  const headPaths = flattenExports(headExports);

  const baseSet = new Set(basePaths);
  const headSet = new Set(headPaths);

  const added = headPaths.filter((p) => !baseSet.has(p));
  const removed = basePaths.filter((p) => !headSet.has(p));

  return {
    added,
    removed,
    hasExportsField: {
      base: baseExports !== undefined && baseExports !== null,
      head: headExports !== undefined && headExports !== null,
    },
  };
}

/**
 * Check for main/module/types field changes (legacy entry points).
 */
function compareLegacyFields(
  base: Record<string, unknown> | undefined,
  head: Record<string, unknown> | undefined
): { field: string; from?: string; to?: string }[] {
  const fields = ["main", "module", "types", "typings", "browser"];
  const changes: { field: string; from?: string; to?: string }[] = [];

  for (const field of fields) {
    const baseValue = base?.[field] as string | undefined;
    const headValue = head?.[field] as string | undefined;

    if (baseValue !== headValue) {
      changes.push({
        field,
        from: baseValue,
        to: headValue,
      });
    }
  }

  return changes;
}

/**
 * Check for bin field changes.
 */
function compareBinField(
  base: Record<string, unknown> | undefined,
  head: Record<string, unknown> | undefined
): { added: string[]; removed: string[] } {
  const baseBin = base?.bin;
  const headBin = head?.bin;

  const getNames = (bin: unknown): string[] => {
    if (typeof bin === "string") {
      return ["(default)"];
    }
    if (typeof bin === "object" && bin !== null) {
      return Object.keys(bin);
    }
    return [];
  };

  const baseNames = new Set(getNames(baseBin));
  const headNames = new Set(getNames(headBin));

  return {
    added: [...headNames].filter((n) => !baseNames.has(n)),
    removed: [...baseNames].filter((n) => !headNames.has(n)),
  };
}

export const packageExportsAnalyzer: Analyzer = {
  name: "package-exports",
  cache: { includeGlobs: ["**/package.json"] },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    const base = changeSet.basePackageJson;
    const head = changeSet.headPackageJson;

    // Skip if neither version has a package.json
    if (!base && !head) {
      return findings;
    }

    // Compare exports field
    const baseExports = base?.exports as ExportsField | undefined;
    const headExports = head?.exports as ExportsField | undefined;

    const exportsComparison = compareExports(
      baseExports ?? null,
      headExports ?? null
    );

    // Compare legacy entry point fields
    const legacyChanges = compareLegacyFields(base, head);

    // Compare bin field
    const binChanges = compareBinField(base, head);

    // Determine if there are breaking changes
    const hasRemovedExports = exportsComparison.removed.length > 0;
    const hasRemovedBins = binChanges.removed.length > 0;
    const hasRemovedLegacy = legacyChanges.some(
      (c) => c.from !== undefined && c.to === undefined
    );
    const isBreaking = hasRemovedExports || hasRemovedBins || hasRemovedLegacy;

    // Skip if no changes to exports/entry points
    const hasExportsChanges =
      exportsComparison.added.length > 0 ||
      exportsComparison.removed.length > 0;
    const hasLegacyChanges = legacyChanges.length > 0;
    const hasBinChanges =
      binChanges.added.length > 0 || binChanges.removed.length > 0;

    if (!hasExportsChanges && !hasLegacyChanges && !hasBinChanges) {
      return findings;
    }

    // Determine confidence
    let confidence: Confidence = "medium";
    if (isBreaking) {
      confidence = "high";
    } else if (
      exportsComparison.added.length > 0 ||
      binChanges.added.length > 0
    ) {
      confidence = "low";
    }

    // Create excerpt summarizing changes
    const excerptParts: string[] = [];
    if (exportsComparison.removed.length > 0) {
      excerptParts.push(
        `Removed exports: ${exportsComparison.removed.slice(0, 3).join(", ")}`
      );
    }
    if (exportsComparison.added.length > 0) {
      excerptParts.push(
        `Added exports: ${exportsComparison.added.slice(0, 3).join(", ")}`
      );
    }
    if (legacyChanges.length > 0) {
      excerptParts.push(
        `Changed fields: ${legacyChanges.map((c) => c.field).join(", ")}`
      );
    }
    if (binChanges.removed.length > 0) {
      excerptParts.push(`Removed bins: ${binChanges.removed.join(", ")}`);
    }
    if (binChanges.added.length > 0) {
      excerptParts.push(`Added bins: ${binChanges.added.join(", ")}`);
    }

    const finding: PackageExportsFinding = {
      type: "package-exports",
      kind: "package-exports",
      category: "api",
      confidence,
      evidence: [createEvidence("package.json", excerptParts.join("; "))],
      isBreaking,
      addedExports: exportsComparison.added,
      removedExports: exportsComparison.removed,
      legacyFieldChanges: legacyChanges,
      binChanges: {
        added: binChanges.added,
        removed: binChanges.removed,
      },
    };

    findings.push(finding);

    return findings;
  },
};
