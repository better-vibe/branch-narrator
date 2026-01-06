/**
 * SvelteKit profile - composes analyzers for SvelteKit projects.
 */

import type { Profile } from "../core/types.js";
import {
  cloudflareAnalyzer,
  dependencyAnalyzer,
  envVarAnalyzer,
  fileCategoryAnalyzer,
  fileSummaryAnalyzer,
  routeDetectorAnalyzer,
  securityFilesAnalyzer,
  supabaseAnalyzer,
  vitestAnalyzer,
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeTestGaps,
  analyzeSQLRisks,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
} from "../analyzers/index.js";

/**
 * SvelteKit profile with all relevant analyzers.
 */
export const sveltekitProfile: Profile = {
  name: "sveltekit",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    routeDetectorAnalyzer,
    supabaseAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
