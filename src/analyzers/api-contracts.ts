/**
 * API contract analyzer - detects API contract changes.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  APIContractChangeFinding,
} from "../core/types.js";

/**
 * Check if a file is an API contract file.
 */
function isAPIContractFile(path: string): boolean {
  return (
    path.includes("openapi") ||
    path.includes("swagger") ||
    path.endsWith(".proto") ||
    (path.includes("/api/") && (path.endsWith(".yaml") || path.endsWith(".yml") || path.endsWith(".json")))
  );
}

/**
 * Analyze API contract changes.
 */
export const analyzeAPIContracts: Analyzer = {
  name: "api-contracts",
  cacheScope: "files",
  filePatterns: [
    "**/openapi*.yaml",
    "**/openapi*.yml",
    "**/openapi*.json",
    "**/swagger*.yaml",
    "**/swagger*.yml",
    "**/swagger*.json",
    "*.proto",
    "**/*.proto",
    "**/api/*.yaml",
    "**/api/*.yml",
    "**/api/*.json",
  ],
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: APIContractChangeFinding[] = [];

    const contractFiles = changeSet.files
      .filter(f => isAPIContractFile(f.path))
      .map(f => f.path);

    if (contractFiles.length > 0) {
      findings.push({
        type: "api-contract-change",
        kind: "api-contract-change",
        category: "api",
        confidence: "high",
        evidence: [],
        files: contractFiles,
      });
    }

    return findings;
  },
};
