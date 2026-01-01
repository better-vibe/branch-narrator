/**
 * JSON facts renderer.
 */

import type { DiffMode, Finding, RenderContext, RiskScore } from "../core/types.js";

export interface FactsOutput {
  profile: string;
  riskScore: RiskScore;
  findings: Finding[];
}

export interface EnhancedFactsOutput {
  schemaVersion: string;
  mode: DiffMode;
  base: string | null;
  head: string | null;
  profile: string;
  riskScore: RiskScore;
  findings: Finding[];
  stats: {
    totalFindings: number;
    findingsByType: Record<string, number>;
  };
}

export interface RenderJsonOptions {
  mode: DiffMode;
  base: string | null;
  head: string | null;
  format?: "json" | "compact";
}

/**
 * Render findings as JSON output.
 */
export function renderJson(
  context: RenderContext,
  options?: RenderJsonOptions
): string {
  // If options not provided, use legacy format for backward compatibility
  if (!options) {
    const output: FactsOutput = {
      profile: context.profile,
      riskScore: context.riskScore,
      findings: context.findings,
    };
    return JSON.stringify(output, null, 2);
  }

  // Enhanced output with metadata
  const findingsByType = context.findings.reduce((acc, finding) => {
    acc[finding.type] = (acc[finding.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const output: EnhancedFactsOutput = {
    schemaVersion: "1.0",
    mode: options.mode,
    base: options.base,
    head: options.head,
    profile: context.profile,
    riskScore: context.riskScore,
    findings: context.findings,
    stats: {
      totalFindings: context.findings.length,
      findingsByType,
    },
  };

  // Compact format removes whitespace
  if (options.format === "compact") {
    return JSON.stringify(output);
  }

  return JSON.stringify(output, null, 2);
}

