/**
 * CI workflow analyzer - detects risky CI/CD patterns.
 */

import type {
  Analyzer,
  ChangeSet,
  CIWorkflowFinding,
  Finding,
} from "../core/types.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";

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
 * Analyze CI workflows for risky patterns.
 */
export const analyzeCIWorkflows: Analyzer = {
  name: "ci-workflows",
  cacheScope: "files",
  filePatterns: [
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    "azure-pipelines.yml",
    ".circleci/config.yml",
  ],
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: CIWorkflowFinding[] = [];
    const seenFiles = new Set<string>();

    for (const diff of changeSet.diffs) {
      if (!isCIFile(diff.path)) continue;

      let hasPermissions = false;
      let hasPullRequestTarget = false;
      let hasRemoteScript = false;

      for (const hunk of diff.hunks) {
        const addedLines = hunk.additions.join("\n");

        // Check for broadened permissions (supports inline and multi-line YAML)
        const writePermissions = /permissions:[\s\S]{0,500}?\b(contents|id-token|actions|packages|deployments|security-events)\b\s*:\s*write/gi;
        if (!hasPermissions && writePermissions.test(addedLines)) {
          hasPermissions = true;
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "ci-workflow",
            kind: "ci-workflow",
            category: "ci",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "permissions_broadened",
            details: "Workflow has broadened permissions (write access)",
          });
        }

        // Check for pull_request_target
        const prTargetPattern = /pull_request_target/i;
        if (!hasPullRequestTarget && prTargetPattern.test(addedLines)) {
          hasPullRequestTarget = true;
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "ci-workflow",
            kind: "ci-workflow",
            category: "ci",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "pull_request_target",
            details: "Workflow uses pull_request_target event (can expose secrets)",
          });
        }

        // Check for remote script download
        const downloadPattern = /(curl|wget)\s+[^\s]+\s*\|\s*(sh|bash)/gi;
        if (!hasRemoteScript && downloadPattern.test(addedLines)) {
          hasRemoteScript = true;
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "ci-workflow",
            kind: "ci-workflow",
            category: "ci",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "remote_script_download",
            details: "Workflow downloads and pipes to shell (supply chain risk)",
          });
        }
      }

      // General pipeline change (one per file)
      if (!seenFiles.has(diff.path) && diff.hunks.length > 0) {
        seenFiles.add(diff.path);
        const excerpt = extractRepresentativeExcerpt(diff.hunks[0].additions, 150);
        findings.push({
          type: "ci-workflow",
          kind: "ci-workflow",
          category: "ci",
          confidence: "medium",
          evidence: [
            createEvidence(diff.path, excerpt),
          ],
          file: diff.path,
          riskType: "pipeline_changed",
          details: "CI/CD pipeline configuration modified",
        });
      }
    }

    return findings;
  },
};
