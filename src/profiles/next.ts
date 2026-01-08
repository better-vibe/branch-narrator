/**
 * Next.js profile - composes analyzers for Next.js App Router projects.
 */

import type { Profile } from "../core/types.js";
import {
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeTestGaps,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
  cloudflareAnalyzer,
  dependencyAnalyzer,
  envVarAnalyzer,
  fileCategoryAnalyzer,
  fileSummaryAnalyzer,
  securityFilesAnalyzer,
  vitestAnalyzer,
} from "../analyzers/index.js";
import { nextRoutesAnalyzer } from "../analyzers/next-routes.js";

/**
 * Next.js profile with all relevant analyzers for App Router projects.
 */
export const nextProfile: Profile = {
  name: "next",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    nextRoutesAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
