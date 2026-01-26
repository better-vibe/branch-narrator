/**
 * Risk report command.
 */

import type { ChangeSet, DiffMode, ProfileName, RiskFlag, RiskReport } from "../../core/types.js";
import { shouldSkipFile } from "./exclusions.js";
import { redactLines } from "./redaction.js";
import { computeRiskReport, filterFlagsByCategory } from "./scoring.js";
import { sortRiskFlagEvidence } from "../../core/sorting.js";
import { getProfile, resolveProfileName } from "../../profiles/index.js";
import { assignFindingId } from "../../core/ids.js";
import { findingsToFlags } from "./findings-to-flags.js";
import { runAnalyzersIncremental } from "../../core/analyzer-runner.js";

/**
 * Options for generating risk report.
 */
export interface RiskReportOptions {
  only?: string[];
  exclude?: string[];
  maxEvidenceLines?: number;
  redact?: boolean;
  explainScore?: boolean;
  noTimestamp?: boolean;
  profile?: ProfileName;
  cwd?: string;
  /** Original CLI mode used to generate this output */
  mode?: DiffMode;
  /** Skip caching */
  noCache?: boolean;
}

/**
 * Generate risk report from change set.
 */
export async function generateRiskReport(
  changeSet: ChangeSet,
  options: RiskReportOptions = {}
): Promise<RiskReport> {
  const {
    only,
    exclude,
    maxEvidenceLines = 5,
    redact = false,
    explainScore = false,
    noTimestamp = false,
    profile: requestedProfile = "auto",
    cwd = process.cwd(),
    mode,
    noCache = false,
  } = options;

  // Track skipped files
  const skippedFiles: Array<{ file: string; reason: string }> = [];

  // Check for skipped files in changeset
  for (const file of changeSet.files) {
    const skipCheck = shouldSkipFile(file.path);
    if (skipCheck.skip) {
      skippedFiles.push({
        file: file.path,
        reason: skipCheck.reason || "excluded",
      });
    }
  }

  // Run analysis pipeline to get findings
  const profileName = resolveProfileName(requestedProfile, changeSet, cwd);
  const profile = getProfile(profileName);

  // Run analyzers with incremental caching for better performance
  const rawFindings = await runAnalyzersIncremental({
    changeSet,
    analyzers: profile.analyzers,
    profile: profileName,
    mode: mode || "branch",
    noCache,
    cwd,
  });

  // Assign findingIds to all findings
  const findings = rawFindings.map(assignFindingId);

  // Convert findings to risk flags
  let allFlags: RiskFlag[] = findingsToFlags(findings);

  // Filter by category if requested
  allFlags = filterFlagsByCategory(allFlags, only, exclude);

  // Apply redaction and evidence line limits, and sort evidence
  if (redact || maxEvidenceLines !== 5) {
    allFlags = allFlags.map(flag => ({
      ...flag,
      evidence: sortRiskFlagEvidence(flag.evidence.map(ev => ({
        ...ev,
        lines: redact
          ? redactLines(ev.lines.slice(0, maxEvidenceLines))
          : ev.lines.slice(0, maxEvidenceLines),
      }))),
    }));
  } else {
    // Sort evidence even when not redacting or limiting lines
    allFlags = allFlags.map(flag => ({
      ...flag,
      evidence: sortRiskFlagEvidence(flag.evidence),
    }));
  }

  // Compute report
  return computeRiskReport(
    changeSet.base,
    changeSet.head,
    allFlags,
    skippedFiles,
    { explainScore, noTimestamp, mode, only, exclude }
  );
}

/**
 * Execute the risk-report command.
 * This is the standard command handler that follows the execute* naming convention.
 */
export async function executeRiskReport(
  changeSet: ChangeSet,
  options: RiskReportOptions = {}
): Promise<RiskReport> {
  return await generateRiskReport(changeSet, options);
}

export * from "./exclusions.js";
export * from "./redaction.js";
export * from "./scoring.js";
export * from "./renderers.js";
export * from "./findings-to-flags.js";
export { computeRiskReportDelta, type ComputeRiskReportDeltaOptions } from "./delta.js";
