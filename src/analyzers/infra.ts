/**
 * Infrastructure analyzer - detects infrastructure changes.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  InfraChangeFinding,
} from "../core/types.js";

/**
 * Analyze infrastructure file changes.
 */
export const analyzeInfra: Analyzer = {
  name: "infra",
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: InfraChangeFinding[] = [];

    // Group files by type
    const dockerfiles: string[] = [];
    const terraformFiles: string[] = [];
    const k8sFiles: string[] = [];

    for (const file of changeSet.files) {
      if (file.path.toLowerCase().includes("dockerfile")) {
        dockerfiles.push(file.path);
      } else if (file.path.endsWith(".tf") || file.path.endsWith(".tfvars")) {
        terraformFiles.push(file.path);
      } else if (
        file.path.includes("kubernetes/") ||
        file.path.includes("k8s/") ||
        (file.path.endsWith(".yaml") && (
          file.path.includes("deployment") ||
          file.path.includes("service") ||
          file.path.includes("ingress")
        ))
      ) {
        k8sFiles.push(file.path);
      }
    }

    if (dockerfiles.length > 0) {
      findings.push({
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [],
        infraType: "dockerfile",
        files: dockerfiles,
      });
    }

    if (terraformFiles.length > 0) {
      findings.push({
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [],
        infraType: "terraform",
        files: terraformFiles,
      });
    }

    if (k8sFiles.length > 0) {
      findings.push({
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [],
        infraType: "k8s",
        files: k8sFiles,
      });
    }

    return findings;
  },
};
