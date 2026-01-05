/**
 * Detector registry for risk-report command.
 */

import type { Detector } from "./types.js";
import {
  detectWorkflowPermissionsBroadened,
  detectPullRequestTarget,
  detectRemoteScriptDownload,
  detectCIPipelineChanged,
} from "./security-ci.js";
import {
  detectNewProdDependency,
  detectMajorBump,
  detectLockfileWithoutManifest,
} from "./deps.js";
import {
  detectMigrationsChanged,
  detectDestructiveSQL,
  detectRiskySchemaChange,
  detectUnscopedDataModification,
} from "./database.js";
import {
  detectDockerfileChanged,
  detectTerraformChanged,
  detectK8sManifestChanged,
} from "./infra.js";
import { detectAPIContractChanged } from "./api.js";
import { detectTestsChanged, detectPossibleTestGap } from "./tests.js";
import { detectLargeDiff } from "./churn.js";

/**
 * All detectors in execution order.
 */
export const ALL_DETECTORS: Detector[] = [
  // Security/CI
  detectWorkflowPermissionsBroadened,
  detectPullRequestTarget,
  detectRemoteScriptDownload,
  detectCIPipelineChanged,
  
  // Dependencies
  detectNewProdDependency,
  detectMajorBump,
  detectLockfileWithoutManifest,
  
  // Database
  detectMigrationsChanged,
  detectDestructiveSQL,
  detectRiskySchemaChange,
  detectUnscopedDataModification,
  
  // Infrastructure
  detectDockerfileChanged,
  detectTerraformChanged,
  detectK8sManifestChanged,
  
  // API
  detectAPIContractChanged,
  
  // Tests
  detectTestsChanged,
  detectPossibleTestGap,
  
  // Churn
  detectLargeDiff,
];

export * from "./types.js";
