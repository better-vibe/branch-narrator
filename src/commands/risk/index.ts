/**
 * Risk report command.
 */

import type { ChangeSet, RiskFlag, RiskReport } from "../../core/types.js";
import { ALL_DETECTORS } from "./detectors/index.js";
import { shouldSkipFile } from "./exclusions.js";
import { redactLines } from "./redaction.js";
import { computeRiskReport, filterFlagsByCategory } from "./scoring.js";
import { sortRiskFlagEvidence } from "../../core/sorting.js";

/**
 * Options for generating risk report.
 */
export interface RiskReportOptions {
  only?: string[];
  exclude?: string[];
  maxEvidenceLines?: number;
  redact?: boolean;
  explainScore?: boolean;
}

/**
 * Generate risk report from change set.
 */
export function generateRiskReport(
  changeSet: ChangeSet,
  options: RiskReportOptions = {}
): RiskReport {
  const {
    only,
    exclude,
    maxEvidenceLines = 5,
    redact = false,
    explainScore = false,
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

  // Run all detectors
  let allFlags: RiskFlag[] = [];
  for (const detector of ALL_DETECTORS) {
    const flags = detector(changeSet);
    allFlags.push(...flags);
  }

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
    { explainScore }
  );
}

/**
 * Execute the risk-report command.
 * This is the standard command handler that follows the execute* naming convention.
 */
export function executeRiskReport(
  changeSet: ChangeSet,
  options: RiskReportOptions = {}
): RiskReport {
  return generateRiskReport(changeSet, options);
}

export * from "./detectors/index.js";
export * from "./exclusions.js";
export * from "./redaction.js";
export * from "./scoring.js";
export * from "./renderers.js";
