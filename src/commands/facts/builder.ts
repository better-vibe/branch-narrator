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

  return {
    files,
    byCategory,
    categorySummary,
    warnings,
  };
}

/**
 * Build highlights from findings.
 */
function buildHighlights(findings: Finding[]): string[] {
  const highlights: string[] = [];

  const routeChanges = findings.filter(f => f.type === "route-change");
  if (routeChanges.length > 0) {
    highlights.push(`${routeChanges.length} route(s) changed`);
  }

  const dbMigrations = findings.filter(f => f.type === "db-migration");
  if (dbMigrations.length > 0) {
    const highRisk = dbMigrations.some(m => m.risk === "high");
    highlights.push(
      highRisk
        ? "Database migrations (HIGH RISK)"
        : "Database migrations"
    );
  }

  const depChanges = findings.filter(f => f.type === "dependency-change");
  const majorChanges = depChanges.filter(d => d.impact === "major");
  if (majorChanges.length > 0) {
    highlights.push(`${majorChanges.length} major dependency update(s)`);
  }

  const envVars = findings.filter(f => f.type === "env-var");
  if (envVars.length > 0) {
    highlights.push(`${envVars.length} new environment variable(s)`);
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
    schemaVersion: "2.0",
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
