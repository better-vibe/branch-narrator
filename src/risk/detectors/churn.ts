/**
 * Code churn detector.
 */

import type { ChangeSet, RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Count total lines changed across all diffs.
 */
function countTotalLinesChanged(changeSet: ChangeSet): number {
  let total = 0;
  for (const diff of changeSet.diffs) {
    for (const hunk of diff.hunks) {
      total += hunk.additions.length + hunk.deletions.length;
    }
  }
  return total;
}

/**
 * Detect large diffs (high churn).
 */
export const detectLargeDiff: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  
  const filesChanged = changeSet.files.length;
  const linesChanged = countTotalLinesChanged(changeSet);

  const isLarge = filesChanged > 50 || linesChanged > 1500;

  if (isLarge) {
    const evidence: RiskFlagEvidence[] = [{
      file: "Overall changeset",
      lines: [
        `${filesChanged} files changed`,
        `~${linesChanged} lines changed`,
      ],
    }];

    flags.push({
      id: "churn.large_diff",
      category: "churn",
      score: 20,
      confidence: 0.9,
      title: "Large changeset detected",
      summary: `${filesChanged} files and ${linesChanged} lines changed`,
      evidence,
      suggestedChecks: [
        "Consider breaking into smaller PRs",
        "Review changes carefully due to size",
        "Ensure adequate testing coverage",
      ],
      effectiveScore: Math.round(20 * 0.9),
    });
  }

  return flags;
};
