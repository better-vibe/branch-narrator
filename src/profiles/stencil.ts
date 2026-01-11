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
} from "../analyzers/index.js";

export const stencilProfile: Profile = {
  name: "stencil",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    dependencyAnalyzer,
    impactAnalyzer,
    stencilAnalyzer,
  ],
};
