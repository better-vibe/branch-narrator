/**
 * API contract change detectors (OpenAPI, GraphQL, Proto).
 */

import type { RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Check if a file is an API contract file.
 */
function isAPIContractFile(path: string): boolean {
  return (
    path.includes("openapi") ||
    path.includes("swagger") ||
    path.includes("asyncapi") ||
    path.endsWith("schema.graphql") ||
    path.endsWith(".proto")
  );
}

/**
 * Detect API contract changes.
 */
export const detectAPIContractChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const apiFiles = changeSet.files.filter(f => isAPIContractFile(f.path));

  if (apiFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = apiFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "api.contract_changed",
      category: "api",
      score: 18,
      confidence: 0.85,
      title: "API contract changed",
      summary: `${apiFiles.length} API contract ${apiFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Check for breaking changes in API schema",
        "Validate schema with API validators",
        "Update API documentation",
        "Consider API versioning strategy",
      ],
      effectiveScore: Math.round(18 * 0.85),
    });
  }

  return flags;
};
