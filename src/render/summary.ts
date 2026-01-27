/**
 * Shared summary and top findings builder for human-facing outputs.
 *
 * Provides structured data for both terminal (pretty) and markdown (pr-body)
 * renderers to ensure consistency.
 */

import type {
  CIWorkflowFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  GraphQLChangeFinding,
  ImpactAnalysisFinding,
  LockfileFinding,
  PackageExportsFinding,
  RiskScore,
  RouteChangeFinding,
  SecurityFileFinding,
  SQLRiskFinding,
  TailwindConfigFinding,
  TestChangeFinding,
  TypeScriptConfigFinding,
} from "../core/types.js";

// ============================================================================
// Dependency Overview Types
// ============================================================================

export interface DependencyOverview {
  /** Total number of dependency changes */
  total: number;
  /** Production dependency change count */
  prodCount: number;
  /** Dev dependency change count */
  devCount: number;
  /** Breakdown by impact type */
  byImpact: {
    major: number;
    minor: number;
    patch: number;
    new: number;
    removed: number;
  };
  /** Major version updates (capped list for display) */
  majorUpdates: { name: string; from?: string; to?: string }[];
  /** Newly added packages (capped list for display) */
  newPackages: string[];
  /** Removed packages (capped list for display) */
  removedPackages: string[];
  /** Whether any risky category packages changed */
  hasRiskyCategoryChanges: boolean;
}
import { routeIdToUrlPath } from "../analyzers/route-detector.js";

// ============================================================================
// Types
// ============================================================================

export interface Diffstat {
  total: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
}

export type ReviewAttention = "HIGH" | "MEDIUM" | "LOW";

export interface FindingsByCategory {
  code: number;
  tests: number;
  docs: number;
  config: number;
  infra: number;
  ci: number;
  deps: number;
  db: number;
  other: number;
}

export interface TopFinding {
  /** Short description of the finding */
  description: string;
  /** Files or dependents involved (capped list) */
  examples: string[];
  /** Count of additional items not shown */
  moreCount: number;
}

export interface SummaryData {
  diffstat: Diffstat;
  reviewAttention: ReviewAttention;
  findingsByCategory: FindingsByCategory;
  topFindings: TopFinding[];
  primaryFiles: string[];
  hasChangesets: boolean;
  changesetFiles: string[];
}

// ============================================================================
// Constants
// ============================================================================

const TOP_FINDINGS_LIMIT = 5;
const EXAMPLES_LIMIT = 5;
const PRIMARY_FILES_THRESHOLD = 3;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build diffstat from file summary finding.
 */
function buildDiffstat(findings: Finding[]): Diffstat {
  const fileSummary = findings.find(
    (f) => f.type === "file-summary"
  ) as FileSummaryFinding | undefined;

  if (!fileSummary) {
    return { total: 0, added: 0, modified: 0, deleted: 0, renamed: 0 };
  }

  const added = fileSummary.added.length;
  const modified = fileSummary.modified.length;
  const deleted = fileSummary.deleted.length;
  const renamed = fileSummary.renamed.length;
  const total = added + modified + deleted + renamed;

  return { total, added, modified, deleted, renamed };
}

/**
 * Compute review attention based on impact analysis.
 * HIGH if any high blast radius, MEDIUM if any medium blast radius, LOW otherwise.
 */
function computeReviewAttention(findings: Finding[]): ReviewAttention {
  const impactFindings = findings.filter(
    (f) => f.type === "impact-analysis"
  ) as ImpactAnalysisFinding[];

  const hasHigh = impactFindings.some((i) => i.blastRadius === "high");
  const hasMedium = impactFindings.some((i) => i.blastRadius === "medium");

  if (hasHigh) return "HIGH";
  if (hasMedium) return "MEDIUM";
  return "LOW";
}

/**
 * Build findings-by-category counts from file category finding.
 */
function buildFindingsByCategory(findings: Finding[]): FindingsByCategory {
  const categoryFinding = findings.find(
    (f) => f.type === "file-category"
  ) as FileCategoryFinding | undefined;

  const result: FindingsByCategory = {
    code: 0,
    tests: 0,
    docs: 0,
    config: 0,
    infra: 0,
    ci: 0,
    deps: 0,
    db: 0,
    other: 0,
  };

  if (!categoryFinding) {
    return result;
  }

  const { categories } = categoryFinding;
  result.code = categories.product.length;
  result.tests = categories.tests.length;
  result.docs = categories.docs.length;
  result.config = categories.config.length;
  result.infra = categories.infra.length;
  result.ci = categories.ci.length;
  result.deps = categories.dependencies.length;
  result.db = categories.database?.length ?? 0;
  result.other = categories.other.length + (categories.artifacts?.length ?? 0);

  return result;
}

