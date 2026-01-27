/**
 * Vite profile - composes analyzers for Vite-based projects.
 *
 * This profile is used for generic Vite projects that don't match
 * a more specific framework profile (React, Vue, Svelte, etc.).
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
  viteConfigAnalyzer,
} from "../analyzers/index.js";
import { tailwindAnalyzer } from "../analyzers/tailwind.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";

/**
 * Vite profile with all relevant analyzers.
 *
 * This profile is designed for Vite-based projects that use:
 * - Vite as the build tool
 * - Vitest for testing
 * - TypeScript
 * - Tailwind CSS (optional)
 *
 * It includes the vite-config analyzer to detect changes to
 * Vite configuration files and identify breaking changes.
 */
export const viteProfile: Profile = {
  name: "vite",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    viteConfigAnalyzer,
    tailwindAnalyzer,
    typescriptConfigAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
