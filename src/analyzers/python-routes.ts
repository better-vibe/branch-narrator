/**
 * Python routes analyzer - detects route/endpoint changes in Python web frameworks.
 *
 * Supports:
 * - FastAPI: @app.get(), @router.post(), APIRouter, etc.
 * - Django: path(), re_path(), url() in urls.py
 * - Flask: @app.route(), @blueprint.route()
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  FileDiff,
  FileStatus,
  Finding,
  RouteChangeFinding,
  RouteType,
} from "../core/types.js";

// HTTP methods for route detection
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// FastAPI route patterns
// Matches: @app.get("/path"), @router.post("/path"), @app.api_route("/path")
const FASTAPI_DECORATOR_PATTERN = new RegExp(
  `@\\w+\\.(${HTTP_METHODS.join("|")}|api_route)\\s*\\(\\s*["']([^"']+)["']`,
  "gi"
);

// Django URL patterns
// Matches: path('route/', view), re_path(r'^route/$', view), url(r'^route/$', view)
const DJANGO_PATH_PATTERN = /(?:path|re_path|url)\s*\(\s*(?:r)?["']([^"']+)["']/gi;

// Flask route patterns
// Matches: @app.route("/path"), @blueprint.route("/path", methods=["GET", "POST"])
const FLASK_ROUTE_PATTERN = /@\w+\.route\s*\(\s*["']([^"']+)["'](?:.*?methods\s*=\s*\[([^\]]+)\])?/gi;

// File patterns for framework detection
const FASTAPI_FILE_PATTERNS = [
  /routers?\.py$/,
  /endpoints?\.py$/,
  /api\.py$/,
  /main\.py$/,
  /app\.py$/,
  /routes?\.py$/,
];

const DJANGO_FILE_PATTERNS = [
  /urls\.py$/,
  /views\.py$/,
];

const FLASK_FILE_PATTERNS = [
  /views?\.py$/,
  /routes?\.py$/,
  /app\.py$/,
  /api\.py$/,
  /__init__\.py$/,
];

/**
 * Detect framework type from file path.
 */
function detectFramework(path: string, content: string): "fastapi" | "django" | "flask" | null {
  const fileName = path.split("/").pop() ?? "";

  // Check Django first (most specific file pattern)
  if (/urls\.py$/.test(fileName)) {
    return "django";
  }

  // Check content for imports to determine framework
  if (content.includes("from fastapi") || content.includes("import fastapi") || content.includes("APIRouter")) {
    return "fastapi";
  }

  if (content.includes("from django") || content.includes("urlpatterns")) {
    return "django";
  }

  if (content.includes("from flask") || content.includes("Flask(") || content.includes("Blueprint(")) {
    return "flask";
  }

  // Fall back to file pattern matching
  for (const pattern of DJANGO_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return "django";
    }
  }

  for (const pattern of FASTAPI_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return "fastapi";
    }
  }

  for (const pattern of FLASK_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return "flask";
    }
  }

  return null;
}

/**
 * Check if a file could contain Python routes.
 */
export function isPythonRouteFile(path: string): boolean {
  if (!path.endsWith(".py")) {
    return false;
  }

  const fileName = path.split("/").pop() ?? "";
  const allPatterns = [
    ...FASTAPI_FILE_PATTERNS,
    ...DJANGO_FILE_PATTERNS,
    ...FLASK_FILE_PATTERNS,
  ];

  return allPatterns.some(pattern => pattern.test(fileName));
}

/**
 * Extract FastAPI routes from content.
 */
function extractFastAPIRoutes(content: string): Array<{ path: string; methods: string[] }> {
  const routes: Array<{ path: string; methods: string[] }> = [];
  const pattern = new RegExp(FASTAPI_DECORATOR_PATTERN.source, "gi");

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const method = match[1].toLowerCase();
    const routePath = match[2];

    // api_route can have multiple methods, but we detect from decorator
    const methods = method === "api_route" ? ["GET"] : [method.toUpperCase()];

    routes.push({ path: routePath, methods });
  }

  return routes;
}

/**
 * Extract Django URL patterns from content.
 */
function extractDjangoRoutes(content: string): Array<{ path: string; methods: string[] }> {
  const routes: Array<{ path: string; methods: string[] }> = [];
  const pattern = new RegExp(DJANGO_PATH_PATTERN.source, "gi");

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const routePath = match[1];
    // Django doesn't specify methods in URL config, they're in views
    routes.push({ path: routePath, methods: [] });
  }

  return routes;
}

/**
 * Extract Flask routes from content.
 */
