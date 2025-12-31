/**
 * JSON facts renderer.
 */

import type { Finding, RenderContext, RiskScore } from "../core/types.js";

export interface FactsOutput {
  profile: string;
  riskScore: RiskScore;
  findings: Finding[];
}

/**
 * Render findings as JSON output.
 */
export function renderJson(context: RenderContext): string {
  const output: FactsOutput = {
    profile: context.profile,
    riskScore: context.riskScore,
    findings: context.findings,
  };

  return JSON.stringify(output, null, 2);
}

