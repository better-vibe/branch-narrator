/**
 * Next.js App Router route detector - detects changes under app/ directory.
 *
 * Supports Next.js 13+ App Router conventions:
 * - page.tsx/ts/jsx/js - Page components
 * - layout.tsx/ts/jsx/js - Layout components
 * - template.tsx/ts/jsx/js - Template components (re-render on navigation)
 * - default.tsx/ts/jsx/js - Parallel route fallback
 * - loading.tsx/ts/jsx/js - Loading UI (Suspense boundary)
 * - error.tsx/ts/jsx/js - Error boundaries
 * - global-error.tsx/ts/jsx/js - Root error boundary
 * - not-found.tsx/ts/jsx/js - 404 pages
 * - route.ts/tsx/js/jsx - API route handlers
 *
 * Metadata file conventions:
 * - opengraph-image / twitter-image / icon / apple-icon
 * - sitemap.ts/js, robots.ts/js, manifest.ts/js
 *
 * Also detects:
 * - Middleware files (middleware.ts/js at root or src/)
 * - Instrumentation files (instrumentation.ts/js)
 * - Next.js config files (next.config.js/mjs/ts/cjs)
 * - Parallel routes (@folder convention)
 * - Intercepting routes ((.)folder convention)
 * - Server Actions ("use server" directive)
 * - generateStaticParams / generateMetadata exports
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  FileDiff,
  FileStatus,
  Finding,
  NextConfigChangeFinding,
  NextConfigFeature,
  RouteChangeFinding,
  RouteType,
  SecurityFileFinding,
} from "../core/types.js";

// ============================================================================
// Constants
// ============================================================================

/** All JS/TS extensions used by Next.js */
const JS_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/**
 * Route file patterns (App Router).
 * Maps filename to its RouteType.
 */
const ROUTE_FILE_PATTERNS: Record<string, RouteType> = {};

// Build patterns for all extensions
const ROUTE_FILE_DEFS: Array<[string, RouteType]> = [
  ["page", "page"],
  ["layout", "layout"],
  ["template", "template"],
  ["default", "default"],
  ["loading", "loading"],
  ["error", "error"],
  ["global-error", "error"],
  ["not-found", "error"],
  ["route", "endpoint"],
];

for (const [base, type] of ROUTE_FILE_DEFS) {
  for (const ext of JS_EXTENSIONS) {
    ROUTE_FILE_PATTERNS[`${base}.${ext}`] = type;
  }
}

/**
 * Metadata file conventions that produce route-level metadata.
 * These are special route segment files that Next.js handles for SEO.
 */
const METADATA_FILE_PATTERNS: string[] = [];
const METADATA_BASES = [
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
  "sitemap",
  "robots",
  "manifest",
];

for (const base of METADATA_BASES) {
  for (const ext of JS_EXTENSIONS) {
    METADATA_FILE_PATTERNS.push(`${base}.${ext}`);
  }
  // Image files can also be static assets
  if (["opengraph-image", "twitter-image", "icon", "apple-icon"].includes(base)) {
    METADATA_FILE_PATTERNS.push(`${base}.png`);
    METADATA_FILE_PATTERNS.push(`${base}.jpg`);
    METADATA_FILE_PATTERNS.push(`${base}.jpeg`);
    METADATA_FILE_PATTERNS.push(`${base}.svg`);
    METADATA_FILE_PATTERNS.push(`${base}.gif`);
    METADATA_FILE_PATTERNS.push(`${base}.ico`);
  }
}

/** Middleware file patterns */
const MIDDLEWARE_FILES = [
  "middleware.ts",
  "middleware.js",
  "middleware.tsx",
  "middleware.jsx",
  "src/middleware.ts",
  "src/middleware.js",
  "src/middleware.tsx",
  "src/middleware.jsx",
];

/** Instrumentation file patterns (Next.js 13.2+) */
const INSTRUMENTATION_FILES = [
  "instrumentation.ts",
  "instrumentation.js",
  "src/instrumentation.ts",
  "src/instrumentation.js",
];

/** Next.js config file patterns */
const CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
];

/** HTTP method detection pattern for route handlers */
const METHOD_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