/**
 * Group findings by type in a single pass for O(n) performance.
 * This avoids multiple filter() calls which would be O(n*m) where m is number of types.
 */
export function groupFindingsByType(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const existing = groups.get(finding.type);
    if (existing) {
      existing.push(finding);
    } else {
      groups.set(finding.type, [finding]);
    }
  }

  return groups;
}

/**
 * Get findings of a specific type from a grouped findings map.
 * Eliminates verbose `(groups.get("type") as T[]) ?? []` pattern.
 */
export function getFindings<T extends Finding>(
  groups: Map<string, Finding[]>,
  type: string
): T[] {
  return (groups.get(type) as T[]) ?? [];
}

/**
 * Build top findings list (prioritized, capped).
 * Uses single-pass grouping for O(n) performance instead of multiple filter() calls.
 *
 * Priority order:
 * 1. High blast radius
 * 2. High-risk DB migrations, destructive SQL, CI security
 * 3. Breaking config changes (TS, Tailwind, GraphQL, package exports)
 * 4. Lockfile mismatch
 * 5. Security-sensitive files
 * 6. Major dependency updates
 * 7. Route changes, API contracts
 * 8. Test changes
 */
function buildTopFindings(findings: Finding[]): TopFinding[] {
  const items: TopFinding[] = [];

  // Single-pass grouping for O(n) performance
  const grouped = groupFindingsByType(findings);

  // 1. High blast radius
  const impactFindings = (grouped.get("impact-analysis") ?? []) as ImpactAnalysisFinding[];
  const highImpact = impactFindings.filter((i) => i.blastRadius === "high");
  for (const impact of highImpact) {
    const examples = impact.affectedFiles.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, impact.affectedFiles.length - EXAMPLES_LIMIT);
    items.push({
      description: `High blast radius: ${impact.sourceFile} (${impact.affectedFiles.length} dependents)`,
      examples,
      moreCount,
    });
  }

  // 2. Medium blast radius
  const mediumImpact = impactFindings.filter((i) => i.blastRadius === "medium");
  for (const impact of mediumImpact) {
    const examples = impact.affectedFiles.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, impact.affectedFiles.length - EXAMPLES_LIMIT);
    items.push({
      description: `Medium blast radius: ${impact.sourceFile} (${impact.affectedFiles.length} dependents)`,
      examples,
      moreCount,
    });
  }

  // 3. High-risk DB migrations
  const dbMigrations = (grouped.get("db-migration") ?? []) as DbMigrationFinding[];
  const highRiskMigrations = dbMigrations.filter((m) => m.risk === "high");
  if (highRiskMigrations.length > 0) {
    const files = highRiskMigrations.flatMap((m) => m.files);
    const examples = files.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, files.length - EXAMPLES_LIMIT);
    items.push({
      description: `High-risk database migrations (${files.length} files)`,
      examples,
      moreCount,
    });
  }

  // 4. Destructive SQL
  const sqlRisks = (grouped.get("sql-risk") ?? []) as SQLRiskFinding[];
  const destructiveSql = sqlRisks.filter((s) => s.riskType === "destructive");
  if (destructiveSql.length > 0) {
    const files = destructiveSql.map((s) => s.file);
    const examples = files.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, files.length - EXAMPLES_LIMIT);
    items.push({
      description: `Destructive SQL detected (${files.length} files)`,
      examples,
      moreCount,
    });
  }

  // 5. CI security issues
  const ciWorkflows = (grouped.get("ci-workflow") ?? []) as CIWorkflowFinding[];
  const ciSecurityIssues = ciWorkflows.filter(
    (c) =>
      c.riskType === "permissions_broadened" ||
      c.riskType === "pull_request_target"
  );
  if (ciSecurityIssues.length > 0) {
    const files = ciSecurityIssues.map((c) => c.file);
    const examples = files.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, files.length - EXAMPLES_LIMIT);
    items.push({
      description: `CI workflow security changes (${files.length} files)`,
      examples,
      moreCount,
    });
  }

  // 6. Breaking config changes (use grouped data)
  const breakingConfigs: { type: string; files: string[] }[] = [];

  const tsConfigs = (grouped.get("typescript-config") ?? []) as TypeScriptConfigFinding[];
  const breakingTs = tsConfigs.filter((c) => c.isBreaking);
  if (breakingTs.length > 0) {
    breakingConfigs.push({
      type: "TypeScript",
      files: breakingTs.map((c) => c.file),
    });
  }

  const tailwindConfigs = (grouped.get("tailwind-config") ?? []) as TailwindConfigFinding[];
  const breakingTailwind = tailwindConfigs.filter((c) => c.isBreaking);
  if (breakingTailwind.length > 0) {
    breakingConfigs.push({
      type: "Tailwind",
      files: breakingTailwind.map((c) => c.file),
    });
  }

  const graphqlChanges = (grouped.get("graphql-change") ?? []) as GraphQLChangeFinding[];
  const breakingGraphql = graphqlChanges.filter((g) => g.isBreaking);
  if (breakingGraphql.length > 0) {
    breakingConfigs.push({
      type: "GraphQL",
      files: breakingGraphql.map((g) => g.file),
    });
  }

  const packageExports = (grouped.get("package-exports") ?? []) as PackageExportsFinding[];
  const breakingExports = packageExports.filter((p) => p.isBreaking);
  if (breakingExports.length > 0) {
    breakingConfigs.push({
      type: "Package exports",
      files: ["package.json"],
    });
  }

  for (const config of breakingConfigs) {
    const examples = config.files.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, config.files.length - EXAMPLES_LIMIT);
    items.push({
      description: `Breaking ${config.type} config change`,
      examples,
      moreCount,
    });
  }

  // 7. Lockfile mismatch (use grouped data - only one expected)
  const lockfileMismatches = (grouped.get("lockfile-mismatch") ?? []) as LockfileFinding[];
  const lockfileMismatch = lockfileMismatches[0];
  if (lockfileMismatch) {
    if (
      lockfileMismatch.manifestChanged &&
      !lockfileMismatch.lockfileChanged
    ) {
      items.push({
        description: "Lockfile mismatch: package.json changed but lockfile not updated",
        examples: ["package.json"],
        moreCount: 0,
      });
    } else if (
      !lockfileMismatch.manifestChanged &&
      lockfileMismatch.lockfileChanged
    ) {
      items.push({
        description: "Lockfile mismatch: lockfile changed but package.json not updated",
        examples: [],
        moreCount: 0,
      });
    }
  }

  // 8. Security-sensitive files
  const securityFiles = (grouped.get("security-file") ?? []) as SecurityFileFinding[];
  if (securityFiles.length > 0) {
    const files = securityFiles.flatMap((s) => s.files);
    const examples = files.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, files.length - EXAMPLES_LIMIT);
    items.push({
      description: `Security-sensitive files changed (${files.length} files)`,
      examples,
      moreCount,
    });
  }

  // 9. Major dependency updates
  const depChanges = (grouped.get("dependency-change") ?? []) as DependencyChangeFinding[];
  const majorChanges = depChanges.filter((d) => d.impact === "major");
  if (majorChanges.length > 0) {
    const names = majorChanges.map((d) => d.name);
    const examples = names.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, names.length - EXAMPLES_LIMIT);
    items.push({
      description: `Major dependency updates (${names.length} packages)`,
      examples,
      moreCount,
    });
  }

  // 10. Route changes
  const routeChanges = (grouped.get("route-change") ?? []) as RouteChangeFinding[];
  if (routeChanges.length > 0) {
    const routes = routeChanges.map((r) => routeIdToUrlPath(r.routeId));
    const examples = routes.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, routes.length - EXAMPLES_LIMIT);
    items.push({
      description: `Route changes (${routes.length} routes)`,
      examples,
      moreCount,
    });
  }

  // 11. Test changes
  const testChanges = (grouped.get("test-change") ?? []) as TestChangeFinding[];
  if (testChanges.length > 0) {
    const allFiles = testChanges.flatMap((t) => t.files);
    const addedCount = testChanges.reduce((sum, t) => sum + t.added.length, 0);
    const modifiedCount = testChanges.reduce(
      (sum, t) => sum + t.modified.length,
      0
    );

    const parts: string[] = [];
    if (addedCount > 0) parts.push(`${addedCount} added`);
    if (modifiedCount > 0) parts.push(`${modifiedCount} modified`);

    const examples = allFiles.slice(0, EXAMPLES_LIMIT);
    const moreCount = Math.max(0, allFiles.length - EXAMPLES_LIMIT);
    items.push({
      description: `Test files changed (${parts.join(", ") || allFiles.length + " files"})`,
      examples,
      moreCount,
    });
  }

  // Return capped list
  return items.slice(0, TOP_FINDINGS_LIMIT);
}

