/**
 * Angular profile - analyzers for Angular projects.
 */

import type { Profile } from "../core/types.js";
import {
  cloudflareAnalyzer,
  dependencyAnalyzer,
  envVarAnalyzer,
  fileCategoryAnalyzer,
  fileSummaryAnalyzer,
  securityFilesAnalyzer,
  vitestAnalyzer,
  impactAnalyzer,
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeTestGaps,
  analyzeSQLRisks,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
} from "../analyzers/index.js";
import { angularRoutesAnalyzer } from "../analyzers/angular-routes.js";
import { angularComponentsAnalyzer } from "../analyzers/angular-components.js";
import { tailwindAnalyzer } from "../analyzers/tailwind.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";
import { graphqlAnalyzer } from "../analyzers/graphql.js";

/**
 * Angular profile with Angular-specific analyzers.
 */
export const angularProfile: Profile = {
  name: "angular",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    angularRoutesAnalyzer,
    angularComponentsAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    tailwindAnalyzer,
    typescriptConfigAnalyzer,
    graphqlAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