/** Server Action detection pattern ("use server" directive) */
const SERVER_ACTION_PATTERN = /["']use server["']/;

/** generateStaticParams detection */
const GENERATE_STATIC_PARAMS_PATTERN = /export\s+(?:async\s+)?function\s+generateStaticParams\s*\(/;

/** generateMetadata detection */
const GENERATE_METADATA_PATTERN = /export\s+(?:async\s+)?function\s+generateMetadata\s*\(/;

/** Metadata export object detection */
const METADATA_EXPORT_PATTERN = /export\s+const\s+metadata\s*[=:]/;

/**
 * Next.js config feature detection patterns.
 * Maps regex pattern to the feature name.
 */
const CONFIG_FEATURE_PATTERNS: Array<[RegExp, NextConfigFeature]> = [
  [/\brewrites\b/, "rewrites"],
  [/\bredirects\b/, "redirects"],
  [/\bheaders\b/, "headers"],
  [/\bimages\b/, "images"],
  [/\bi18n\b/, "i18n"],
  [/\bwebpack\b/, "webpack"],
  [/\bturbopack\b|turbo\b/, "turbopack"],
  [/\bexperimental\b/, "experimental"],
  [/\boutput\b/, "output"],
  [/\bbasePath\b/, "basePath"],
  [/\benv\b/, "env"],
  [/\bserverActions\b/, "serverActions"],
  [/\bappDir\b/, "appDir"],
  [/\bppr\b/, "ppr"],
  [/\bdynamicIO\b/, "dynamicIO"],
  [/\bserverExternalPackages\b/, "serverExternalPackages"],
  [/\btranspilePackages\b/, "transpilePackages"],
];

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a path is a Next.js App Router route file.
 */
export function isNextRouteFile(path: string): boolean {
  // Must be under app/ directory (or src/app/)
  if (!path.startsWith("app/") && !path.startsWith("src/app/")) {
    return false;
  }
  return hasRouteFilePattern(path);
}

/**
 * Check if path ends with a route file pattern.
 */
function hasRouteFilePattern(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return Object.keys(ROUTE_FILE_PATTERNS).includes(fileName);
}

/**
 * Check if a path is a Next.js metadata file convention.
 */
export function isNextMetadataFile(path: string): boolean {
  if (!path.startsWith("app/") && !path.startsWith("src/app/")) {
    return false;
  }
  const fileName = path.split("/").pop() ?? "";
  return METADATA_FILE_PATTERNS.includes(fileName);
}

/**
 * Get the route type from a file path.
 */
export function getRouteType(path: string): RouteType {
  const fileName = path.split("/").pop() ?? "";
  return ROUTE_FILE_PATTERNS[fileName] ?? "unknown";
}

/**
 * Convert a file path to a Next.js route ID.
 *
 * Rules:
 * - Strip `app/` or `src/app/` prefix
 * - Remove route groups `(name)` from URL
 * - Remove parallel route slots `@name` from URL (kept as annotation)
 * - Keep param notation: [slug], [...catchAll], [[...optional]]
 * - Keep intercepting route markers: (.), (..), (...), (..)(..)
 * - Remove file name (the route is the directory)
 */
export function pathToRouteId(path: string): string {
  // Remove app/ or src/app/ prefix
  let routeId = path
    .replace(/^src\/app/, "")
    .replace(/^app/, "");

  // Remove the file name
  const parts = routeId.split("/");
  parts.pop(); // Remove file name

  routeId = parts.join("/");

  // Remove route groups: (name) — but NOT intercepting routes like (.) (..) (...)
  // Route groups match: /(groupname) where groupname doesn't start with '.'
  routeId = routeId.replace(/\/\((?!\.)[^)]+\)/g, "");

  // Remove parallel route slots: @name
  routeId = routeId.replace(/\/@[^/]+/g, "");

  // If empty, it's the root route
  if (routeId === "" || routeId === "/") {
    return "/";
  }

  // Ensure leading slash
  if (!routeId.startsWith("/")) {
    routeId = "/" + routeId;
  }

  // Remove trailing slash (except for root)
  if (routeId.length > 1 && routeId.endsWith("/")) {
    routeId = routeId.slice(0, -1);
  }

  return routeId;
}

/**
 * Detect HTTP methods from route handler file content.
 */
export function detectMethods(diff: FileDiff): string[] {
  const methods = new Set<string>();
  const content = getAdditions(diff).join("\n");

  let match;
  const pattern = new RegExp(METHOD_PATTERN.source, "g");
  while ((match = pattern.exec(content)) !== null) {
    methods.add(match[1]);
  }

  return Array.from(methods).sort();
}

/**
 * Detect if file uses Server Actions ("use server" directive).
 */
export function hasServerActions(diff: FileDiff): boolean {
  const content = getAdditions(diff).join("\n");
  return SERVER_ACTION_PATTERN.test(content);
}

/**
 * Detect if file exports generateStaticParams.
 */
export function hasGenerateStaticParams(diff: FileDiff): boolean {
  const content = getAdditions(diff).join("\n");
  return GENERATE_STATIC_PARAMS_PATTERN.test(content);
}

/**
 * Detect if file exports generateMetadata or metadata const.
 */
export function hasMetadataExport(diff: FileDiff): boolean {
  const content = getAdditions(diff).join("\n");
  return GENERATE_METADATA_PATTERN.test(content) || METADATA_EXPORT_PATTERN.test(content);
}

/**
 * Check if a path is a Next.js middleware file.
 */
export function isMiddlewareFile(path: string): boolean {
  return MIDDLEWARE_FILES.includes(path);
}

/**
 * Check if a path is a Next.js instrumentation file.
 */
export function isInstrumentationFile(path: string): boolean {
  return INSTRUMENTATION_FILES.includes(path);
}

/**
 * Check if a path is a Next.js config file.
 */
export function isNextConfigFile(path: string): boolean {
  return CONFIG_FILES.includes(path);
}

/**
 * Detect which config features are referenced in a next.config diff.
 */
export function detectConfigFeatures(diff: FileDiff): NextConfigFeature[] {
  const content = getAdditions(diff).join("\n");
  const features: NextConfigFeature[] = [];

  for (const [pattern, feature] of CONFIG_FEATURE_PATTERNS) {
    if (pattern.test(content)) {
      features.push(feature);
    }
  }

  return features;
}

/**
 * Check if a route path contains parallel route segments.
 */
export function hasParallelSegment(path: string): boolean {
  return /@[a-zA-Z]/.test(path);
}

/**
 * Extract parallel route slot names from a path.
 * e.g. "app/@modal/photo/page.tsx" → ["modal"]
 */
export function extractParallelSlots(path: string): string[] {
  const matches = path.match(/@([a-zA-Z][a-zA-Z0-9_]*)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1)); // Remove '@'
}

/**
 * Check if a route path contains intercepting route segments.
 * Intercepting routes use: (.) (..) (...) (..)(..)
 */
export function hasInterceptingSegment(path: string): boolean {
  return /\/\(\.{1,3}\)/.test(path) || /\/\(\.\.\)\(\.\.\)/.test(path);
}

// ============================================================================
// Analyzer
// ============================================================================

export const nextRoutesAnalyzer: Analyzer = {
  name: "next-routes",
  cache: {
    includeGlobs: [
      "**/app/**",
      "**/src/app/**",
      "**/pages/**",
      "**/src/pages/**",
      "middleware.*",
      "src/middleware.*",
      "instrumentation.*",
      "src/instrumentation.*",
      "next.config.*",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const routeFiles = new Map<string, { diff?: FileDiff; status: FileStatus }>();

    // Collect route files and special files from file changes
    for (const file of changeSet.files) {
      if (isNextRouteFile(file.path) || isNextMetadataFile(file.path)) {
        routeFiles.set(file.path, { status: file.status });
      }

      // Check for middleware changes → security-file finding
      if (isMiddlewareFile(file.path)) {
        const diff = changeSet.diffs.find(d => d.path === file.path);
        const evidence = [];
        if (diff && diff.hunks.length > 0) {
          const additions = getAdditions(diff);
          if (additions.length > 0) {
            const excerpt = extractRepresentativeExcerpt(additions);
            if (excerpt) {
              evidence.push(createEvidence(file.path, excerpt));
            }
          }
        }

        const middlewareFinding: SecurityFileFinding = {
          type: "security-file",
          kind: "security-file",
          category: "routes",
          confidence: "high",
          evidence,
          files: [file.path],
          reasons: ["middleware"],
        };
        findings.push(middlewareFinding);
      }

      // Check for instrumentation file changes → security-file finding
      if (isInstrumentationFile(file.path)) {
        const diff = changeSet.diffs.find(d => d.path === file.path);
        const evidence = [];
        if (diff && diff.hunks.length > 0) {
          const additions = getAdditions(diff);
          if (additions.length > 0) {
            const excerpt = extractRepresentativeExcerpt(additions);
            if (excerpt) {
              evidence.push(createEvidence(file.path, excerpt));
            }
          }
        }

        const instrumentationFinding: SecurityFileFinding = {
          type: "security-file",
          kind: "security-file",
          category: "config_env",
          confidence: "high",
          evidence,
          files: [file.path],
          reasons: ["guard"],
        };
        findings.push(instrumentationFinding);
      }

      // Check for next.config changes → NextConfigChangeFinding
      if (isNextConfigFile(file.path)) {
        const diff = changeSet.diffs.find(d => d.path === file.path);
        const evidence = [];
        let detectedFeatures: NextConfigFeature[] = [];

        if (diff && diff.hunks.length > 0) {
          const additions = getAdditions(diff);
          if (additions.length > 0) {
            const excerpt = extractRepresentativeExcerpt(additions);
            if (excerpt) {
              evidence.push(createEvidence(file.path, excerpt));
            }
          }
          detectedFeatures = detectConfigFeatures(diff);
        }

        const configFinding: NextConfigChangeFinding = {
          type: "next-config-change",
          kind: "next-config-change",
          category: "config_env",
          confidence: "high",
          evidence,
          file: file.path,
          status: file.status,
          detectedFeatures,
        };
        findings.push(configFinding);
      }
    }

    // Add diff data for route files
    for (const diff of changeSet.diffs) {
      if (isNextRouteFile(diff.path) || isNextMetadataFile(diff.path)) {
        const existing = routeFiles.get(diff.path);
        if (existing) {
          existing.diff = diff;
        } else {
          routeFiles.set(diff.path, { diff, status: diff.status });
        }
      }
    }

    // Generate route findings
    for (const [path, { diff, status }] of routeFiles) {
      const routeId = pathToRouteId(path);
      const routeType = isNextMetadataFile(path) ? "metadata" as RouteType : getRouteType(path);

      // Extract evidence
      const evidence = [];
      if (diff && diff.hunks.length > 0) {
        const additions = getAdditions(diff);
        if (additions.length > 0) {
          const excerpt = extractRepresentativeExcerpt(additions);
          if (excerpt) {
            evidence.push(createEvidence(path, excerpt));
          }
        }
      }

      // Build tags for special route characteristics
      const tags: string[] = [];

      // Detect parallel routes
      if (hasParallelSegment(path)) {
        const slots = extractParallelSlots(path);
        for (const slot of slots) {
          tags.push(`parallel:@${slot}`);
        }
      }

      // Detect intercepting routes
      if (hasInterceptingSegment(path)) {
        tags.push("intercepting-route");
      }

      // Detect Server Actions, generateStaticParams, generateMetadata from diff
      if (diff) {
        if (hasServerActions(diff)) {
          tags.push("server-action");
        }
        if (hasGenerateStaticParams(diff)) {
          tags.push("static-params");
        }
        if (hasMetadataExport(diff)) {
          tags.push("has-metadata");
        }
      }

      const finding: RouteChangeFinding = {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence,
        routeId,
        file: path,
        change: status,
        routeType,
      };

      if (tags.length > 0) {
        finding.tags = tags;
      }

      // Detect methods for API route handlers
      if (routeType === "endpoint" && diff) {
        const methods = detectMethods(diff);
        if (methods.length > 0) {
          finding.methods = methods;
          // Add method export as evidence if available
          const methodsExcerpt = methods.map(m => `export function ${m}`).join(", ");
          if (!evidence.length) {
            evidence.push(createEvidence(path, methodsExcerpt));
          }
        }
      }

      findings.push(finding);
    }

    return findings;
  },
};
