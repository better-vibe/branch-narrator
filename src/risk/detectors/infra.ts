/**
 * Infrastructure detectors (Docker, Terraform, K8s).
 */

import type { RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Check if a file is a Dockerfile.
 */
function isDockerfile(path: string): boolean {
  return path.startsWith("Dockerfile") || path.includes("/Dockerfile");
}

/**
 * Check if a file is a docker-compose file.
 */
function isDockerCompose(path: string): boolean {
  return path.startsWith("docker-compose") && (path.endsWith(".yml") || path.endsWith(".yaml"));
}

/**
 * Check if a file is a Terraform file.
 */
function isTerraformFile(path: string): boolean {
  return path.endsWith(".tf") || path.includes("terraform/");
}

/**
 * Check if a file is a Kubernetes manifest.
 */
function isK8sFile(path: string): boolean {
  return (
    path.includes("k8s/") ||
    path.includes("helm/") ||
    (path.includes("deployment") && (path.endsWith(".yml") || path.endsWith(".yaml")))
  );
}

/**
 * Detect Dockerfile changes.
 */
export const detectDockerfileChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const dockerFiles = changeSet.files.filter(f => isDockerfile(f.path) || isDockerCompose(f.path));

  if (dockerFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = dockerFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "infra.dockerfile_changed",
      category: "infra",
      score: 12,
      confidence: 0.85,
      title: "Docker configuration changed",
      summary: `${dockerFiles.length} Docker ${dockerFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Test Docker build locally",
        "Verify base image versions and security",
        "Check for exposed ports and volumes",
      ],
      effectiveScore: Math.round(12 * 0.85),
    });
  }

  return flags;
};

/**
 * Detect Terraform changes.
 */
export const detectTerraformChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const tfFiles = changeSet.files.filter(f => isTerraformFile(f.path));

  if (tfFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = tfFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "infra.terraform_changed",
      category: "infra",
      score: 15,
      confidence: 0.85,
      title: "Terraform configuration changed",
      summary: `${tfFiles.length} Terraform ${tfFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Run terraform plan to preview changes",
        "Review resource modifications carefully",
        "Ensure state is backed up before apply",
      ],
      effectiveScore: Math.round(15 * 0.85),
    });
  }

  return flags;
};

/**
 * Detect Kubernetes manifest changes.
 */
export const detectK8sManifestChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const k8sFiles = changeSet.files.filter(f => isK8sFile(f.path));

  if (k8sFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = k8sFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "infra.k8s_manifest_changed",
      category: "infra",
      score: 15,
      confidence: 0.8,
      title: "Kubernetes manifest changed",
      summary: `${k8sFiles.length} Kubernetes ${k8sFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Validate manifests with kubectl dry-run",
        "Check resource limits and requests",
        "Review RBAC and security policies",
      ],
      effectiveScore: Math.round(15 * 0.8),
    });
  }

  return flags;
};
