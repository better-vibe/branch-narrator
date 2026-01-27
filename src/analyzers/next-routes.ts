/**
 * Next.js App Router route detector - detects changes under app/ directory.
 *
 * Supports Next.js 13+ App Router conventions:
 * - page.tsx/ts/jsx/js - Page components
 * - layout.tsx/ts - Layout components
 * - loading.tsx/ts - Loading UI
 * - error.tsx/ts - Error boundaries
 * - not-found.tsx/ts - 404 pages
 * - route.ts/tsx - API route handlers
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  FileDiff,
  FileStatus,
  Finding,
  RouteChangeFinding,
  RouteType,
  SecurityFileFinding,
} from "../core/types.js";

// Route file patterns (App Router)
const ROUTE_FILE_PATTERNS: Record<string, RouteType> = {
  "page.tsx": "page",
  "page.ts": "page",
  "page.jsx": "page",
  "page.js": "page",
  "layout.tsx": "layout",
  "layout.ts": "layout",
  "layout.jsx": "layout",
  "layout.js": "layout",
  "loading.tsx": "page",
  "loading.ts": "page",
  "loading.jsx": "page",
  "loading.js": "page",
  "error.tsx": "error",
  "error.ts": "error",
  "error.jsx": "error",
  "error.js": "error",
  "not-found.tsx": "error",
  "not-found.ts": "error",
  "not-found.jsx": "error",
  "not-found.js": "error",
  "route.ts": "endpoint",
  "route.tsx": "endpoint",
  "route.js": "endpoint",
  "route.jsx": "endpoint",
};

// Middleware file patterns
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

// Next.js config file patterns
const CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
];

// HTTP method detection pattern for route handlers
const METHOD_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

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
 * - Keep param notation: [slug], [[...catchAll]]
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

  // Remove route groups: (name)
  routeId = routeId.replace(/\/\([^)]+\)/g, "");

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
 * Check if a path is a Next.js middleware file.
 */
export function isMiddlewareFile(path: string): boolean {
  return MIDDLEWARE_FILES.includes(path);
}

/**
 * Check if a path is a Next.js config file.
 */
export function isNextConfigFile(path: string): boolean {
  return CONFIG_FILES.includes(path);
}

export const nextRoutesAnalyzer: Analyzer = {
  name: "next-routes",
  cache: { includeGlobs: ["**/app/**", "**/src/app/**", "**/pages/**", "**/src/pages/**", "middleware.*", "src/middleware.*", "next.config.*"] },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const routeFiles = new Map<string, { diff?: FileDiff; status: FileStatus }>();

    // Collect route files from file changes
    for (const file of changeSet.files) {
      if (isNextRouteFile(file.path)) {
        routeFiles.set(file.path, { status: file.status });
      }

      // Check for middleware changes
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
    }

    // Add diff data for route files
    for (const diff of changeSet.diffs) {
      if (isNextRouteFile(diff.path)) {
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
      const routeType = getRouteType(path);

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
