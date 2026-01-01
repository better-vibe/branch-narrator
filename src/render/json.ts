/**
 * JSON facts renderer.
 */

import type { Finding, RenderContext, RiskScore } from "../core/types.js";

export interface FactsOutput {
  profile: string;
  riskScore: RiskScore;
  findings: Finding[];
  findingsByType?: Record<string, number>;
}

/**
 * Aggregate findings by type.
 */
export function aggregateFindingsByType(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  
  for (const finding of findings) {
    const type = finding.type;
    counts[type] = (counts[type] || 0) + 1;
  }
  
  return counts;
}

/**
 * Validate FactsOutput schema.
 */
export function validateFactsOutput(data: unknown): data is FactsOutput {
  if (!data || typeof data !== "object") {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.profile !== "string") {
    return false;
  }
  
  if (!obj.riskScore || typeof obj.riskScore !== "object") {
    return false;
  }
  
  const riskScore = obj.riskScore as Record<string, unknown>;
  if (
    typeof riskScore.score !== "number" ||
    typeof riskScore.level !== "string" ||
    !Array.isArray(riskScore.evidenceBullets)
  ) {
    return false;
  }
  
  if (!Array.isArray(obj.findings)) {
    return false;
  }
  
  // Validate each finding has a type
  for (const finding of obj.findings) {
    if (!finding || typeof finding !== "object") {
      return false;
    }
    const f = finding as Record<string, unknown>;
    if (typeof f.type !== "string") {
      return false;
    }
  }
  
  // Check optional findingsByType
  if (obj.findingsByType !== undefined) {
    if (typeof obj.findingsByType !== "object" || obj.findingsByType === null) {
      return false;
    }
    const byType = obj.findingsByType as Record<string, unknown>;
    for (const value of Object.values(byType)) {
      if (typeof value !== "number") {
        return false;
      }
    }
  }
  
  return true;
}

export interface RenderJsonOptions {
  /** Include findings aggregated by type */
  includeFindingsByType?: boolean;
}

/**
 * Render findings as JSON output.
 */
export function renderJson(context: RenderContext, options?: RenderJsonOptions): string {
  const output: FactsOutput = {
    profile: context.profile,
    riskScore: context.riskScore,
    findings: context.findings,
  };
  
  if (options?.includeFindingsByType && context.findings.length > 0) {
    output.findingsByType = aggregateFindingsByType(context.findings);
  }

  return JSON.stringify(output, null, 2);
}

