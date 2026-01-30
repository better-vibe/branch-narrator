/**
 * Linter configuration change detector.
 *
 * Detects changes to ESLint, Biome, Prettier, Stylelint, and oxlint
 * configuration files and identifies potentially breaking changes.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  LinterConfigFinding,
  LinterTool,
  Confidence,
} from "../core/types.js";

// Linter config patterns by tool
const CONFIG_PATTERNS: Record<LinterTool, RegExp[]> = {
  eslint: [
    /^\.eslintrc(\.(js|cjs|mjs|json|yml|yaml))?$/,
    /^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/,
    /^\.eslintignore$/,
  ],
  biome: [/^biome\.(json|jsonc)$/],
  prettier: [
    /^\.prettierrc(\.(js|cjs|mjs|json|yml|yaml|toml))?$/,
    /^prettier\.config\.(js|mjs|cjs|ts)$/,
    /^\.prettierignore$/,
  ],
  stylelint: [
    /^\.stylelintrc(\.(js|cjs|mjs|json|yml|yaml))?$/,
    /^stylelint\.config\.(js|mjs|cjs|ts)$/,
  ],
  oxlint: [/^\.oxlintrc\.json$/, /^oxlint\.json$/],
};

// Critical sections per tool
const CRITICAL_SECTIONS: Record<LinterTool, string[]> = {
  eslint: ["rules", "extends", "plugins", "parser", "parserOptions", "overrides", "ignorePatterns"],
  biome: ["linter", "formatter", "organizeImports", "javascript", "typescript"],
  prettier: ["tabWidth", "singleQuote", "trailingComma", "semi", "printWidth", "plugins"],
  stylelint: ["rules", "extends", "plugins", "overrides"],
  oxlint: ["rules", "plugins", "settings"],
};

// Breaking change patterns per tool
const BREAKING_PATTERNS: Record<LinterTool, Array<{ pattern: RegExp; reason: string }>> = {
  eslint: [
    { pattern: /["']?parser["']?\s*[:=]/, reason: "Parser changed" },
    { pattern: /["']?extends["']?\s*[:=\[]/, reason: "Extends configuration changed" },
    { pattern: /["']?plugins["']?\s*[:=\[]/, reason: "Plugin configuration changed" },
    { pattern: /"error"|"warn"|"off"|[012]/, reason: "Rule severity changed" },
  ],
  biome: [
    { pattern: /["']?linter["']?\s*[:=\{]/, reason: "Linter configuration changed" },
    { pattern: /["']?formatter["']?\s*[:=\{]/, reason: "Formatter configuration changed" },
  ],
  prettier: [
    { pattern: /["']?tabWidth["']?\s*[:=]/, reason: "Tab width changed" },
    { pattern: /["']?singleQuote["']?\s*[:=]/, reason: "Quote style changed" },
    { pattern: /["']?semi["']?\s*[:=]/, reason: "Semicolon preference changed" },
    { pattern: /["']?plugins["']?\s*[:=\[]/, reason: "Prettier plugins changed" },
  ],
  stylelint: [
    { pattern: /["']?rules["']?\s*[:=\{]/, reason: "Stylelint rules changed" },
  ],
  oxlint: [
    { pattern: /["']?rules["']?\s*[:=\{]/, reason: "Lint rules changed" },
  ],
};

/**
 * Detect which linter tool a file belongs to.
 */
export function detectLinterTool(path: string): LinterTool | null {
  for (const [tool, patterns] of Object.entries(CONFIG_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(path))) {
      return tool as LinterTool;
    }
  }
  return null;
}

/**
 * Extract affected sections from diff content.
 */
function extractAffectedSections(content: string[], tool: LinterTool): string[] {
  const criticalFields = CRITICAL_SECTIONS[tool] || [];
  const affected: string[] = [];
  const fullContent = content.join("\n");

  for (const field of criticalFields) {
    const pattern = new RegExp(`["']?${field}["']?\\s*[:{[]`, "i");
    if (pattern.test(fullContent)) {
      affected.push(field);
    }
  }

  return affected;
}

/**
 * Detect breaking changes for a specific tool.
 */
function detectBreakingChanges(
  tool: LinterTool,
  _additions: string[],
  deletions: string[]
): string[] {
  const reasons: string[] = [];
  const patterns = BREAKING_PATTERNS[tool] || [];
  const deletedContent = deletions.join("\n");

  for (const { pattern, reason } of patterns) {
    if (pattern.test(deletedContent)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

export const linterConfigAnalyzer: Analyzer = {
  name: "linter-config",
  cache: {
    includeGlobs: [
      "**/.eslintrc*", "**/eslint.config.*",
      "**/biome.json*",
      "**/.prettierrc*", "**/prettier.config.*",
      "**/.stylelintrc*", "**/stylelint.config.*",
      "**/.oxlintrc*", "**/oxlint.json",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const tool = detectLinterTool(diff.path);

      if (!tool) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);
      const allLines = [...additions, ...deletions];

      const affectedSections = extractAffectedSections(allLines, tool);
      const breakingReasons = detectBreakingChanges(tool, additions, deletions);
      const isBreaking = breakingReasons.length > 0;

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const confidence: Confidence = isBreaking ? "high" : "medium";

      const finding: LinterConfigFinding = {
        type: "linter-config",
        kind: "linter-config",
        category: "quality",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        tool,
        isBreaking,
        affectedSections,
        breakingReasons,
      };

      findings.push(finding);
    }

    return findings;
  },
};
