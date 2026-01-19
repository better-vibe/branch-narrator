/**
 * Python profile - analyzers for Python projects.
 *
 * Supports:
 * - FastAPI, Django, Flask web frameworks
 * - Alembic, Django migrations
 * - pyproject.toml, setup.py, requirements.txt
 * - pytest, mypy, ruff configuration
 */

import type { Profile } from "../core/types.js";
import {
  fileSummaryAnalyzer,
  fileCategoryAnalyzer,
  envVarAnalyzer,
  securityFilesAnalyzer,
  impactAnalyzer,
  analyzeLargeDiff,
  analyzeLockfiles,
  analyzeTestGaps,
  analyzeSQLRisks,
  analyzeCIWorkflows,
  analyzeInfra,
  analyzeAPIContracts,
  pythonDependenciesAnalyzer,
  pythonRoutesAnalyzer,
  pythonMigrationsAnalyzer,
  pythonConfigAnalyzer,
} from "../analyzers/index.js";

/**
 * Python profile with Python-specific analyzers.
 */
export const pythonProfile: Profile = {
  name: "python",
  analyzers: [
    // Core analyzers
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,

    // Python-specific analyzers
    pythonDependenciesAnalyzer,
    pythonRoutesAnalyzer,
    pythonMigrationsAnalyzer,
    pythonConfigAnalyzer,

    // General analyzers that apply to Python projects
    envVarAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
