/**
 * Astro profile - analyzers for Astro projects.
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
import { astroRoutesAnalyzer } from "../analyzers/astro-routes.js";
import { tailwindAnalyzer } from "../analyzers/tailwind.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";

/**
 * Astro profile with Astro-specific analyzers.
 */
export const astroProfile: Profile = {
  name: "astro",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    astroRoutesAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    tailwindAnalyzer,
    typescriptConfigAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
