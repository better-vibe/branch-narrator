/**
 * branch-narrator library exports.
 *
 * This module exports the core types and functions for programmatic use.
 */

// Core types and utilities
export * from "./core/types.js";
export * from "./core/change-set.js";
export * from "./core/errors.js";
export { runAnalyzersInParallel } from "./core/analyzer-runner.js";

// Export logger and sorting explicitly to avoid conflicts
export {
  configureLogger,
  getLoggerState,
  resetLogger,
  warn,
  info,
  debug,
  error,
} from "./core/logger.js";

export {
  normalizePath,
  comparePaths,
  sortRiskFlags,
  sortFindings,
  sortEvidence,
  sortRiskFlagEvidence,
  sortFilePaths,
  createSortedObject,
} from "./core/sorting.js";

// Git utilities
export { collectChangeSet, isGitRepo, refExists } from "./git/collector.js";
export * from "./git/parser.js";

// Analyzers
export * from "./analyzers/index.js";

// Profiles
export {
  detectProfile,
  detectProfileWithReasons,
  getProfile,
  hasSvelteKitDependency,
  isSvelteKitProject,
  resolveProfileName,
  sveltekitProfile,
} from "./profiles/index.js";
export type { ProfileDetectionResult } from "./profiles/index.js";

// Renderers
export { renderMarkdown } from "./render/markdown.js";
export { renderJson } from "./render/json.js";
export { computeRiskScore } from "./render/risk-score.js";

