/**
 * Large diff (churn) analyzer.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  LargeDiffFinding,
} from "../core/types.js";

/**
 * Analyze large diffs to detect high churn.
 */
export const analyzeLargeDiff: Analyzer = {
  name: "large-diff",
  cache: {},
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: LargeDiffFinding[] = [];

    const filesChanged = changeSet.files.length;
    let linesChanged = 0;

    for (const diff of changeSet.diffs) {
      for (const hunk of diff.hunks) {
        linesChanged += hunk.additions.length + hunk.deletions.length;
      }
    }

    // Trigger if more than 30 files or 1000 lines changed
    if (filesChanged > 30 || linesChanged > 1000) {
      findings.push({
        type: "large-diff",
        kind: "large-diff",
        category: "unknown", // No specific category for churn/quality metrics
        confidence: "high",
        evidence: [],
        filesChanged,
        linesChanged,
      });
    }

    return findings;
  },
};
