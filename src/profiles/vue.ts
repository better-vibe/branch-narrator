/**
 * Vue.js / Nuxt profile - analyzers for Vue and Nuxt projects.
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
  analyzeSQLRisks,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
  drizzleAnalyzer,
  trpcRouterAnalyzer,
} from "../analyzers/index.js";
import { vueRoutesAnalyzer } from "../analyzers/vue-routes.js";
import { tailwindAnalyzer } from "../analyzers/tailwind.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";

/**
 * Vue/Nuxt profile with Vue-specific analyzers.
 */
export const vueProfile: Profile = {
  name: "vue",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    vueRoutesAnalyzer,
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
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
    drizzleAnalyzer,
    trpcRouterAnalyzer,
  ],
};
