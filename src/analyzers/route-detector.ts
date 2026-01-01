/**
 * SvelteKit route detector - detects changes under src/routes.
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
} from "../core/types.js";

// Route file patterns
const ROUTE_FILE_PATTERNS: Record<string, RouteType> = {
  "+page.svelte": "page",
  "+page.ts": "page",
  "+page.server.ts": "page",
  "+layout.svelte": "layout",
  "+layout.ts": "layout",
  "+layout.server.ts": "layout",
  "+server.ts": "endpoint",
  "+error.svelte": "error",
};

// HTTP method detection pattern
const METHOD_PATTERN = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

/**
 * Check if a path is a SvelteKit route file.
 */
export function isRouteFile(path: string): boolean {
  return path.startsWith("src/routes/") && hasRouteFilePattern(path);
}

/**
 * Check if path ends with a route file pattern.
 */
function hasRouteFilePattern(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return Object.keys(ROUTE_FILE_PATTERNS).some((pattern) =>
    fileName.startsWith(pattern.replace(".svelte", "").replace(".ts", "")) &&
    (fileName.endsWith(".svelte") || fileName.endsWith(".ts"))
  );
}

/**
 * Get the route type from a file path.
 */
export function getRouteType(path: string): RouteType {
  const fileName = path.split("/").pop() ?? "";
  for (const [pattern, type] of Object.entries(ROUTE_FILE_PATTERNS)) {
    if (fileName === pattern) {
      return type;
    }
  }
  return "unknown";
}

/**
 * Convert a file path to a SvelteKit route ID.
 *
 * Rules:
 * - Strip `src/routes` prefix
 * - Remove route groups `(name)` from URL (but keep in route ID)
 * - Keep param notation: [slug], [[id]], [...rest]
 * - Remove file name (the route is the directory)
 */
export function pathToRouteId(path: string): string {
  // Remove src/routes prefix
  let routeId = path.replace(/^src\/routes/, "");

  // Remove the file name
  const parts = routeId.split("/");
  parts.pop(); // Remove file name

  routeId = parts.join("/");

  // If empty, it's the root route
  if (routeId === "" || routeId === "/") {
    return "/";
  }

  // Ensure leading slash
  if (!routeId.startsWith("/")) {
    routeId = "/" + routeId;
  }

  return routeId;
}

/**
 * Convert route ID to URL path (for display).
 * Removes route groups from the path.
 */
export function routeIdToUrlPath(routeId: string): string {
  // Remove route groups: (name)
  return routeId.replace(/\/\([^)]+\)/g, "");
}

/**
 * Detect HTTP methods from endpoint file content.
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

export const routeDetectorAnalyzer: Analyzer = {
  name: "route-detector",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const routeFiles = new Map<string, { diff?: FileDiff; status: FileStatus }>();

    // Collect route files from file changes
    for (const file of changeSet.files) {
      if (isRouteFile(file.path)) {
        routeFiles.set(file.path, { status: file.status });
      }
    }

    // Add diff data
    for (const diff of changeSet.diffs) {
      if (isRouteFile(diff.path)) {
        const existing = routeFiles.get(diff.path);
        if (existing) {
          existing.diff = diff;
        } else {
          routeFiles.set(diff.path, { diff, status: diff.status });
        }
      }
    }

    // Generate findings
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

      // Detect methods for endpoints
      if (routeType === "endpoint" && diff) {
        const methods = detectMethods(diff);
        if (methods.length > 0) {
          finding.methods = methods;
          // Add method export as evidence if available
          const methodsExcerpt = methods.map(m => `export const ${m}`).join(", ");
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

