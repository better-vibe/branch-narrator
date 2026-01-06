/**
 * Delta computation for risk-report --since feature.
 */

import type {
  RiskReport,
  RiskReportDelta,
  RiskFlag,
  FlagChange,
  ScopeMetadata,
} from "../../core/types.js";
import {
  loadJson,
  diffById,
  compareScopeMetadata,
  extractRiskReportScope,
} from "../../core/delta.js";
import { BranchNarratorError } from "../../core/errors.js";

/**
 * Options for computing risk report delta.
 */
export interface ComputeRiskReportDeltaOptions {
  sincePath: string;
  currentReport: RiskReport;
  mode: string;
  base: string | null;
  head: string | null;
  only: string[] | null;
  exclude: string[] | null;
  sinceStrict: boolean;
}

/**
 * Compute delta between current risk report and a previous risk report.
 */
export async function computeRiskReportDelta(
  options: ComputeRiskReportDeltaOptions
): Promise<RiskReportDelta> {
  const {
    sincePath,
    currentReport,
    mode,
    base,
    head,
    only,
    exclude,
    sinceStrict,
  } = options;

  // Load previous report
  let previousReport: RiskReport;
  try {
    previousReport = await loadJson(sincePath);
  } catch (error) {
    throw new BranchNarratorError(
      `Failed to load previous risk report from ${sincePath}: ${error}`,
      1
    );
  }

  // Validate it looks like a RiskReport
  if (!previousReport.schemaVersion || !previousReport.flags || previousReport.riskScore === undefined) {
    throw new BranchNarratorError(
      `File ${sincePath} does not appear to be a valid risk report output`,
      1
    );
  }

  // Extract version metadata
  const previousVersion = {
    toolVersion: "1.1.0", // TODO: Extract from package.json or build info
    schemaVersion: previousReport.schemaVersion,
  };

  const currentVersion = {
    toolVersion: "1.1.0", // TODO: Extract from package.json or build info
    schemaVersion: currentReport.schemaVersion,
  };

  // Build scope metadata for current run
  const currentScope: ScopeMetadata = {
    mode,
    base,
    head,
    only,
  };

  // Extract scope from previous run
  const previousScope = extractRiskReportScope(previousReport);

  // Compare scopes and generate warnings
  const warnings = compareScopeMetadata(previousScope, currentScope);

  // If strict mode and warnings exist, error out
  if (sinceStrict && warnings.length > 0) {
    throw new BranchNarratorError(
      `Scope mismatch detected (--since-strict): ${warnings.map(w => w.message).join("; ")}`,
      1
    );
  }

  // Compute delta for flags
  const { added, removed, changed } = diffById({
    beforeItems: previousReport.flags,
    afterItems: currentReport.flags,
  });

  // Build FlagChange objects
  const flagChanges: FlagChange[] = changed.map(c => ({
    flagId: c.id,
    before: c.before as RiskFlag,
    after: c.after as RiskFlag,
  }));

  // Compute risk score delta
  const riskScoreDelta = {
    from: previousReport.riskScore,
    to: currentReport.riskScore,
    delta: currentReport.riskScore - previousReport.riskScore,
  };

  // Build command metadata
  const commandArgs = ["--mode", mode];
  if (base) commandArgs.push("--base", base);
  if (head) commandArgs.push("--head", head);
  if (only) commandArgs.push("--only", only.join(","));
  if (exclude) commandArgs.push("--exclude", exclude.join(","));
  commandArgs.push("--since", sincePath);
  if (sinceStrict) commandArgs.push("--since-strict");

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    command: {
      name: "risk-report",
      args: commandArgs,
    },
    since: {
      path: sincePath,
      toolVersion: previousVersion.toolVersion,
      schemaVersion: previousVersion.schemaVersion,
    },
    current: currentVersion,
    scope: currentScope,
    delta: {
      riskScore: riskScoreDelta,
      flags: {
        added,
        removed,
        changed: flagChanges,
      },
    },
    summary: {
      flagAddedCount: added.length,
      flagRemovedCount: removed.length,
      flagChangedCount: flagChanges.length,
    },
  };
}
