/**
 * Python configuration analyzer - detects changes to Python configuration files.
 *
 * Supports:
 * - pyproject.toml (modern Python config, PEP 518/621)
 * - setup.cfg (setuptools config)
 * - tox.ini (test environment config)
 * - pytest.ini / conftest.py (pytest config)
 * - mypy.ini / .mypy.ini (type checking config)
 * - .flake8 / .pylintrc (linting config)
 * - .pre-commit-config.yaml (pre-commit hooks)
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  PythonConfigFinding,
} from "../core/types.js";

// Python config file patterns and their types
const CONFIG_PATTERNS: Array<{ pattern: RegExp; configType: string; category: string }> = [
  // Build/Package config
  { pattern: /^pyproject\.toml$/, configType: "pyproject", category: "build" },
  { pattern: /^setup\.cfg$/, configType: "setup", category: "build" },
  { pattern: /^setup\.py$/, configType: "setup", category: "build" },
  { pattern: /^MANIFEST\.in$/, configType: "manifest", category: "build" },

  // Test config
  { pattern: /^tox\.ini$/, configType: "tox", category: "testing" },
  { pattern: /^pytest\.ini$/, configType: "pytest", category: "testing" },
  { pattern: /^conftest\.py$/, configType: "pytest", category: "testing" },
  { pattern: /^\.coveragerc$/, configType: "coverage", category: "testing" },
  { pattern: /^\.noxfile\.py$/, configType: "nox", category: "testing" },

  // Type checking config
  { pattern: /^\.?mypy\.ini$/, configType: "mypy", category: "typing" },
  { pattern: /^pyrightconfig\.json$/, configType: "pyright", category: "typing" },

  // Linting config
  { pattern: /^\.flake8$/, configType: "flake8", category: "linting" },
  { pattern: /^\.pylintrc$/, configType: "pylint", category: "linting" },
  { pattern: /^\.ruff\.toml$/, configType: "ruff", category: "linting" },
  { pattern: /^ruff\.toml$/, configType: "ruff", category: "linting" },
  { pattern: /^\.isort\.cfg$/, configType: "isort", category: "linting" },
  { pattern: /^\.bandit$/, configType: "bandit", category: "security" },

  // Formatting config
  { pattern: /^\.?black$/, configType: "black", category: "formatting" },
  { pattern: /^\.editorconfig$/, configType: "editorconfig", category: "formatting" },

  // Pre-commit config
  { pattern: /^\.pre-commit-config\.yaml$/, configType: "pre-commit", category: "hooks" },

  // Environment config
  { pattern: /^\.python-version$/, configType: "python-version", category: "environment" },
  { pattern: /^runtime\.txt$/, configType: "runtime", category: "environment" },
];

// Breaking change patterns in pyproject.toml
const PYPROJECT_BREAKING_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /python\s*=\s*["'][<>=!~]+\s*3\./i, description: "Python version constraint changed" },
  { pattern: /requires-python\s*=\s*["'][<>=!~]+/i, description: "requires-python changed" },
  { pattern: /\[tool\.poetry\.dependencies\]/i, description: "Poetry dependencies section changed" },
  { pattern: /\[project\.dependencies\]/i, description: "Project dependencies section changed" },
  { pattern: /\[build-system\]/i, description: "Build system configuration changed" },
  { pattern: /\[project\.scripts\]/i, description: "CLI scripts changed" },
  { pattern: /\[project\.entry-points\]/i, description: "Entry points changed" },
];

// Sections that indicate potential breaking changes when modified
const BREAKING_SECTIONS = [
  "[project]",
  "[tool.poetry]",
  "[build-system]",
  "[project.scripts]",
  "[project.entry-points]",
  "[project.optional-dependencies]",
];

/**
 * Check if a path is a Python config file.
 */
export function isPythonConfigFile(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return CONFIG_PATTERNS.some(({ pattern }) => pattern.test(fileName));
}

/**
 * Get config file info.
 */
export function getConfigInfo(path: string): { configType: string; category: string } | null {
  const fileName = path.split("/").pop() ?? "";
  for (const { pattern, configType, category } of CONFIG_PATTERNS) {
    if (pattern.test(fileName)) {
      return { configType, category };
    }
  }
  return null;
}

/**
 * Detect potentially breaking changes in pyproject.toml.
 */
function detectBreakingChanges(content: string): string[] {
  const breakingReasons: string[] = [];

  for (const { pattern, description } of PYPROJECT_BREAKING_PATTERNS) {
    if (pattern.test(content)) {
      breakingReasons.push(description);
    }
  }

  // Check for breaking sections
  for (const section of BREAKING_SECTIONS) {
    if (content.includes(section)) {
      // Only add if not already covered by more specific pattern
      const sectionDesc = `${section} section modified`;
      if (!breakingReasons.some(r => r.includes(section))) {
        breakingReasons.push(sectionDesc);
      }
    }
  }

  return breakingReasons;
}

/**
 * Extract affected sections from TOML/INI content.
 */
function extractAffectedSections(content: string): string[] {
  const sections: string[] = [];
  const sectionPattern = /^\s*\[([^\]]+)\]/gm;

  let match;
  while ((match = sectionPattern.exec(content)) !== null) {
    const section = match[1].trim();
    if (!sections.includes(section)) {
      sections.push(section);
    }
  }

  return sections;
}

export const pythonConfigAnalyzer: Analyzer = {
  name: "python-config",
  cacheScope: "files",
  filePatterns: [
    "pyproject.toml",
    "setup.cfg",
    "setup.py",
    "tox.ini",
    "pytest.ini",
    "conftest.py",
    ".mypy.ini",
    "mypy.ini",
    ".flake8",
    ".pylintrc",
    ".ruff.toml",
    "ruff.toml",
    ".pre-commit-config.yaml",
    ".python-version",
  ],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      const configInfo = getConfigInfo(file.path);
      if (!configInfo) {
        continue;
      }

      const diff = changeSet.diffs.find(d => d.path === file.path);
      const additions = diff ? getAdditions(diff) : [];
      const content = additions.join("\n");

      // Extract evidence
      const evidence = [];
      if (additions.length > 0) {
        const excerpt = extractRepresentativeExcerpt(additions);
        if (excerpt) {
          evidence.push(createEvidence(file.path, excerpt));
        }
      }

      // Detect breaking changes for pyproject.toml
      let isBreaking = false;
      let breakingReasons: string[] = [];
      if (configInfo.configType === "pyproject") {
        breakingReasons = detectBreakingChanges(content);
        isBreaking = breakingReasons.length > 0;
      }

      // Extract affected sections
      const affectedSections = extractAffectedSections(content);

      const finding: PythonConfigFinding = {
        type: "python-config",
        kind: "python-config",
        category: "config_env",
        confidence: "high",
        evidence,
        file: file.path,
        status: file.status,
        configType: configInfo.configType,
        configCategory: configInfo.category,
        isBreaking,
        affectedSections,
        breakingReasons,
      };

      findings.push(finding);
    }

    return findings;
  },
};
