/**
 * React profile - composes analyzers for React projects.
 */

import type { Profile } from "../core/types.js";
import {
  cloudflareAnalyzer,
  dependencyAnalyzer,
  envVarAnalyzer,
  fileCategoryAnalyzer,
  fileSummaryAnalyzer,
  reactRouterRoutesAnalyzer,
  securityFilesAnalyzer,
  vitestAnalyzer,
} from "../analyzers/index.js";

/**
 * React profile with all relevant analyzers.
 */
export const reactProfile: Profile = {
  name: "react",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    reactRouterRoutesAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
  ],
};
