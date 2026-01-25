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
  // Database-related
  if (kind.includes("db-migration") || kind.includes("database") || kind.includes("sql")) {
    return "database";
  }
  // Dependency-related
  if (kind.includes("dependency") || kind.includes("deps")) {
    return "dependencies";
  }
  // Route-related
  if (kind.includes("route")) {
    return "routes";
  }
  // Config/env-related
  if (kind.includes("env-var") || kind.includes("config")) {
    return "config_env";
  }
  // Security/infrastructure
  if (kind.includes("security") || kind.includes("infra") || kind.includes("docker") || kind.includes("k8s") || kind.includes("terraform")) {
    return "infra";
  }
  // Cloudflare
  if (kind.includes("cloudflare") || kind.includes("wrangler") || kind.includes("workers")) {
    return "cloudflare";
  }
  // CI/CD
  if (kind.includes("ci") || kind.includes("workflow") || kind.includes("pipeline")) {
    return "ci";
  }
  // Test-related (actual test file changes)
  if (kind.includes("test") && !kind.includes("test-coverage")) {
    return "tests";
  }
  // Quality-related (coverage issues)
  if (kind.includes("test-coverage") || kind.includes("quality")) {
    return "quality";
  }
  // API-related
  if (kind.includes("api") || kind.includes("contract")) {
    return "api";
  }
  // Impact/core module changes - these affect the system broadly
  // Large diffs also affect reviewability and risk, so map to impact
  if (kind.includes("core-module") || kind.includes("impact") || kind.includes("blast-radius") || kind.includes("large-diff") || kind.includes("churn")) {
    return "impact";
  }
  // Documentation
  if (kind.includes("doc")) {
    return "docs";
  }
  return "unknown";
}

/**
 * Score evidence by information density.
 * Higher scores = more informative/actionable evidence.
 */
function scoreEvidence(evidence: Evidence): number {
  const excerpt = evidence.excerpt.toLowerCase();
  let score = 0;
  
  // Prefer evidence with numbers (quantified impact)
  if (/\d+/.test(excerpt)) score += 10;
  
  // Prefer evidence mentioning blast radius, impact, risk
  if (excerpt.includes("blast radius")) score += 15;
  if (excerpt.includes("high")) score += 5;
  if (excerpt.includes("critical")) score += 8;
  if (excerpt.includes("breaking")) score += 8;
  
  // Prefer evidence with specific action words
  if (excerpt.includes("added") || excerpt.includes("removed") || excerpt.includes("modified")) score += 3;
  
  // Penalize generic/low-info evidence
  if (excerpt === "imports module") score -= 10;
  if (excerpt.startsWith("depends on")) score -= 5;
  
  return score;
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

  // Process findings (excluding meta-findings that don't belong to a specific domain)
  for (const finding of findings) {
    if (finding.kind === "file-summary" || finding.kind === "file-category") {
      continue; // Skip meta-findings
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

    // Collect all evidence first, we'll select best ones later
    agg.evidence.push(...finding.evidence);
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

    // Collect all evidence from risk factors too
    agg.evidence.push(...factor.evidence);
  }

  // Convert to array and select top 3 evidence by information score
  // Filter out categories with no findings (count: 0) to avoid noise like "unknown: 0"
  const categories: CategoryAggregate[] = Array.from(
    categoryMap.entries()
  )
    .filter(([_id, data]) => data.count > 0)
    .map(([id, data]) => {
      // Sort evidence by score (descending), then by file path (ascending) for determinism
      const sortedEvidence = [...data.evidence].sort((a, b) => {
        const scoreA = scoreEvidence(a);
        const scoreB = scoreEvidence(b);
        if (scoreB !== scoreA) return scoreB - scoreA; // Higher score first
        return a.file.localeCompare(b.file); // Alphabetical for ties
      });
    
      // Dedupe by file to avoid repetition
      const seen = new Set<string>();
      const deduped: Evidence[] = [];
      for (const ev of sortedEvidence) {
        if (!seen.has(ev.file)) {
          seen.add(ev.file);
          deduped.push(ev);
        }
        if (deduped.length >= 3) break;
      }
    
      return {
        id,
        count: data.count,
        riskWeight: data.riskWeight,
        topEvidence: deduped,
      };
    });

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