/**
 * Get primary product files for small changes.
 */
function getPrimaryFiles(findings: Finding[]): string[] {
  const categoryFinding = findings.find(
    (f) => f.type === "file-category"
  ) as FileCategoryFinding | undefined;

  if (!categoryFinding) {
    return [];
  }

  const productFiles = categoryFinding.categories.product;

  // Only show primary files if the count is small
  if (productFiles.length > PRIMARY_FILES_THRESHOLD) {
    return [];
  }

  return productFiles;
}

/**
 * Check for and extract changeset files from docs category.
 */
function getChangesetFiles(findings: Finding[]): string[] {
  const categoryFinding = findings.find(
    (f) => f.type === "file-category"
  ) as FileCategoryFinding | undefined;

  if (!categoryFinding) {
    return [];
  }

  const docsFiles = categoryFinding.categories.docs;
  return docsFiles.filter((f) => f.startsWith(".changeset/"));
}

// ============================================================================
// Dependency Overview
// ============================================================================

const DEP_OVERVIEW_EXAMPLES_LIMIT = 5;

/**
 * Build a concise dependency overview from dependency-change findings.
 * Used by both markdown and terminal renderers for the promoted dependency section.
 */
export function buildDependencyOverview(
  findings: Finding[]
): DependencyOverview {
  const depFindings = findings.filter(
    (f) => f.type === "dependency-change"
  ) as DependencyChangeFinding[];

  const overview: DependencyOverview = {
    total: depFindings.length,
    prodCount: 0,
    devCount: 0,
    byImpact: { major: 0, minor: 0, patch: 0, new: 0, removed: 0 },
    majorUpdates: [],
    newPackages: [],
    removedPackages: [],
    hasRiskyCategoryChanges: false,
  };

  if (depFindings.length === 0) {
    return overview;
  }

  for (const dep of depFindings) {
    // Count by section
    if (dep.section === "dependencies") {
      overview.prodCount++;
    } else {
      overview.devCount++;
    }

    // Count by impact
    const impact = dep.impact ?? "unknown";
    if (impact === "major") {
      overview.byImpact.major++;
      if (overview.majorUpdates.length < DEP_OVERVIEW_EXAMPLES_LIMIT) {
        overview.majorUpdates.push({
          name: dep.name,
          from: dep.from,
          to: dep.to,
        });
      }
    } else if (impact === "minor") {
      overview.byImpact.minor++;
    } else if (impact === "patch") {
      overview.byImpact.patch++;
    } else if (impact === "new") {
      overview.byImpact.new++;
      if (overview.newPackages.length < DEP_OVERVIEW_EXAMPLES_LIMIT) {
        overview.newPackages.push(dep.name);
      }
    } else if (impact === "removed") {
      overview.byImpact.removed++;
      if (overview.removedPackages.length < DEP_OVERVIEW_EXAMPLES_LIMIT) {
        overview.removedPackages.push(dep.name);
      }
    }

    // Risky category check
    if (dep.riskCategory) {
      overview.hasRiskyCategoryChanges = true;
    }
  }

  return overview;
}

