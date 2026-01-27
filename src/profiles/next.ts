/**
 * Next.js profile - composes analyzers for Next.js App Router projects.
 */

import type { Profile } from "../core/types.js";
import {
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeSQLRisks,
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
  impactAnalyzer,
} from "../analyzers/index.js";
import { nextRoutesAnalyzer } from "../analyzers/next-routes.js";
import { tailwindAnalyzer } from "../analyzers/tailwind.js";

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
    impactAnalyzer,
    tailwindAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
