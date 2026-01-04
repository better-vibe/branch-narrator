/**
 * Category aggregation for findings.
 */

import type {
  Category,
  CategoryAggregate,
  Evidence,
  Finding,
  RiskFactor,
} from "../../core/types.js";

/**
 * Map risk factor kind to category.
 */
function riskFactorKindToCategory(kind: string): Category {
  if (kind.includes("db-migration") || kind.includes("database")) {
    return "database";
  }
  if (kind.includes("dependency")) {
    return "dependencies";
  }
  if (kind.includes("route")) {
    return "routes";
  }
  if (kind.includes("env-var")) {
    return "config_env";
  }
  if (kind.includes("security")) {
    return "infra";
  }
  if (kind.includes("cloudflare")) {
    return "cloudflare";
  }
  if (kind.includes("test")) {
    return "tests";
  }
  return "unknown";
}

/**
 * Aggregate findings and risk factors by category.
 */
export function aggregateCategories(
  findings: Finding[],
  riskFactors: RiskFactor[]
): CategoryAggregate[] {
  // Initialize category aggregates
  const categoryMap = new Map<Category, {
    count: number;
    riskWeight: number;
    evidence: Evidence[];
  }>();

  // Process findings (excluding file-summary)
  for (const finding of findings) {
    if (finding.kind === "file-summary") {
      continue; // Skip file-summary
    }

    const category = finding.category;
    
    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        count: 0,
        riskWeight: 0,
        evidence: [],
      });
    }

    const agg = categoryMap.get(category)!;
    agg.count += 1;

    // Add evidence (limit to top 3 total per category)
    if (agg.evidence.length < 3 && finding.evidence.length > 0) {
      const remaining = 3 - agg.evidence.length;
      agg.evidence.push(...finding.evidence.slice(0, remaining));
    }
  }

  // Process risk factors to accumulate weights
  for (const factor of riskFactors) {
    // Determine category from factor kind or evidence
    let category: Category = "unknown";
    
    // First, check if there's a matching finding with this evidence
    for (const finding of findings) {
      if (finding.evidence.length > 0 && factor.evidence.length > 0) {
        // Check if evidence files match
        const findingFiles = new Set(finding.evidence.map(e => e.file));
        const factorFiles = new Set(factor.evidence.map(e => e.file));
        const hasOverlap = Array.from(findingFiles)
          .some(f => factorFiles.has(f));
        if (hasOverlap) {
          category = finding.category;
          break;
        }
      }
    }
    
    // Fallback to kind-based mapping
    if (category === "unknown") {
      category = riskFactorKindToCategory(factor.kind);
    }

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        count: 0,
        riskWeight: 0,
        evidence: [],
      });
    }

    const agg = categoryMap.get(category)!;
    agg.riskWeight += factor.weight;

    // Add evidence from risk factor if not already present
    if (agg.evidence.length < 3 && factor.evidence.length > 0) {
      const remaining = 3 - agg.evidence.length;
      agg.evidence.push(...factor.evidence.slice(0, remaining));
    }
  }

  // Convert to array and sort deterministically
  const categories: CategoryAggregate[] = Array.from(
    categoryMap.entries()
  ).map(([id, data]) => ({
    id,
    count: data.count,
    riskWeight: data.riskWeight,
    topEvidence: data.evidence.slice(0, 3),
  }));

  // Sort: riskWeight desc, count desc, id asc
  categories.sort((a, b) => {
    if (b.riskWeight !== a.riskWeight) {
      return b.riskWeight - a.riskWeight;
    }
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.id.localeCompare(b.id);
  });

  return categories;
}

/**
 * Build summary.byArea from categories.
 */
export function buildSummaryByArea(
  categories: CategoryAggregate[]
): Record<string, number> {
  const byArea: Record<string, number> = {};
  for (const cat of categories) {
    byArea[cat.id] = cat.count;
  }
  return byArea;
}
