/**
 * Facts output builder - assembles complete agent-grade facts.
 */

import type {
  ChangeSet,
  ChangesetInfo,
  ChangesetWarning,
  DiffMode,
  FactsOutput,
  FileCategory,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  Filters,
  GitInfo,
  LargeDiffFinding,
  LockfileFinding,
  ProfileInfo,
  ProfileName,
  RiskScore,
  SkippedFile,
  Stats,
} from "../../core/types.js";
import { redactEvidence } from "../../core/evidence.js";
import { aggregateCategories, buildSummaryByArea } from "./categories.js";
import { deriveActions } from "./actions.js";
import { DEFAULT_EXCLUDES } from "../../core/filters.js";
import { sortFindings as sortFindingsDeterministically, sortEvidence } from "../../core/sorting.js";
import { getRepoRoot, isWorkingDirDirty } from "../../git/collector.js";
import { assignFindingId } from "../../core/ids.js";

/**
 * Build facts output options.
 */
export interface BuildFactsOptions {
  changeSet: ChangeSet;
  findings: Finding[];
  riskScore: RiskScore;
  requestedProfile: ProfileName;
  detectedProfile: ProfileName;
  profileConfidence: "high" | "medium" | "low";
  profileReasons: string[];
  filters?: {
    excludes?: string[];
    includes?: string[];
    redact?: boolean;
    maxFileBytes?: number;
    maxDiffBytes?: number;
    maxFindings?: number;
  };
  skippedFiles?: SkippedFile[];
  warnings?: string[];
  noTimestamp?: boolean;
  /** Pre-computed git repository root (avoids git call if provided) */
  repoRoot?: string;
  /** Pre-computed working directory dirty status (avoids git call if provided) */
  isDirty?: boolean;
  /** Original CLI mode used to generate this output */
  mode?: DiffMode;
}

/**
 * Calculate stats from change set.
 */
function calculateStats(
  changeSet: ChangeSet,
  skippedFiles: SkippedFile[]
): Stats {
  let insertions = 0;
  let deletions = 0;

  for (const diff of changeSet.diffs) {
    for (const hunk of diff.hunks) {
      insertions += hunk.additions.length;
      deletions += hunk.deletions.length;
    }
  }

  return {
    filesChanged: changeSet.files.length,
    insertions,
    deletions,
    skippedFilesCount: skippedFiles.length,
  };
}

/** Meta-finding types that should be extracted to changeset */
const META_FINDING_TYPES = new Set([
  "file-summary",
  "file-category",
  "large-diff",
  "lockfile-mismatch",
]);

/**
 * Check if a finding is a meta-finding (organizational, not domain-specific).
 */
function isMetaFinding(finding: Finding): boolean {
  return META_FINDING_TYPES.has(finding.type);
}

/**
 * Build changeset info from meta-findings.
 */
function buildChangesetInfo(findings: Finding[]): ChangesetInfo {
  // Find the meta-findings
  const fileSummary = findings.find(f => f.type === "file-summary") as FileSummaryFinding | undefined;
  const fileCategory = findings.find(f => f.type === "file-category") as FileCategoryFinding | undefined;
  const largeDiff = findings.find(f => f.type === "large-diff") as LargeDiffFinding | undefined;
  const lockfileMismatch = findings.find(f => f.type === "lockfile-mismatch") as LockfileFinding | undefined;

  // Build files structure
  const files = {
    added: fileSummary?.added ?? [],
    modified: fileSummary?.modified ?? [],
    deleted: fileSummary?.deleted ?? [],
    renamed: fileSummary?.renamed ?? [],
  };

  // Build byCategory - ensure all categories are present
  const defaultCategories: Record<FileCategory, string[]> = {
    product: [],
    tests: [],
    ci: [],
    infra: [],
    database: [],
    docs: [],
    dependencies: [],
    config: [],
    artifacts: [],
    other: [],
  };
  const byCategory = fileCategory?.categories ?? defaultCategories;

  // Build category summary
  const categorySummary = fileCategory?.summary ?? [];

  // Build warnings
  const warnings: ChangesetWarning[] = [];
  if (largeDiff) {
    warnings.push({
      type: "large-diff",
      filesChanged: largeDiff.filesChanged,
      linesChanged: largeDiff.linesChanged,
    });
  }
  if (lockfileMismatch) {
    warnings.push({
      type: "lockfile-mismatch",
      manifestChanged: lockfileMismatch.manifestChanged,
      lockfileChanged: lockfileMismatch.lockfileChanged,
    });
  }

  // Include change descriptions if available
  const changeDescriptions = fileSummary?.changeDescriptions;

  return {
    files,
    byCategory,
    categorySummary,
    changeDescriptions,
    warnings,
  };
}

