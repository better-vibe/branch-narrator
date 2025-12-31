/**
 * branch-narrator library exports.
 *
 * This module exports the core types and functions for programmatic use.
 */

// Core types
export * from "./core/types.js";
export * from "./core/change-set.js";
export * from "./core/errors.js";

// Git utilities
export { collectChangeSet, isGitRepo, refExists } from "./git/collector.js";
export * from "./git/parser.js";

// Analyzers
export * from "./analyzers/index.js";

// Profiles
export {
  detectProfile,
  getProfile,
  hasSvelteKitDependency,
  isSvelteKitProject,
  resolveProfileName,
  sveltekitProfile,
} from "./profiles/index.js";

// Renderers
export { renderMarkdown } from "./render/markdown.js";
export { renderJson } from "./render/json.js";
export { computeRiskScore } from "./render/risk-score.js";