function extractFlaskRoutes(content: string): Array<{ path: string; methods: string[] }> {
  const routes: Array<{ path: string; methods: string[] }> = [];
  const pattern = new RegExp(FLASK_ROUTE_PATTERN.source, "gi");

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const routePath = match[1];
    const methodsStr = match[2];

    let methods: string[] = ["GET"]; // Default Flask method
    if (methodsStr) {
      // Parse methods from ["GET", "POST"] format
      methods = methodsStr
        .replace(/["']/g, "")
        .split(",")
        .map(m => m.trim().toUpperCase())
        .filter(m => m.length > 0);
    }

    routes.push({ path: routePath, methods });
  }

  return routes;
}

/**
 * Extract routes based on framework.
 */
function extractRoutes(content: string, framework: "fastapi" | "django" | "flask"): Array<{ path: string; methods: string[] }> {
  switch (framework) {
    case "fastapi":
      return extractFastAPIRoutes(content);
    case "django":
      return extractDjangoRoutes(content);
    case "flask":
      return extractFlaskRoutes(content);
  }
}

/**
 * Determine route type based on framework and path.
 */
function getRouteType(_framework: string, _path: string): RouteType {
  // Python frameworks typically have endpoints, not pages
  return "endpoint";
}

/**
 * Convert Python route path to a normalized route ID.
 */
function pathToRouteId(routePath: string, framework: string): string {
  let normalized = routePath;

  // Remove regex markers for Django
  if (framework === "django") {
    normalized = normalized.replace(/^\^/, "").replace(/\$$/, "");
    // Convert Django regex patterns to path-like format
    normalized = normalized.replace(/\(\?P<(\w+)>[^)]+\)/g, ":{$1}");
  }

  // Ensure leading slash
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export const pythonRoutesAnalyzer: Analyzer = {
  name: "python-routes",
  cacheScope: "files",
  filePatterns: [
    "**/routes.py",
    "**/router.py",
    "**/routers.py",
    "**/api.py",
    "**/endpoints.py",
    "**/urls.py",
    "**/views.py",
    "**/app.py",
    "**/main.py",
  ],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const routeFiles = new Map<string, { diff?: FileDiff; status: FileStatus }>();

    // Collect potential route files
    for (const file of changeSet.files) {
      if (isPythonRouteFile(file.path)) {
        routeFiles.set(file.path, { status: file.status });
      }
    }

    // Add diff data
    for (const diff of changeSet.diffs) {
      if (isPythonRouteFile(diff.path)) {
        const existing = routeFiles.get(diff.path);
        if (existing) {
          existing.diff = diff;
        } else {
          routeFiles.set(diff.path, { diff, status: diff.status });
        }
      }
    }

    // Process each route file
    for (const [path, { diff }] of routeFiles) {
      if (!diff) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);
      const addedContent = additions.join("\n");
      const removedContent = deletions.join("\n");

      // Detect framework from additions or file path
      const framework = detectFramework(path, addedContent) ?? detectFramework(path, removedContent);
      if (!framework) {
        continue;
      }

      // Extract routes from additions and deletions
      const addedRoutes = extractRoutes(addedContent, framework);
      const removedRoutes = extractRoutes(removedContent, framework);

      // Track processed routes to avoid duplicates
      const processedRoutes = new Set<string>();

      // Process added routes
      for (const route of addedRoutes) {
        const routeId = pathToRouteId(route.path, framework);
        if (processedRoutes.has(routeId)) {
          continue;
        }
        processedRoutes.add(routeId);

        // Check if this route was removed (modified) or truly new
        const wasRemoved = removedRoutes.some(r => pathToRouteId(r.path, framework) === routeId);
        const change: FileStatus = wasRemoved ? "modified" : "added";

        const evidence = [];
        const excerpt = additions.find(l => l.includes(route.path));
        if (excerpt) {
          evidence.push(createEvidence(path, excerpt));
        }

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence,
          routeId,
          file: path,
          change,
          routeType: getRouteType(framework, route.path),
          methods: route.methods.length > 0 ? route.methods : undefined,
        };

        findings.push(finding);
      }

      // Process removed routes (that weren't re-added)
      for (const route of removedRoutes) {
        const routeId = pathToRouteId(route.path, framework);
        if (processedRoutes.has(routeId)) {
          continue;
        }
        processedRoutes.add(routeId);

        const evidence = [];
        const excerpt = deletions.find(l => l.includes(route.path));
        if (excerpt) {
          evidence.push(createEvidence(path, excerpt));
        }

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence,
          routeId,
          file: path,
          change: "deleted",
          routeType: getRouteType(framework, route.path),
          methods: route.methods.length > 0 ? route.methods : undefined,
        };

        findings.push(finding);
      }
    }

    return findings;
  },
};
