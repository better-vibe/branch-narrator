/**
 * JSON facts renderer.
 *
 * Note: The canonical FactsOutput type is defined in core/types.ts
 * and used by the facts command builder. This renderer produces a
 * simplified JSON output for basic use cases.
 */

import type { RenderContext } from "../core/types.js";

/**
 * Render findings as JSON output.
 */
export function renderJson(context: RenderContext): string {
  const output = {
    profile: context.profile,
    riskScore: context.riskScore,
    findings: context.findings,
  };

  return JSON.stringify(output, null, 2);
}

