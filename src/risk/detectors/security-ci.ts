/**
 * Security and CI workflow detectors.
 */

import type { ChangeSet, RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Extract evidence lines from hunks, limited by maxLines.
 */
function extractEvidenceLines(
  content: string,
  maxLines: number = 5
): string[] {
  const lines = content.split("\n")
    .filter(line => line.startsWith("+") || line.startsWith("-"))
    .map(line => line.substring(1).trim())
    .filter(Boolean);
  return lines.slice(0, maxLines);
}

/**
 * Check if a file is a CI workflow file.
 */
function isCIFile(path: string): boolean {
  return (
    (path.includes(".github/workflows/") && (path.endsWith(".yml") || path.endsWith(".yaml"))) ||
    path === ".gitlab-ci.yml" ||
    path === "Jenkinsfile" ||
    path === "azure-pipelines.yml"
  );
}

/**
 * Detect broadened workflow permissions.
 */
export const detectWorkflowPermissionsBroadened: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const writePermissions = /permissions:\s*\n[^\n]*\s+(contents|id-token|actions|packages|deployments|security-events):\s*write/gi;

  for (const diff of changeSet.diffs) {
    if (!isCIFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions.join("\n");
      if (writePermissions.test(addedLines)) {
        const evidence: RiskFlagEvidence[] = [{
          file: diff.path,
          hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          lines: extractEvidenceLines(hunk.content),
        }];

        flags.push({
          id: "security.workflow_permissions_broadened",
          category: "security",
          score: 35,
          confidence: 0.9,
          title: "Workflow permissions broadened",
          summary: `Workflow ${diff.path} has broadened permissions (write access)`,
          evidence,
          suggestedChecks: [
            "Review if write permissions are necessary",
            "Ensure principle of least privilege",
            "Check if GITHUB_TOKEN usage is secure",
          ],
          effectiveScore: Math.round(35 * 0.9),
        });
        break; // One flag per file
      }
    }
  }

  return flags;
};

/**
 * Detect use of pull_request_target.
 */
export const detectPullRequestTarget: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const prTargetPattern = /pull_request_target/i;

  for (const diff of changeSet.diffs) {
    if (!isCIFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions.join("\n");
      if (prTargetPattern.test(addedLines)) {
        const evidence: RiskFlagEvidence[] = [{
          file: diff.path,
          hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          lines: extractEvidenceLines(hunk.content),
        }];

        flags.push({
          id: "security.workflow_uses_pull_request_target",
          category: "security",
          score: 40,
          confidence: 0.9,
          title: "Workflow uses pull_request_target",
          summary: `Workflow ${diff.path} uses pull_request_target event (can expose secrets)`,
          evidence,
          suggestedChecks: [
            "Ensure no untrusted code is executed in this context",
            "Review if pull_request_target is necessary (vs pull_request)",
            "Verify secrets are not exposed to PR authors",
          ],
          effectiveScore: Math.round(40 * 0.9),
        });
        break;
      }
    }
  }

  return flags;
};

/**
 * Detect downloading remote scripts.
 */
export const detectRemoteScriptDownload: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const downloadPattern = /(curl|wget)\s+[^\s]+\s*\|\s*(sh|bash)/gi;

  for (const diff of changeSet.diffs) {
    if (!isCIFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions.join("\n");
      if (downloadPattern.test(addedLines)) {
        const evidence: RiskFlagEvidence[] = [{
          file: diff.path,
          hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          lines: extractEvidenceLines(hunk.content),
        }];

        flags.push({
          id: "security.workflow_downloads_remote_script",
          category: "security",
          score: 45,
          confidence: 0.85,
          title: "Workflow downloads and executes remote scripts",
          summary: `Workflow ${diff.path} downloads and pipes to shell (supply chain risk)`,
          evidence,
          suggestedChecks: [
            "Pin script sources to specific commit SHAs",
            "Verify script integrity with checksums",
            "Consider vendoring the script instead",
          ],
          effectiveScore: Math.round(45 * 0.85),
        });
        break;
      }
    }
  }

  return flags;
};

/**
 * Detect any CI pipeline changes.
 */
export const detectCIPipelineChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const changedCIFiles = changeSet.files.filter(f => isCIFile(f.path));

  if (changedCIFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = changedCIFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}: ${f.path}`],
    }));

    flags.push({
      id: "ci.pipeline_changed",
      category: "ci",
      score: 10,
      confidence: 0.8,
      title: "CI/CD pipeline configuration changed",
      summary: `${changedCIFiles.length} CI/CD file(s) changed`,
      evidence,
      suggestedChecks: [
        "Review CI/CD changes carefully",
        "Test pipeline changes in a branch",
      ],
      effectiveScore: Math.round(10 * 0.8),
    });
  }

  return flags;
};
