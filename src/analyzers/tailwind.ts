/**
 * Tailwind CSS configuration change detector.
 *
 * Detects changes to Tailwind CSS configuration files and identifies
 * potentially breaking changes to themes, plugins, or content paths.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TailwindConfigFinding,
  Confidence,
} from "../core/types.js";

// Tailwind config file patterns
const TAILWIND_PATTERNS = [
  /^tailwind\.config\.(js|cjs|mjs|ts)$/,
  /\/tailwind\.config\.(js|cjs|mjs|ts)$/,
];

// PostCSS config (often related to Tailwind)
const POSTCSS_PATTERNS = [
  /^postcss\.config\.(js|cjs|mjs)$/,
  /\/postcss\.config\.(js|cjs|mjs)$/,
];

// Critical configuration sections
const CRITICAL_SECTIONS = [
  "theme",
  "content",
  "plugins",
  "presets",
  "prefix",
  "important",
  "darkMode",
  "safelist",
];

// Theme subsections that affect styling
const THEME_SECTIONS = [
  "colors",
  "spacing",
  "screens",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "extend",
  "borderRadius",
  "boxShadow",
  "animation",
  "keyframes",
];

/**
 * Check if a file is a Tailwind config file.
 */
export function isTailwindConfig(path: string): boolean {
  return TAILWIND_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a PostCSS config file.
 */
export function isPostCSSConfig(path: string): boolean {
  return POSTCSS_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Extract affected sections from diff content.
 */
function extractAffectedSections(content: string[]): string[] {
  const sections = new Set<string>();
  const fullContent = content.join("\n");

  // Check for critical section changes
  for (const section of CRITICAL_SECTIONS) {
    const pattern = new RegExp(`\\b${section}\\s*[:{]`, "i");
    if (pattern.test(fullContent)) {
      sections.add(section);
    }
  }

  // Check for theme subsection changes
  for (const section of THEME_SECTIONS) {
    const pattern = new RegExp(`\\b${section}\\s*[:{]`, "i");
    if (pattern.test(fullContent)) {
      sections.add(`theme.${section}`);
    }
  }

  return Array.from(sections);
}

/**
 * Check for potentially breaking changes.
 */
function detectBreakingChanges(
  additions: string[],
  deletions: string[]
): { isBreaking: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const addedContent = additions.join("\n");
  const deletedContent = deletions.join("\n");

  // Content paths changed (can break purging)
  if (/\bcontent\s*[:{]/.test(deletedContent) || /\bcontent\s*[:{]/.test(addedContent)) {
    if (deletions.length > 0) {
      reasons.push("Content paths modified (may affect CSS purging)");
    }
  }

  // Prefix changed (breaks all existing class usage)
  if (/\bprefix\s*[:{]/.test(deletedContent) && /\bprefix\s*[:{]/.test(addedContent)) {
    reasons.push("Class prefix changed (requires updating all class names)");
  }

  // Theme colors removed
  if (/colors\s*[:{]/.test(deletedContent)) {
    reasons.push("Theme colors modified (may break existing color classes)");
  }

  // Screen breakpoints changed
  if (/screens\s*[:{]/.test(deletedContent)) {
    reasons.push("Screen breakpoints modified (may affect responsive design)");
  }

  // Plugins removed
  if (/plugins\s*[:{]/.test(deletedContent) && deletions.some((l) => l.includes("require("))) {
    reasons.push("Plugins removed (may remove utility classes)");
  }

  // Dark mode strategy changed
  if (/darkMode\s*[:{]/.test(deletedContent) || /darkMode\s*[:{]/.test(addedContent)) {
    reasons.push("Dark mode configuration changed");
  }

  return {
    isBreaking: reasons.length > 0,
    reasons,
  };
}

/**
 * Check if the project uses Tailwind based on package.json dependencies.
 */
function hasTailwindDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.["tailwindcss"] || devDeps?.["tailwindcss"]);
}

/**
 * Check if any Tailwind/PostCSS config files are in the changeset.
 */
function hasTailwindFiles(changeSet: ChangeSet): boolean {
  return (
    changeSet.files.some((f) => isTailwindConfig(f.path) || isPostCSSConfig(f.path)) ||
    changeSet.diffs.some((d) => isTailwindConfig(d.path) || isPostCSSConfig(d.path))
  );
}

export const tailwindAnalyzer: Analyzer = {
  name: "tailwind",
  cache: { includeGlobs: ["**/tailwind.config.*", "**/postcss.config.*"] },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Tailwind and no Tailwind files changed
    if (!hasTailwindDependency(changeSet) && !hasTailwindFiles(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const isTailwind = isTailwindConfig(diff.path);
      const isPostCSS = isPostCSSConfig(diff.path);

      if (!isTailwind && !isPostCSS) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const affectedSections = extractAffectedSections([...additions, ...deletions]);
      const { isBreaking, reasons } = detectBreakingChanges(additions, deletions);

      const confidence: Confidence = isBreaking ? "high" : affectedSections.length > 0 ? "medium" : "low";

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const finding: TailwindConfigFinding = {
        type: "tailwind-config",
        kind: "tailwind-config",
        category: "config_env",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        configType: isTailwind ? "tailwind" : "postcss",
        isBreaking,
        affectedSections,
        breakingReasons: reasons,
      };

      findings.push(finding);
    }

    return findings;
  },
};
