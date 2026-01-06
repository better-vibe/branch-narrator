/**
 * Facts command - builds agent-grade facts output.
 */

import type { BuildFactsOptions } from "./builder.js";
import { buildFacts } from "./builder.js";

export { buildFacts, type BuildFactsOptions } from "./builder.js";
export { aggregateCategories, buildSummaryByArea } from "./categories.js";
export { deriveActions } from "./actions.js";
export { computeFactsDelta, type ComputeFactsDeltaOptions } from "./delta.js";

/**
 * Execute the facts command.
 * This is the standard command handler that follows the execute* naming convention.
 */
export async function executeFacts(options: BuildFactsOptions) {
  return buildFacts(options);
}
