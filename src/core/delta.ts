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
 * NOTE: FactsOutput currently does not persist the original CLI "mode"
 * (e.g. "unstaged", "staged", "all", "branch"). As a result, we can only
 * infer the mode heuristically from the available git range information:
 *
 * - If `facts.git.base` is set, we treat this as `mode = "branch"`.
 * - If `facts.git.base` is null/undefined, we treat this as `mode = "unstaged"`.
 *
 * This is a best-effort guess and may misclassify some cases. In particular,
 * runs that originally used "staged" or "all" modes will currently be
 * reported here as `mode = "unstaged"`. Consumers of ScopeMetadata should
 * treat the `mode` field as approximate when derived from FactsOutput and not
 * rely on it for exact reconstruction of the original CLI invocation.
 */
export function extractFactsScope(facts: FactsOutput): ScopeMetadata {
  return {
    // Heuristic: presence of a base ref implies a branch comparison.
    // See function documentation for limitations of this inference.
    mode: facts.git.base ? "branch" : "unstaged",
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
 * NOTE: Similar to extractFactsScope, RiskReport does not persist the original
 * CLI "mode". We infer it heuristically from the range information:
 *
 * - If `report.range.base` is set, we treat this as `mode = "branch"`.
 * - If `report.range.base` is null/empty, we treat this as `mode = "unstaged"`.
 *
 * This may misclassify "staged" or "all" modes as "unstaged". Treat the `mode`
 * field as approximate.
 */
export function extractRiskReportScope(report: RiskReport): ScopeMetadata {
  return {
    // Heuristic: presence of a base ref implies a branch comparison.
    // See function documentation for limitations of this inference.
    mode: report.range.base ? "branch" : "unstaged",
    base: report.range.base || null,
    head: report.range.head || null,
    // Risk report doesn't store only/exclude, so we can't compare
    only: null,
  };
}
