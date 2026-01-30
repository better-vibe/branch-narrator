/**
 * Vite configuration change detector.
 *
 * Detects changes to Vite configuration files and identifies
 * potentially impactful changes to build settings, plugins, or optimization.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  ViteConfigFinding,
  Confidence,
} from "../core/types.js";

// Vite config file patterns (only root-level config files)
const VITE_CONFIG_PATTERNS = [
  /^vite\.config\.(js|cjs|mjs|ts|mts)$/,
];

// Critical configuration sections that affect build output
const CRITICAL_SECTIONS = [
  "build",
  "server",
  "preview",
  "resolve",
  "plugins",
  "define",
  "base",
  "publicDir",
  "envPrefix",
  "optimizeDeps",
  "esbuild",
  "ssr",
];

// Build subsections that affect production output
const BUILD_SECTIONS = [
  "target",
  "outDir",
  "assetsDir",
  "assetsInlineLimit",
  "cssCodeSplit",
  "sourcemap",
  "minify",
  "rollupOptions",
  "lib",
  "manifest",
  "cssMinify",
  "modulePreload",
  "chunkSizeWarningLimit",
];

// Server sections that affect development
const SERVER_SECTIONS = [
  "host",
  "port",
  "proxy",
  "cors",
  "https",
  "hmr",
  "watch",
  "middlewareMode",
];

/**
 * Check if a file is a Vite config file.
 */
export function isViteConfig(path: string): boolean {
  return VITE_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
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

  // Check for build subsection changes
  for (const section of BUILD_SECTIONS) {
    const pattern = new RegExp(`\\b${section}\\s*[:{]`, "i");
    if (pattern.test(fullContent)) {
      sections.add(`build.${section}`);
    }
  }

  // Check for server subsection changes
  for (const section of SERVER_SECTIONS) {
    const pattern = new RegExp(`\\b${section}\\s*[:{]`, "i");
    if (pattern.test(fullContent)) {
      sections.add(`server.${section}`);
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

  // Base path changed (affects all asset URLs)
  if (/\bbase\s*[:{]/.test(deletedContent) || /\bbase\s*[:{]/.test(addedContent)) {
    if (deletions.length > 0 && additions.length > 0) {
      reasons.push("Base path changed (affects all asset URLs)");
    }
  }

  // Output directory changed
  if (/\boutDir\s*[:{]/.test(deletedContent) || /\boutDir\s*[:{]/.test(addedContent)) {
    reasons.push("Output directory changed (may affect deployment)");
  }

  // Build target changed
  if (/\btarget\s*[:{]/.test(deletedContent) || /\btarget\s*[:{]/.test(addedContent)) {
    reasons.push("Build target changed (affects browser compatibility)");
  }

  // Plugins removed
  if (/plugins\s*[:{]/.test(deletedContent) && deletions.some((l) => l.includes("import(") || l.includes("require("))) {
    reasons.push("Plugins modified (may affect build behavior)");
  }

  // Resolve aliases changed
  if (/resolve\s*[:{]/.test(deletedContent) && /alias\s*[:{]/.test(deletedContent)) {
    reasons.push("Path aliases modified (may break imports)");
  }

  // Environment prefix changed
  if (/\benvPrefix\s*[:{]/.test(deletedContent) || /\benvPrefix\s*[:{]/.test(addedContent)) {
    reasons.push("Environment prefix changed (affects env variable exposure)");
  }

  // Define constants changed
  if (/\bdefine\s*[:{]/.test(deletedContent)) {
    reasons.push("Build-time constants modified");
  }

  // Sourcemap settings changed
  if (/\bsourcemap\s*[:{]/.test(addedContent) || /\bsourcemap\s*[:{]/.test(deletedContent)) {
    reasons.push("Sourcemap configuration changed");
  }

  // SSR configuration changed
  if (/\bssr\s*[:{]/.test(deletedContent) || /\bssr\s*[:{]/.test(addedContent)) {
    reasons.push("SSR configuration changed (affects server rendering)");
  }

  return {
    isBreaking: reasons.length > 0,
    reasons,
  };
}

/**
 * Detect plugins being added or removed.
 */
function detectPluginChanges(
  additions: string[],
  deletions: string[]
): string[] {
  const plugins: string[] = [];
  const allContent = [...additions, ...deletions].join("\n");

  // Common Vite plugins
  const pluginPatterns = [
    { pattern: /@vitejs\/plugin-react/, name: "React" },
    { pattern: /@vitejs\/plugin-vue/, name: "Vue" },
    { pattern: /@vitejs\/plugin-vue-jsx/, name: "Vue JSX" },
    { pattern: /@vitejs\/plugin-legacy/, name: "Legacy Browser Support" },
    { pattern: /@sveltejs\/vite-plugin-svelte/, name: "Svelte" },
    { pattern: /vite-plugin-pwa/, name: "PWA" },
    { pattern: /vite-tsconfig-paths/, name: "TypeScript Paths" },
    { pattern: /vitest/, name: "Vitest" },
    { pattern: /@angular\/build/, name: "Angular" },
    { pattern: /vite-plugin-solid/, name: "Solid" },
    { pattern: /vite-plugin-qwik/, name: "Qwik" },
  ];

  for (const { pattern, name } of pluginPatterns) {
    if (pattern.test(allContent)) {
      plugins.push(name);
    }
  }

  return plugins;
}

/**
 * Check if the project uses Vite based on package.json dependencies.
 */
function hasViteDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.["vite"] || devDeps?.["vite"]);
}

/**
 * Check if any Vite config files are in the changeset.
 */
function hasViteFiles(changeSet: ChangeSet): boolean {
  return (
    changeSet.files.some((f) => isViteConfig(f.path)) ||
    changeSet.diffs.some((d) => isViteConfig(d.path))
  );
}

export const viteConfigAnalyzer: Analyzer = {
  name: "vite-config",
  cache: { includeGlobs: ["**/vite.config.*", "**/vitest.config.*"] },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Vite and no Vite config files changed
    if (!hasViteDependency(changeSet) && !hasViteFiles(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isViteConfig(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const affectedSections = extractAffectedSections([...additions, ...deletions]);
      const { isBreaking, reasons } = detectBreakingChanges(additions, deletions);
      const pluginsDetected = detectPluginChanges(additions, deletions);

      const confidence: Confidence = isBreaking ? "high" : affectedSections.length > 0 ? "medium" : "low";

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const finding: ViteConfigFinding = {
        type: "vite-config",
        kind: "vite-config",
        category: "config_env",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        affectedSections,
        breakingReasons: reasons,
        pluginsDetected,
      };

      findings.push(finding);
    }

    return findings;
  },
};