/**
 * Build highlights from findings.
 * Generates human-readable summary bullets for notable findings.
 */
function buildHighlights(findings: Finding[]): string[] {
  const highlights: string[] = [];

  // Route changes
  const routeChanges = findings.filter(f => f.type === "route-change");
  if (routeChanges.length > 0) {
    highlights.push(`${routeChanges.length} route(s) changed`);
  }

  // Database migrations
  const dbMigrations = findings.filter(f => f.type === "db-migration");
  if (dbMigrations.length > 0) {
    const highRisk = dbMigrations.some(m => m.risk === "high");
    highlights.push(
      highRisk
        ? "Database migrations (HIGH RISK)"
        : "Database migrations"
    );
  }

  // SQL risks (separate from migrations)
  const sqlRisks = findings.filter(f => f.type === "sql-risk");
  const destructiveSql = sqlRisks.filter(s => s.riskType === "destructive");
  if (destructiveSql.length > 0) {
    highlights.push(`Destructive SQL detected in ${destructiveSql.length} file(s)`);
  }

  // Dependency changes (major versions)
  const depChanges = findings.filter(f => f.type === "dependency-change");
  const majorChanges = depChanges.filter(d => d.impact === "major");
  if (majorChanges.length > 0) {
    highlights.push(`${majorChanges.length} major dependency update(s)`);
  }

  // New dependencies
  const newDeps = depChanges.filter(d => d.impact === "new");
  if (newDeps.length > 0) {
    highlights.push(`${newDeps.length} new dependency(ies) added`);
  }

  // Environment variables
  const envVars = findings.filter(f => f.type === "env-var");
  if (envVars.length > 0) {
    const added = envVars.filter(e => e.change === "added");
    highlights.push(
      added.length > 0
        ? `${added.length} new environment variable(s)`
        : `${envVars.length} environment variable(s) touched`
    );
  }

  // Security files
  const securityFiles = findings.filter(f => f.type === "security-file");
  if (securityFiles.length > 0) {
    highlights.push("Security-sensitive files changed");
  }

  // CI/CD workflows
  const ciWorkflows = findings.filter(f => f.type === "ci-workflow");
  if (ciWorkflows.length > 0) {
    const securityIssues = ciWorkflows.filter(c => 
      c.riskType === "permissions_broadened" || c.riskType === "pull_request_target"
    );
    if (securityIssues.length > 0) {
      highlights.push("CI workflow security changes detected");
    } else {
      highlights.push(`${ciWorkflows.length} CI workflow(s) modified`);
    }
  }

  // Infrastructure changes
  const infraChanges = findings.filter(f => f.type === "infra-change");
  if (infraChanges.length > 0) {
    const types = [...new Set(infraChanges.map(i => i.infraType))];
    highlights.push(`Infrastructure changes: ${types.join(", ")}`);
  }

  // Cloudflare changes
  const cfChanges = findings.filter(f => f.type === "cloudflare-change");
  if (cfChanges.length > 0) {
    const areas = [...new Set(cfChanges.map(c => c.area))];
    highlights.push(`Cloudflare ${areas.join("/")} configuration changed`);
  }

  // API contract changes
  const apiChanges = findings.filter(f => f.type === "api-contract-change");
  if (apiChanges.length > 0) {
    highlights.push(`${apiChanges.length} API contract(s) modified`);
  }

  // Test changes
  const testChanges = findings.filter(f => f.type === "test-change");
  if (testChanges.length > 0) {
    const files = testChanges.flatMap(t => t.files);
    highlights.push(`${files.length} test file(s) modified`);
  }

  // Convention violations (test gaps)
  const violations = findings.filter(f => f.type === "convention-violation");
  if (violations.length > 0) {
    const totalFiles = violations.reduce((sum, v) => sum + v.files.length, 0);
    highlights.push(`${totalFiles} source file(s) missing corresponding tests`);
  }

  // Test gaps (explicit)
  const testGaps = findings.filter(f => f.type === "test-gap");
  if (testGaps.length > 0) {
    const totalUntested = testGaps.reduce((sum, t) => sum + t.prodFilesChanged, 0);
    highlights.push(`${totalUntested} modified file(s) lack test coverage`);
  }

  // Impact analysis (high blast radius)
  const impactFindings = findings.filter(f => f.type === "impact-analysis");
  const highImpact = impactFindings.filter(i => i.blastRadius === "high");
  if (highImpact.length > 0) {
    highlights.push(`${highImpact.length} file(s) with high blast radius`);
  }

  // Stencil component changes (group all Stencil findings)
  const stencilFindings = findings.filter(f => 
    f.type === "stencil-component-change" ||
    f.type === "stencil-prop-change" ||
    f.type === "stencil-event-change" ||
    f.type === "stencil-method-change" ||
    f.type === "stencil-slot-change"
  );
  if (stencilFindings.length > 0) {
    const components = new Set(stencilFindings.map(s => s.tag));
    highlights.push(`${components.size} Stencil component(s) with API changes`);
  }

  // High-risk flags
  const riskFlags = findings.filter(f => f.type === "risk-flag");
  const highRiskFlags = riskFlags.filter(r => r.risk === "high");
  if (highRiskFlags.length > 0) {
    highlights.push(`${highRiskFlags.length} high-risk condition(s) detected`);
  }

  return highlights;
}

