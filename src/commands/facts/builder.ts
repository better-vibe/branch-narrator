/**
 * Facts output builder - assembles complete agent-grade facts.
 */

import { execa } from "execa";
import type {
  ChangeSet,
  FactsOutput,
  Finding,
  Filters,
  GitInfo,
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
}

/**
 * Get git repository root.
 */
async function getRepoRoot(): Promise<string> {
  try {
    const result = await execa("git", [
      "rev-parse",
      "--show-toplevel",
    ]);
    return result.stdout.trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Check if working directory is dirty.
 */
async function isWorkingDirDirty(): Promise<boolean> {
  try {
    const result = await execa("git", [
      "diff-index",
      "--quiet",
      "HEAD",
      "--",
    ], { reject: false });
    return result.exitCode !== 0;
  } catch {
    return false;
  }
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
  } = options;

  // Apply redaction if requested
  let findings = rawFindings;
  if (userFilters?.redact) {
    findings = rawFindings.map(finding => ({
      ...finding,
      evidence: sortEvidence(finding.evidence.map(redactEvidence)),
    }));
  } else {
    // Sort evidence even when not redacting
    findings = rawFindings.map(finding => ({
      ...finding,
      evidence: sortEvidence(finding.evidence),
    }));
  }

  // Sort findings deterministically
  findings = sortFindingsDeterministically(findings);

  // Apply max findings limit
  if (userFilters?.maxFindings && findings.length > userFilters.maxFindings) {
    findings = findings.slice(0, userFilters.maxFindings);
  }

  // Get git info
  const repoRoot = await getRepoRoot();
  const isDirty = await isWorkingDirDirty();

  const git: GitInfo = {
    base: changeSet.base,
    head: changeSet.head,
    range: `${changeSet.base}..${changeSet.head}`,
    repoRoot,
    isDirty,
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

  // Aggregate categories
  const categories = aggregateCategories(findings, riskScore.factors);
  const byArea = buildSummaryByArea(categories);
  const highlights = buildHighlights(findings);

  const summary = {
    byArea,
    highlights,
  };

  // Derive actions
  const actions = deriveActions(findings, detectedProfile);

  const warnings = userWarnings ?? [];

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    git,
    profile,
    stats,
    filters: filtersObj,
    summary,
    categories,
    risk: riskScore,
    findings,
    actions,
    skippedFiles,
    warnings,
  };
}
