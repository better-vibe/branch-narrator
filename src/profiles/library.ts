/**
 * Library profile - analyzers for npm package/library development.
 *
 * This profile focuses on API surface changes, breaking changes detection,
 * and package metadata that matters for library consumers.
 */

import type { Profile } from "../core/types.js";
import {
  dependencyAnalyzer,
  fileCategoryAnalyzer,
  fileSummaryAnalyzer,
  vitestAnalyzer,
  impactAnalyzer,
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeCIWorkflows,
  analyzeAPIContracts,
  drizzleAnalyzer,
} from "../analyzers/index.js";
import { packageExportsAnalyzer } from "../analyzers/package-exports.js";
import { typescriptConfigAnalyzer } from "../analyzers/typescript-config.js";
import { monorepoAnalyzer } from "../analyzers/monorepo.js";

/**
 * Library/Package profile with analyzers focused on API surface and breaking changes.
 */
export const libraryProfile: Profile = {
  name: "library",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    packageExportsAnalyzer,
    typescriptConfigAnalyzer,
    dependencyAnalyzer,
    vitestAnalyzer,
    impactAnalyzer,
    monorepoAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeCIWorkflows,
    analyzeAPIContracts,
    drizzleAnalyzer,
  ],
};