/**
 * Build complete facts output.
 */
export async function buildFacts(
  options: BuildFactsOptions
): Promise<FactsOutput> {
  const {
    changeSet,
    findings: rawFindings,
    riskScore,
    requestedProfile,
    detectedProfile,
    profileConfidence,
    profileReasons,
    filters: userFilters,
    skippedFiles: userSkippedFiles,
    warnings: userWarnings,
    noTimestamp,
    repoRoot: providedRepoRoot,
    isDirty: providedIsDirty,
    mode,
  } = options;

  // Sort findings deterministically first (without touching evidence yet)
  let findings = sortFindingsDeterministically(rawFindings);

  // Assign stable findingIds to all findings
  findings = findings.map(assignFindingId);

  // Apply max findings limit early to avoid processing evidence for discarded findings
  if (userFilters?.maxFindings && findings.length > userFilters.maxFindings) {
    findings = findings.slice(0, userFilters.maxFindings);
  }

  // Now process evidence only for the findings we're keeping
  if (userFilters?.redact) {
    findings = findings.map(finding => ({
      ...finding,
      evidence: sortEvidence(finding.evidence.map(redactEvidence)),
    }));
  } else {
    // Sort evidence even when not redacting
    findings = findings.map(finding => ({
      ...finding,
      evidence: sortEvidence(finding.evidence),
    }));
  }

  // Get git info - use provided values if available, otherwise fetch in parallel
  let repoRoot: string;
  let isDirty: boolean;

  if (providedRepoRoot !== undefined && providedIsDirty !== undefined) {
    // Both provided, use them directly
    repoRoot = providedRepoRoot;
    isDirty = providedIsDirty;
  } else if (providedRepoRoot !== undefined) {
    // Only repoRoot provided, fetch isDirty
    repoRoot = providedRepoRoot;
    isDirty = await isWorkingDirDirty();
  } else if (providedIsDirty !== undefined) {
    // Only isDirty provided, fetch repoRoot
    repoRoot = await getRepoRoot();
    isDirty = providedIsDirty;
  } else {
    // Neither provided, fetch both in parallel
    [repoRoot, isDirty] = await Promise.all([
      getRepoRoot(),
      isWorkingDirDirty(),
    ]);
  }

  const git: GitInfo = {
    base: changeSet.base,
    head: changeSet.head,
    range: `${changeSet.base}..${changeSet.head}`,
    repoRoot,
    isDirty,
    mode,
  };

  const profile: ProfileInfo = {
    requested: requestedProfile,
    detected: detectedProfile,
    confidence: profileConfidence,
    reasons: profileReasons,
  };

  const skippedFiles = userSkippedFiles ?? [];
  const stats = calculateStats(changeSet, skippedFiles);

  const filtersObj: Filters = {
    defaultExcludes: DEFAULT_EXCLUDES,
    excludes: userFilters?.excludes ?? [],
    includes: userFilters?.includes ?? [],
    redact: userFilters?.redact ?? false,
    maxFileBytes: userFilters?.maxFileBytes ?? 1048576, // 1MB default
    maxDiffBytes: userFilters?.maxDiffBytes ?? 5242880, // 5MB default
    maxFindings: userFilters?.maxFindings,
  };

  // Build changeset info from meta-findings (before filtering them out)
  const changeset = buildChangesetInfo(findings);

  // Filter out meta-findings - they're now in the changeset structure
  const domainFindings = findings.filter(f => !isMetaFinding(f));

  // Aggregate categories (uses domain findings only)
  const categories = aggregateCategories(domainFindings, riskScore.factors);
  const byArea = buildSummaryByArea(categories);
  const highlights = buildHighlights(domainFindings);

  const summary = {
    byArea,
    highlights,
  };

  // Derive actions (uses all findings for completeness)
  const actions = deriveActions(findings, detectedProfile);

  const warnings = userWarnings ?? [];

  return {
    schemaVersion: "2.1",
    generatedAt: noTimestamp ? undefined : new Date().toISOString(),
    git,
    profile,
    stats,
    filters: filtersObj,
    summary,
    categories,
    changeset,
    risk: riskScore,
    findings: domainFindings,
    actions,
    skippedFiles,
    warnings,
  };
}
