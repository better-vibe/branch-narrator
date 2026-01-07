/**
 * Delta computation utilities for --since comparison.
 * Provides ID-based diff logic for facts and risk-report outputs.
 */

import { readFile } from "node:fs/promises";
import type {
  FactsOutput,
  RiskReport,
  ScopeWarning,
  ScopeMetadata,
} from "./types.js";

/**
 * Load and parse a JSON file.
 */
export async function loadJson(path: string): Promise<any> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content);
}

/**
 * Normalize an object for comparison by removing volatile fields.
 * - Removes generatedAt timestamps
 * - Ensures consistent ordering for arrays
 */
export function normalizeForComparison<T extends Record<string, any>>(obj: T): T {
  const normalized = { ...obj };

  // Remove volatile fields
  delete normalized.generatedAt;

  return normalized;
}

/**
 * Compare two normalized objects for deep equality.
 * Sorts object keys to avoid false positives from property order differences.
 */
function deepEqual(a: any, b: any): boolean {
  // Sort keys recursively to ensure consistent ordering
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortKeys);
    }
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
  };

  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

/**
 * Build a map from ID to item for efficient lookup.
 */
function buildIdMap<T extends { findingId?: string; flagId?: string }>(
  items: T[]
): Map<string, T> {
  const map = new Map<string, T>();

  for (const item of items) {
    const id = item.findingId || item.flagId;
    if (id) {
      map.set(id, item);
    }
  }

  return map;
}

/**
 * Compute delta between two sets of items keyed by ID.
 */
export function diffById<T extends { findingId?: string; flagId?: string }>(params: {
  beforeItems: T[];
  afterItems: T[];
}): {
  added: string[];
  removed: string[];
  changed: Array<{ id: string; before: T; after: T }>;
} {
  const beforeMap = buildIdMap(params.beforeItems);
  const afterMap = buildIdMap(params.afterItems);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ id: string; before: T; after: T }> = [];

  // Find added and changed
  for (const [id, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(id);

    if (!beforeItem) {
      added.push(id);
    } else {
      // Normalize both items for comparison
      const normalizedBefore = normalizeForComparison(beforeItem);
      const normalizedAfter = normalizeForComparison(afterItem);

      if (!deepEqual(normalizedBefore, normalizedAfter)) {
        changed.push({ id, before: beforeItem, after: afterItem });
      }
    }
  }

  // Find removed
  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) {
      removed.push(id);
    }
  }

  // Sort for deterministic output
  added.sort();
  removed.sort();
  changed.sort((a, b) => a.id.localeCompare(b.id));

  return { added, removed, changed };
}

/**
 * Compare scope metadata and generate warnings for mismatches.
 */
export function compareScopeMetadata(
  before: ScopeMetadata,
  after: ScopeMetadata
): ScopeWarning[] {
  const warnings: ScopeWarning[] = [];

  if (before.mode !== after.mode) {
    warnings.push({
      code: "scope-mismatch",
      message: `Previous run used mode=${before.mode}, current is mode=${after.mode}`,
    });
  }

  if (before.base !== after.base) {
    warnings.push({
      code: "scope-mismatch",
      message: `Previous run used base=${before.base}, current is base=${after.base}`,
    });
  }

  if (before.head !== after.head) {
    warnings.push({
      code: "scope-mismatch",
      message: `Previous run used head=${before.head}, current is head=${after.head}`,
    });
  }

  if (before.profile !== after.profile) {
    warnings.push({
      code: "scope-mismatch",
      message: `Previous run used profile=${before.profile}, current is profile=${after.profile}`,
    });
  }

  // Compare include/exclude arrays
  const beforeIncludes = JSON.stringify(before.include || []);
  const afterIncludes = JSON.stringify(after.include || []);
  if (beforeIncludes !== afterIncludes) {
    warnings.push({
      code: "scope-mismatch",
      message: `Include filters differ between runs`,
    });
  }

  const beforeExcludes = JSON.stringify(before.exclude || []);
  const afterExcludes = JSON.stringify(after.exclude || []);
  if (beforeExcludes !== afterExcludes) {
    warnings.push({
      code: "scope-mismatch",
      message: `Exclude filters differ between runs`,
    });
  }

  // Compare only (for risk-report)
  if (before.only !== undefined || after.only !== undefined) {
    const beforeOnly = JSON.stringify(before.only || null);
    const afterOnly = JSON.stringify(after.only || null);
    if (beforeOnly !== afterOnly) {
      warnings.push({
        code: "scope-mismatch",
        message: `Category filters differ between runs`,
      });
    }
  }

  return warnings;
}

/**
 * Extract scope metadata from FactsOutput for comparison.
 *
 * The mode field is read directly from the stored git.mode if available.
 * For backward compatibility with older outputs that don't have git.mode,
 * we fall back to heuristic inference based on base/head values.
 */
export function extractFactsScope(facts: FactsOutput): ScopeMetadata {
  // Use stored mode if available, otherwise fall back to heuristic
  let mode: string;
  if (facts.git.mode) {
    mode = facts.git.mode;
  } else {
    // Legacy fallback: infer mode from base/head values
    mode = facts.git.base ? "branch" : "unstaged";
  }

  return {
    mode,
    base: facts.git.base || null,
    head: facts.git.head || null,
    profile: facts.profile.detected,
    include: facts.filters.includes,
    exclude: facts.filters.excludes,
  };
}

/**
 * Extract scope metadata from RiskReport for comparison.
 *
 * The mode field is read directly from the stored range.mode if available.
 * For backward compatibility with older outputs that don't have range.mode,
 * we fall back to heuristic inference based on base/head values.
 *
 * Filters (only/exclude) are read from report.filters if available.
 */
export function extractRiskReportScope(report: RiskReport): ScopeMetadata {
  // Use stored mode if available, otherwise fall back to heuristic
  let mode: string;
  if (report.range.mode) {
    mode = report.range.mode;
  } else {
    // Legacy fallback: infer mode from base/head values
    mode = report.range.base ? "branch" : "unstaged";
  }

  return {
    mode,
    base: report.range.base || null,
    head: report.range.head || null,
    // Read filters from stored report if available
    only: report.filters?.only || null,
    exclude: report.filters?.exclude,
  };
}
