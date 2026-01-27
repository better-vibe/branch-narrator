/**
 * Stencil profile definition.
 */

import type { Profile } from "../core/types.js";
import {
  fileSummaryAnalyzer,
  fileCategoryAnalyzer,
  dependencyAnalyzer,
  impactAnalyzer,
  stencilAnalyzer,
  envVarAnalyzer,
  cloudflareAnalyzer,
  vitestAnalyzer,
  securityFilesAnalyzer,
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeSQLRisks,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
} from "../analyzers/index.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";

export const stencilProfile: Profile = {
  name: "stencil",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    stencilAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    typescriptConfigAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