/**
 * Format a dependency overview as a compact human-readable summary.
 * Returns an array of bullet strings for embedding in output sections.
 */
export function formatDependencyOverviewBullets(
  overview: DependencyOverview
): string[] {
  if (overview.total === 0) {
    return [];
  }

  const bullets: string[] = [];

  // Counts line
  const parts: string[] = [];
  if (overview.prodCount > 0) {
    parts.push(`${overview.prodCount} production`);
  }
  if (overview.devCount > 0) {
    parts.push(`${overview.devCount} dev`);
  }
  bullets.push(`${overview.total} dependency changes (${parts.join(", ")})`);

  // Major updates
  if (overview.majorUpdates.length > 0) {
    const names = overview.majorUpdates.map((u) => {
      if (u.from && u.to) {
        return `${u.name} ${u.from} -> ${u.to}`;
      }
      return u.name;
    });
    const moreCount = overview.byImpact.major - overview.majorUpdates.length;
    const moreStr = moreCount > 0 ? ` (+${moreCount} more)` : "";
    bullets.push(`Major: ${names.join(", ")}${moreStr}`);
  }

  // New packages
  if (overview.newPackages.length > 0) {
    const moreCount = overview.byImpact.new - overview.newPackages.length;
    const moreStr = moreCount > 0 ? ` (+${moreCount} more)` : "";
    bullets.push(`Added: ${overview.newPackages.join(", ")}${moreStr}`);
  }

  // Removed packages
  if (overview.removedPackages.length > 0) {
    const moreCount = overview.byImpact.removed - overview.removedPackages.length;
    const moreStr = moreCount > 0 ? ` (+${moreCount} more)` : "";
    bullets.push(`Removed: ${overview.removedPackages.join(", ")}${moreStr}`);
  }

  return bullets;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Build structured summary data from findings for human-facing outputs.
 */
export function buildSummaryData(findings: Finding[]): SummaryData {
  const changesetFiles = getChangesetFiles(findings);

  return {
    diffstat: buildDiffstat(findings),
    reviewAttention: computeReviewAttention(findings),
    findingsByCategory: buildFindingsByCategory(findings),
    topFindings: buildTopFindings(findings),
    primaryFiles: getPrimaryFiles(findings),
    hasChangesets: changesetFiles.length > 0,
    changesetFiles,
  };
}

/**
 * Format diffstat as a human-readable string.
 */
export function formatDiffstat(diffstat: Diffstat): string {
  const parts: string[] = [];
  if (diffstat.added > 0) parts.push(`${diffstat.added} added`);
  if (diffstat.modified > 0) parts.push(`${diffstat.modified} modified`);
  if (diffstat.deleted > 0) parts.push(`${diffstat.deleted} deleted`);
  if (diffstat.renamed > 0) parts.push(`${diffstat.renamed} renamed`);

  if (parts.length === 0) {
    return "0 changed";
  }

  return `${diffstat.total} changed (${parts.join(", ")})`;
}

/**
 * Format findings-by-category as a compact string.
 * Only shows non-zero categories.
 */
export function formatFindingsByCategory(
  findingsByCategory: FindingsByCategory
): string {
  const parts: string[] = [];

  if (findingsByCategory.code > 0) {
    parts.push(`code=${findingsByCategory.code}`);
  }
  if (findingsByCategory.tests > 0) {
    parts.push(`tests=${findingsByCategory.tests}`);
  }
  if (findingsByCategory.docs > 0) {
    parts.push(`docs=${findingsByCategory.docs}`);
  }
  if (findingsByCategory.config > 0) {
    parts.push(`config=${findingsByCategory.config}`);
  }
  if (findingsByCategory.infra > 0) {
    parts.push(`infra=${findingsByCategory.infra}`);
  }
  if (findingsByCategory.ci > 0) {
    parts.push(`ci=${findingsByCategory.ci}`);
  }
  if (findingsByCategory.deps > 0) {
    parts.push(`deps=${findingsByCategory.deps}`);
  }
  if (findingsByCategory.db > 0) {
    parts.push(`db=${findingsByCategory.db}`);
  }
  if (findingsByCategory.other > 0) {
    parts.push(`other=${findingsByCategory.other}`);
  }

  if (parts.length === 0) {
    return "none";
  }

  return parts.join(", ");
}

/**
 * Get risk level text without emoji.
 */
export function formatRiskLevel(riskScore: RiskScore): string {
  return `${riskScore.level.toUpperCase()} (${riskScore.score}/100)`;
}

/**
 * Strip emoji prefixes from a bullet string.
 * Used to clean risk evidence bullets before rendering.
 */
export function stripEmojiPrefix(text: string): string {
  return text
    .replace(/^[⚠️⚡ℹ️✅]\s*/, "")
    .replace(/^[\u2600-\u27FF]\s*/, "");
}
